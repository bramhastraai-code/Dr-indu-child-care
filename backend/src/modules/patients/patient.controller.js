const Patient = require('../../models/Patient');
const MRD = require('../../models/MRD');
const BotSession = require('../../models/BotSession');
const Appointment = require('../../models/Appointment');
const audit = require('../../utils/audit');
const { normalizePhone, normalizeWaId, normalizeGender } = require('../../utils/helpers');
const { hashField, decrypt } = require('../../utils/encryption');
const { getDoctorIdFromSession, ensureDoctorSessionHasProfile } = require('../../utils/doctorScope');
const { generatePatientKey } = require('../../utils/patientKey');
const { triggerWebhook } = require('../../services/webhookService');
const LegacyPatientMap = require('../../models/LegacyPatientMap');
const Prescription = require('../../models/Prescription');
const Vaccination = require('../../models/Vaccination');
const ChildHistory = require('../../models/ChildHistory');
const Feedback = require('../../models/Feedback');

const resolvePatientKey = async (id) => {
    const byKey = await Patient.findOne({ patient_key: id, is_deleted: false }).select('patient_key').lean();
    if (byKey?.patient_key) return byKey.patient_key;
    const byPatientId = await Patient.findOne({ patient_id: id, is_deleted: false }).select('patient_key').lean();
    return byPatientId?.patient_key || null;
};
// Helper: parse DD/MM/YYYY or YYYY-MM-DD to Date
const parseDOB = (raw) => {
    if (!raw) return null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
        const [d, m, y] = raw.split('/');
        const parsed = new Date(`${y}-${m}-${d}`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// Helper: generate next patient_id  e.g. 26-AA1
const generatePatientId = async (firstName, lastName, childName) => {
    const year = new Date().getFullYear().toString().slice(-2);

    let fInitial = 'A';
    let lInitial = 'A';

    if (firstName && firstName.trim()) {
        fInitial = firstName.trim().charAt(0).toUpperCase();
    }
    if (lastName && lastName.trim()) {
        lInitial = lastName.trim().charAt(0).toUpperCase();
    } else if (childName && childName.trim()) {
        const parts = childName.trim().split(/\s+/);
        if (parts.length >= 1 && (!firstName || !firstName.trim())) {
            fInitial = parts[0].charAt(0).toUpperCase();
        }
        if (parts.length >= 2) {
            lInitial = parts[parts.length - 1].charAt(0).toUpperCase();
        } else if (parts.length === 1 && (!lastName || !lastName.trim())) {
            lInitial = parts[0].length > 1 ? parts[0].charAt(1).toUpperCase() : parts[0].charAt(0).toUpperCase();
        }
    }

    const initials = `${fInitial}${lInitial}`;
    const prefix = `${year}-${initials}`;

    const existingPatients = await Patient.find({
        patient_key: { $regex: `^${prefix}\\d+$` }
    }).select('patient_key').lean();

    let maxSeq = 0;
    existingPatients.forEach(p => {
        const seqPart = p.patient_key.slice(prefix.length);
        const seqNum = parseInt(seqPart, 10);
        if (!isNaN(seqNum) && seqNum > maxSeq) {
            maxSeq = seqNum;
        }
    });

    const nextSeq = maxSeq + 1;
    const seqStr = `${nextSeq}`;
    return `${prefix}${seqStr}`;
};

const getScopedPatientIdFilter = async (req) => {
    return null;
};

const ensureDoctorCanAccessPatient = async (req, res, patientId, message = 'Access denied for this patient profile') => {
    return true;
};

// @desc    Register a new patient
// @route   POST /api/patients
// @access  Public / Private
exports.registerPatient = async (req, res, next) => {
    try {
        const {
            // Core
            child_name,
            parent_name,
            wa_id,
            mobile,
            registration_source,

            // Personal
            salutation,
            first_name,
            middle_name,
            last_name,
            gender,
            dob,

            // Registration
            registration_date,

            // Parent / Guardian
            father_name,
            mother_name,
            parent_mobile,
            communication_preference,

            // Address
            state,
            city,
            pincode,
            residential_address,
            address,

            // Doctor
            doctor,

            // Status
            is_active,
        } = req.body || {};

        // 1. Resolve Child Name
        let final_child_name = child_name;
        if (!final_child_name && first_name) {
            final_child_name = [first_name, middle_name, last_name].filter(Boolean).join(' ');
        }
        if (!final_child_name) {
            return res.status(400).json({ success: false, message: 'First and Last name are required' });
        }

        // 2. Resolve WhatsApp ID / Mobile
        const raw_wa_id = wa_id || parent_mobile || mobile;
        if (!raw_wa_id) {
            return res.status(400).json({ success: false, message: 'Unique mobile number is required' });
        }

        const final_wa_id = normalizeWaId(raw_wa_id);
        const wa_hash = hashField(normalizePhone(raw_wa_id));
        const normalizedGender = normalizeGender(gender);
        const parsedDob = parseDOB(dob);

        if (!parsedDob) {
            return res.status(400).json({
                success: false,
                message: 'Date of Birth is required and must be a valid date'
            });
        }

        // Check duplicate by wa_hash AND child_name (siblings share wa_id)
        const existing = await Patient.findOne({
            wa_hash,
            child_name: { $regex: new RegExp(`^${final_child_name}$`, 'i') },
            is_deleted: false
        });
        if (existing) {
            return res.json({
                success: true,
                message: 'The patient with this number is already registered',
                is_already_registered: true,
                data: existing
            });
        }

        const patient_id = await generatePatientId(first_name, last_name, final_child_name);

        const patient = await Patient.create({
            patient_key: patient_id,
            wa_id: final_wa_id,
            wa_hash,

            // Personal
            child_name: final_child_name,
            salutation: salutation || null,
            first_name: first_name || null,
            middle_name: middle_name || null,
            last_name: last_name || null,
            gender: normalizedGender,

            // Birth
            dob: parsedDob,

            // Registration
            registration_date: registration_date ? new Date(registration_date) : new Date(),

            // Parent / Guardian
            father_name: father_name || null,
            mother_name: mother_name || null,
            communication_preference: communication_preference ?? null,

            // Address
            state: state || 'Maharashtra',
            city: city || 'Mumbai',
            pincode: pincode || null,
            residential_address: residential_address || address || null,

            // Doctor
            doctor: doctor || 'Dr. Indu',

            // Status
            is_active: is_active !== undefined ? is_active : true,
            registration_source: (registration_source || 'dashboard').toLowerCase(),
        });

        // Create blank MRD shell
        await MRD.create({ patient_id, entries: [] });

        // Link patient_id to active bot session if applicable
        await BotSession.updateMany(
            { wa_id: final_wa_id, is_active: true },
            { $set: { patient_id } }
        );

        const actor = req.user ? req.user.username : 'SYSTEM';
        const actor_role = req.user ? req.user.role : 'bot_service';

        await audit({
            event_type: 'PATIENT_REGISTERED',
            entity_type: 'patient',
            entity_id: patient_id,
            actor,
            actor_type: actor_role,
            meta: { child_name, registration_source }
        });

        // Trigger n8n webhook
        await triggerWebhook('Registration', {
            patient_id,
            child_name: final_child_name,
            wa_id: final_wa_id,
            doctor: doctor || 'Dr. Indu',
            registration_source: (registration_source || 'dashboard').toLowerCase()
        });

        res.status(201).json({ success: true, data: patient });

    } catch (err) {
        next(err);
    }
};

// @desc    Register a new patient from whatsapp
exports.registerFromWhatsapp = async (req, res, next) => {
    if (!req.body) req.body = {};
    req.body.registration_source = 'whatsapp';
    return exports.registerPatient(req, res, next);
};

// @desc    Register a new patient from form
exports.registerFromForm = async (req, res, next) => {
    if (!req.body) req.body = {};
    req.body.registration_source = 'form';
    return exports.registerPatient(req, res, next);
};

const buildWaHashCandidates = (rawWaId) => {
    const raw = String(rawWaId || '').trim();
    const normalized = normalizeWaId(raw);
    const normalizedPhone = normalizePhone(raw);
    const withoutPlus = raw.replace(/^\+/, '');

    return [...new Set(
        [normalizedPhone, normalized, raw, withoutPlus]
            .filter(Boolean)
            .map(hashField)
    )];
};

const findLegacyPatientByPhone = async (normalizedPhone) => {
    if (!normalizedPhone) return null;

    const cursor = Patient.find({
        is_deleted: false,
        $or: [
            { wa_hash: { $exists: false } },
            { wa_hash: null },
            { wa_hash: '' }
        ]
    }).select('_id patient_id wa_id wa_hash').cursor();

    try {
        for await (const candidate of cursor) {
            const storedWaId = candidate.get('wa_id', null, { getters: false });
            const candidatePhone = normalizePhone(decrypt(storedWaId));
            if (candidatePhone === normalizedPhone) {
                return candidate;
            }
        }
    } finally {
        await cursor.close();
    }

    return null;
};

// @desc    Lookup patient by wa_id
exports.getPatientByWaId = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const raw = req.params.mobile || req.params.wa_id || '';
        const normalized = normalizeWaId(raw);
        const normalizedPhone = normalizePhone(raw);
        const waHashCandidates = buildWaHashCandidates(raw);

        let patient = null;
        if (waHashCandidates.length) {
            patient = await Patient.findOne({
                wa_hash: { $in: waHashCandidates },
                is_deleted: false
            });
        }

        if (!patient) {
            patient = await findLegacyPatientByPhone(normalizedPhone);
            if (patient && normalizedPhone && !patient.wa_hash) {
                const currentHash = hashField(normalizedPhone);
                patient.wa_hash = currentHash;
                await Patient.updateOne(
                    { _id: patient._id },
                    { $set: { wa_hash: currentHash } }
                );
            }
        }

        if (!patient) {
            return res.json({
                success: true,
                is_registered: false,
                message: 'Patient not registered. Please complete registration first.',
                wa_id: normalized
            });
        }
        if (!await ensureDoctorCanAccessPatient(req, res, patient.patient_id, 'You can only access patients linked to your profile')) return;

        const stats = await Appointment.aggregate([
            { $match: { patient_id: patient.patient_id } },
            { $group: { _id: null, count: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            is_registered: true,
            data: {
                ...patient.toObject(),
                total_appointments: stats[0]?.count || 0
            }
        });
    } catch (err) {
        next(err);
    }
};

// @desc    Get patient by patient_id
exports.getPatientById = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const patient = await Patient.findOne({ patient_key: req.params.patient_id, is_deleted: false });

        if (!patient) {
            return res.status(404).json({ success: false, error_code: 'PATIENT_NOT_FOUND', message: 'Patient not found' });
        }
        if (!await ensureDoctorCanAccessPatient(req, res, patient.patient_id, 'You can only access patients linked to your profile')) return;

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
        next(err);
    }
};

// @desc    Get all patients
exports.getPatients = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        let { 
            page = 1, 
            limit = 20, 
            search, 
            status, 
            gender, 
            doctor, 
            city, 
            state,
            from,
            to,
            date_from,
            date_to
        } = req.query;
        page = parseInt(page, 10);
        limit = parseInt(limit, 10);
        const skip = (page - 1) * limit;

        const query = { is_deleted: false };
        const scopedPatientIdFilter = await getScopedPatientIdFilter(req);
        if (scopedPatientIdFilter) query.patient_id = scopedPatientIdFilter;

        if (gender) {
            const normalizedFilterGender = normalizeGender(gender);
            query.gender = normalizedFilterGender || gender;
        }
        if (doctor) query.doctor = new RegExp(doctor, 'i');
        if (city) query.city = new RegExp(city, 'i');
        if (state) query.state = new RegExp(state, 'i');

        // Date range filter
        const final_from = from || date_from;
        const final_to = to || date_to;
        if (final_from || final_to) {
            query.registration_date = {};
            if (final_from) query.registration_date.$gte = new Date(final_from);
            if (final_to) query.registration_date.$lte = new Date(final_to);
        }

        if (search) {
            const searchHash = hashField(normalizePhone(search));
            const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            query.$or = [
                { child_name: regex },
                { first_name: regex },
                { last_name: regex },
                { father_name: regex },
                { mother_name: regex },
                { patient_key: regex },
                { city: regex },
                { residential_address: regex },
                { wa_hash: searchHash }
            ];
        }

        if (status) query.registration_status = status.toUpperCase();

        const [patients, total] = await Promise.all([
            Patient.find(query)
                .sort({ registration_date: -1 })
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
        next(err);
    }
};

// @desc    Update patient details
exports.updatePatient = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { patient_id } = req.params;
        const updates = req.body || {};
        const actor = req.user ? req.user.username : 'ADMIN';
        if (!await ensureDoctorCanAccessPatient(req, res, patient_id, 'You can only update patients linked to your profile')) return;

        if (Object.prototype.hasOwnProperty.call(updates, 'gender')) {
            const normalizedUpdateGender = normalizeGender(updates.gender);
            if (!normalizedUpdateGender && updates.gender !== null && updates.gender !== '') {
                return res.status(400).json({
                    success: false,
                    message: 'Gender must be boy or girl'
                });
            }
            updates.gender = normalizedUpdateGender;
        }

        if (updates.address) {
            updates.residential_address = updates.address;
            delete updates.address;
        }

        // Protect immutable fields
        delete updates.patient_id;
        delete updates.registration_date;
        delete updates._id;
        delete updates.wa_hash;

        updates.last_updated_at = new Date();

        const patient = await Patient.findOneAndUpdate(
            { patient_key: patient_id, is_deleted: false },
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
        next(err);
    }
};

// @desc    Soft delete patient
// @route   DELETE /api/patients/:patient_id
exports.deletePatient = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { patient_id } = req.params;
        const actor = req.user ? req.user.username : 'ADMIN';
        if (!await ensureDoctorCanAccessPatient(req, res, patient_id, 'You can only delete patients linked to your profile')) return;

        const patient = await Patient.findOneAndUpdate(
            { patient_key: patient_id, is_deleted: false },
            { $set: { is_deleted: true, is_active: false, deleted_at: new Date() } },
            { new: true }
        );

        if (!patient) {
            return res.status(404).json({ success: false, error_code: 'PATIENT_NOT_FOUND', message: 'Patient not found' });
        }

        await audit({
            event_type: 'PATIENT_DELETED',
            entity_type: 'patient',
            entity_id: patient_id,
            actor,
            actor_type: req.user ? req.user.role : 'ADMIN'
        });

        res.json({ success: true, message: 'Patient deleted successfully' });
    } catch (err) {
        next(err);
    }
};

// @desc    Export patients to CSV
// @route   GET /api/patients/export/csv
exports.exportPatientsCsv = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { date_from, date_to, city, gender, doctor } = req.query;

        const filter = { is_deleted: false };
        const scopedPatientIdFilter = await getScopedPatientIdFilter(req);
        if (scopedPatientIdFilter) filter.patient_id = scopedPatientIdFilter;
        if (gender) {
            const normalizedFilterGender = normalizeGender(gender);
            filter.gender = normalizedFilterGender || gender;
        }
        if (doctor) filter.doctor = new RegExp(doctor, 'i');
        if (date_from || date_to) {
            filter.registration_date = {};
            if (date_from) filter.registration_date.$gte = new Date(date_from);
            if (date_to) filter.registration_date.$lte = new Date(date_to);
        }

        const patients = await Patient.find(filter).select('-wa_hash').lean();

        // Build CSV
        const fields = ['patient_key', 'child_name', 'gender', 'dob', 'father_name', 'mother_name', 'doctor', 'registration_source', 'is_active', 'registration_date'];
        const header = fields.join(',');
        const rows = patients.map(p =>
            fields.map(f => {
                const val = p[f];
                if (val === null || val === undefined) return '';
                if (val instanceof Date) return val.toISOString();
                return `"${String(val).replace(/"/g, '""')}"`;
            }).join(',')
        );

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="patients.csv"');
        res.send([header, ...rows].join('\n'));
    } catch (err) {
        next(err);
    }
};

// @desc    Patient statistics
// @route   GET /api/patients/stats
exports.getPatientStats = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());

        const scopedPatientIdFilter = await getScopedPatientIdFilter(req);
        const baseMatch = scopedPatientIdFilter
            ? { is_deleted: false, patient_id: scopedPatientIdFilter }
            : { is_deleted: false };

        const [total, active, inactive, byGender, byDoctor, bySources, newMonth, newWeek] = await Promise.all([
            Patient.countDocuments(baseMatch),
            Patient.countDocuments({ ...baseMatch, is_active: true }),
            Patient.countDocuments({ ...baseMatch, is_active: false }),
            Patient.aggregate([{ $match: baseMatch }, { $group: { _id: '$gender', count: { $sum: 1 } } }]),
            Patient.aggregate([{ $match: baseMatch }, { $group: { _id: '$doctor', count: { $sum: 1 } } }]),
            Patient.aggregate([{ $match: baseMatch }, { $group: { _id: '$registration_source', count: { $sum: 1 } } }]),
            Patient.countDocuments({ ...baseMatch, registration_date: { $gte: startOfMonth } }),
            Patient.countDocuments({ ...baseMatch, registration_date: { $gte: startOfWeek } }),
        ]);

        const toObj = (arr) => arr.reduce((acc, { _id, count }) => { if (_id) acc[_id] = count; return acc; }, {});

        res.json({
            success: true,
            data: {
                total_patients: total,
                active_patients: active,
                inactive_patients: inactive,
                by_gender: toObj(byGender),
                by_doctor: toObj(byDoctor),
                registration_sources: toObj(bySources),
                new_this_month: newMonth,
                new_this_week: newWeek
            }
        });
    } catch (err) {
        next(err);
    }
};

// @desc    Get patient by email
// @route   GET /api/patients/by-email/:email
exports.getPatientByEmail = async (req, res, next) => {
    try {
        const { email } = req.params;
        const patient = await Patient.findOne({ email, is_deleted: false });

        if (!patient) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }

        res.json({ success: true, data: patient });
    } catch (err) {
        next(err);
    }
};

// @desc    Upload patient photo
// @route   PATCH /api/patients/:patient_id/photo
exports.uploadPatientPhoto = async (req, res, next) => {
    try {
        const { patient_id } = req.params;
        const { photo } = req.body;

        if (!photo) {
            return res.status(400).json({ success: false, message: 'Photo data is required' });
        }

        const patient = await Patient.findOneAndUpdate(
            { patient_key: patient_id, is_deleted: false },
            { $set: { photo } },
            { new: true }
        );

        if (!patient) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }

        res.json({ success: true, message: 'Photo uploaded successfully', data: patient });
    } catch (err) {
        next(err);
    }
};

// @desc    Get comprehensive profile including appointments, documents, and legacy data
// @route   GET /api/patients/:patient_id/comprehensive
// @access  Private
exports.getComprehensiveProfile = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;
        const { patient_id } = req.params;
        const patient = await Patient.findOne({ patient_key: patient_id, is_deleted: false });
        
        if (!patient) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }

        const [appointments, mrd, feedbacks, map] = await Promise.all([
            Appointment.find({ patient_id }).sort({ appointment_date: -1 }).lean(),
            MRD.findOne({ patient_id }).lean(),
            Feedback.find({ patient_id }).sort({ createdAt: -1 }).lean(),
            LegacyPatientMap.findOne({ mrd_id: patient_id }).lean()
        ]);

        let legacy = { pid: null, prescriptions: [], vaccinations: [], child_history: [] };

        if (map && map.pid) {
            const pid = map.pid;
            const [rx, vx, hx] = await Promise.all([
                Prescription.find({ patientId: pid }).sort({ 'metadata.createdOn': -1 }).lean(),
                Vaccination.find({ patientId: pid }).sort({ 'metadata.createdOn': -1 }).lean(),
                ChildHistory.find({ PID: pid }).sort({ CreatedOn: -1 }).lean()
            ]);
            legacy = { pid, prescriptions: rx, vaccinations: vx, child_history: hx };
        }

        res.json({
            success: true,
            data: {
                patient,
                appointments,
                mrd,
                feedbacks,
                legacy
            }
        });
    } catch (err) {
        next(err);
    }
};

exports.getVitalsHistory = async (req, res, next) => {
    try {
        const patientKey = await resolvePatientKey(req.params.patient_id);
        if (!patientKey) return res.status(404).json({ success: false, message: 'Patient not found' });
        const mrd = await MRD.findOne({ patient_id: patientKey }).lean();
        const data = (mrd?.entries || [])
            .filter((entry) => entry.visit_date && (entry.weight || entry.height || entry.head_circumference))
            .map((entry) => ({
                visit_date: entry.visit_date,
                weight: entry.weight || null,
                height: entry.height || null,
                head_circumference: entry.head_circumference || null
            }))
            .sort((a, b) => new Date(a.visit_date) - new Date(b.visit_date));
        res.json({ success: true, count: data.length, data });
    } catch (err) {
        next(err);
    }
};

exports.getAllergySummary = async (req, res, next) => {
    try {
        const patientKey = await resolvePatientKey(req.params.patient_id);
        if (!patientKey) return res.status(404).json({ success: false, message: 'Patient not found' });
        const mrd = await MRD.findOne({ patient_id: patientKey }).lean();
        const fromEntries = (mrd?.entries || [])
            .flatMap((entry) => {
                const explicitAllergies = Array.isArray(entry.allergies) ? entry.allergies : [];
                const historyAllergies = Array.isArray(entry.medication_history)
                    ? entry.medication_history.filter((row) => row?.is_allergy).map((row) => row.medicine).filter(Boolean)
                    : [];
                return [...explicitAllergies, ...historyAllergies];
            })
            .map((v) => String(v).trim())
            .filter(Boolean);
        const unique = [...new Set(fromEntries)];
        res.json({ success: true, count: unique.length, data: unique });
    } catch (err) {
        next(err);
    }
};

exports.getCurrentMeds = async (req, res, next) => {
    try {
        const patientKey = await resolvePatientKey(req.params.patient_id);
        if (!patientKey) return res.status(404).json({ success: false, message: 'Patient not found' });
        const mrd = await MRD.findOne({ patient_id: patientKey }).lean();
        const latest = (mrd?.entries || [])
            .slice()
            .sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date))[0];
        const meds = Array.isArray(latest?.medication_history)
            ? latest.medication_history.filter((item) => item?.is_to_be_continued)
            : [];
        res.json({ success: true, count: meds.length, data: meds });
    } catch (err) {
        next(err);
    }
};

exports.getPatientHistory = async (req, res, next) => {
    try {
        const patientKey = await resolvePatientKey(req.params.patient_id);
        if (!patientKey) return res.status(404).json({ success: false, message: 'Patient not found' });

        const [mrd, appointments] = await Promise.all([
            MRD.findOne({ patient_id: patientKey }).lean(),
            Appointment.find({ patient_id: patientKey, is_deleted: false })
                .sort({ appointment_date: -1 })
                .limit(50)
                .lean()
        ]);

        const entries = (mrd?.entries || [])
            .slice()
            .sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date))
            .slice(0, 50)
            .map((entry) => ({
                entry_id: entry._id,
                appointment_id: entry.appointment_id || null,
                visit_date: entry.visit_date || null,
                visit_type: entry.visit_type || null,
                diagnosis: entry.diagnosis || null,
                chief_complaint: entry.chief_complaint || null,
                attending_doctor: entry.attending_doctor || null
            }));

        const timeline = [...entries.map((item) => ({ ...item, source: 'mrd' })), ...appointments.map((appt) => ({
            source: 'appointment',
            appointment_id: appt.appointment_id || null,
            visit_date: appt.appointment_date || null,
            visit_type: appt.visit_type || appt.visit_category || null,
            diagnosis: null,
            chief_complaint: appt.reason || null,
            attending_doctor: appt.doctor_name || appt.assigned_doctor_name || null
        }))]
            .sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date))
            .slice(0, 100);

        res.json({
            success: true,
            data: {
                patient_id: patientKey,
                mrd_entries: entries,
                appointments,
                timeline
            }
        });
    } catch (err) {
        next(err);
    }
};

