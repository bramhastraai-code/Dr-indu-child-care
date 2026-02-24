const Patient = require('../../models/Patient');
const MRD = require('../../models/MRD');
const BotSession = require('../../models/BotSession');
const Appointment = require('../../models/Appointment');
const audit = require('../../utils/audit');
const { normalizePhone, normalizeWaId } = require('../../utils/helpers');
const { hashField, decrypt } = require('../../utils/encryption');

// Helper: parse DD/MM/YYYY or YYYY-MM-DD → Date
const parseDOB = (raw) => {
    if (!raw) return null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
        const [d, m, y] = raw.split('/');
        return new Date(`${y}-${m}-${d}`);
    }
    return new Date(raw);
};

// Helper: generate next patient_id  e.g. DICC-2026-0001
const generatePatientId = async () => {
    const year = new Date().getFullYear();
    const prefix = `DICC-${year}-`;
    const last = await Patient.findOne({ patient_id: { $regex: `^${prefix}` } })
        .sort({ patient_id: -1 });
    const seq = last
        ? parseInt(last.patient_id.replace(prefix, ''), 10) + 1
        : 1;
    return `${prefix}${seq.toString().padStart(4, '0')}`;
};

// @desc    Register a new patient
// @route   POST /api/patients
// @access  Public / Private
exports.registerPatient = async (req, res) => {
    try {
        const {
            child_name,
            parent_name,
            wa_id,
            mobile,  // fallback
            email,
            dob,
            gender,
            address,
            registration_source
        } = req.body || {};

        const raw_wa_id = wa_id || mobile;
        const final_wa_id = normalizeWaId(raw_wa_id);
        const wa_hash = hashField(normalizePhone(raw_wa_id));

        // Check duplicate by wa_hash AND child_name (siblings share wa_id but have different names)
        const existing = await Patient.findOne({
            wa_hash,
            child_name: { $regex: new RegExp(`^${child_name}$`, 'i') },
            is_deleted: false
        });
        if (existing) {
            return res.status(409).json({
                success: false,
                error_code: 'PATIENT_EXISTS',
                message: 'This child is already registered with this mobile number',
                patient_id: existing.patient_id
            });
        }

        const patient_id = await generatePatientId();

        const patient = await Patient.create({
            patient_id,
            wa_id: final_wa_id,
            child_name,
            parent_name,
            wa_hash,
            gender: gender || null,
            dob: dob ? new Date(dob) : null,
            email: email || null,
            address: address || null,
            registration_source: (registration_source || 'dashboard').toLowerCase()
        });

        // Create blank MRD shell
        await MRD.create({ patient_id, entries: [], vaccination_history: [] });

        // Link patient_id to active bot session if applicable
        await BotSession.updateMany(
            { wa_id: final_wa_id, is_active: true },
            { $set: { patient_id } }
        );

        const actor = req.user ? req.user.username : 'SYSTEM';
        const actor_role = req.user ? req.user.role : 'bot_service';

        // Audit log
        await audit({
            event_type: 'PATIENT_REGISTERED',
            entity_type: 'patient',
            entity_id: patient_id,
            actor,
            actor_type: actor_role,
            meta: { child_name, registration_source }
        });

        res.status(201).json({ success: true, data: patient });

    } catch (err) {
        res.status(500).json({ success: false, error_code: 'SERVER_ERROR', message: err.message });
    }
};

// @desc    Register a new patient from whatsapp
exports.registerFromWhatsapp = async (req, res) => {
    if (!req.body) req.body = {};
    req.body.registration_source = 'whatsapp';
    return exports.registerPatient(req, res);
};

// @desc    Register a new patient from form
exports.registerFromForm = async (req, res) => {
    if (!req.body) req.body = {};
    req.body.registration_source = 'form';
    return exports.registerPatient(req, res);
};

// @desc    Lookup patient by mobile
exports.getPatientByMobile = async (req, res) => {
    try {
        const raw = req.params.mobile || req.params.wa_id;
        const normalized = normalizeWaId(raw);
        const wa_hash = hashField(normalizePhone(raw));

        const patient = await Patient.findOne({
            $or: [{ wa_hash }, { wa_id: normalized }],
            is_deleted: false
        });

        if (!patient) {
            return res.status(404).json({ success: false, error_code: 'PATIENT_NOT_FOUND', message: 'Patient not found' });
        }

        const stats = await Appointment.aggregate([
            { $match: { patient_id: patient.patient_id } },
            { $group: { _id: null, count: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            data: {
                ...patient.toObject(),
                total_appointments: stats[0]?.count || 0
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error_code: 'INTERNAL_ERROR', message: err.message });
    }
};

// @desc    Get patient by patient_id
exports.getPatientById = async (req, res) => {
    try {
        const patient = await Patient.findOne({ patient_id: req.params.patient_id, is_deleted: false });

        if (!patient) {
            return res.status(404).json({ success: false, error_code: 'PATIENT_NOT_FOUND', message: 'Patient not found' });
        }

        const [total_appointments, last_appt] = await Promise.all([
            Appointment.countDocuments({ patient_id: patient.patient_id }),
            Appointment.findOne({ patient_id: patient.patient_id })
                .sort({ appointment_date: -1 })
                .select('appointment_date')
        ]);

        res.status(200).json({
            success: true,
            data: {
                ...patient.toObject(),
                total_appointments,
                last_appointment_date: last_appt ? last_appt.appointment_date : null
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error_code: 'INTERNAL_ERROR', message: err.message });
    }
};

// @desc    Get all patients
exports.getPatients = async (req, res) => {
    try {
        let { page = 1, limit = 20, search, source, status } = req.query;
        page = parseInt(page, 10);
        limit = parseInt(limit, 10);
        const skip = (page - 1) * limit;

        const query = { is_deleted: false };

        if (search) {
            const searchHash = hashField(normalizePhone(search));
            const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            query.$or = [
                { child_name: regex },
                { parent_name: regex },
                { patient_id: regex },
                { wa_hash: searchHash }
            ];
        }

        if (source) query.registration_source = source.toLowerCase();
        if (status) query.registration_status = status.toUpperCase();

        const [patients, total] = await Promise.all([
            Patient.find(query)
                .sort({ registered_at: -1 })
                .skip(skip)
                .limit(limit),
            Patient.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            count: patients.length,
            total,
            pagination: { page, limit, pages: Math.ceil(total / limit) },
            data: patients
        });
    } catch (err) {
        res.status(500).json({ success: false, error_code: 'INTERNAL_ERROR', message: err.message });
    }
};

// @desc    Update patient details
exports.updatePatient = async (req, res) => {
    try {
        const { patient_id } = req.params;
        const updates = req.body || {};
        const actor = req.user ? req.user.username : 'ADMIN';

        delete updates.patient_id;
        delete updates.registered_at;
        delete updates._id;

        const patient = await Patient.findOneAndUpdate(
            { patient_id, is_deleted: false },
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!patient) {
            return res.status(404).json({ success: false, error_code: 'PATIENT_NOT_FOUND', message: 'Patient not found' });
        }

        await audit({
            event_type: 'PATIENT_UPDATED',
            entity_type: 'patient',
            entity_id: patient_id,
            actor,
            actor_type: req.user ? req.user.role : 'ADMIN',
            new_value: updates
        });

        res.json({ success: true, message: 'Patient updated successfully', data: patient });
    } catch (err) {
        res.status(500).json({ success: false, error_code: 'INTERNAL_ERROR', message: err.message });
    }
};
