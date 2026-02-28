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
            // Core
            child_name,
            parent_name,
            wa_id,
            mobile,                     // fallback alias
            registration_source,

            // Section 1 – Personal
            salutation,
            first_name,
            middle_name,
            last_name,
            gender,
            mothers_name,
            dob_unknown,
            dob,
            age_years,
            age_months,
            age_days,
            birth_time_hours,
            birth_time_minutes,
            birth_time_ampm,

            // Section 2 – Photo & ID
            registration_date,
            photo,
            patient_photo,

            // Section 3 – Parent / Guardian
            father_name,
            father_mobile,
            father_email,
            father_occupation,
            mother_name,
            mother_mobile,
            mother_email,
            mother_occupation,
            parent_mobile,              // user request
            communication_preference,

            // Section 4 – Contact
            email,
            area,
            city,
            state,
            country,
            pin_code,
            phone_residence,
            primary_address,
            address,

            // Section 5 – Additional
            source,
            reference_details,
            ref_details,
            home_branch,
            doctor,
            religion,
            language,
            account_type,
            rating,
            remarks,
            remark,

            // Section 6 – Enrollment
            enrollment_option,
            send_to_specific,

            // Section 7 – Status
            is_active,
        } = req.body || {};

        // 1. Resolve Child Name (Combine parts if missing)
        let final_child_name = child_name;
        if (!final_child_name && first_name) {
            final_child_name = [first_name, middle_name, last_name].filter(Boolean).join(' ');
        }
        if (!final_child_name) {
            return res.status(400).json({ success: false, message: 'Child name or First name is required' });
        }

        // 2. Resolve WhatsApp ID / Mobile
        const raw_wa_id = wa_id || parent_mobile || mobile || father_mobile || mother_mobile;
        if (!raw_wa_id) {
            return res.status(400).json({ success: false, message: 'At least one mobile number is required' });
        }
        const final_wa_id = normalizeWaId(raw_wa_id);
        const wa_hash = hashField(normalizePhone(raw_wa_id));

        // Check duplicate by wa_hash AND child_name (siblings share wa_id)
        const existing = await Patient.findOne({
            wa_hash,
            child_name: { $regex: new RegExp(`^${final_child_name}$`, 'i') },
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
            wa_hash,

            // Personal
            child_name: final_child_name,
            salutation: salutation || null,
            first_name: first_name || null,
            middle_name: middle_name || null,
            last_name: last_name || null,
            gender: gender || null,
            mothers_name: mothers_name || mother_name || null,
            parent_name: parent_name || null,

            // Birth
            dob_unknown: dob_unknown || false,
            dob: parseDOB(dob),
            age_years: age_years ?? null,
            age_months: age_months ?? null,
            age_days: age_days ?? null,
            birth_time_hours: birth_time_hours ?? null,
            birth_time_minutes: birth_time_minutes ?? null,
            birth_time_ampm: birth_time_ampm || null,

            // Photo & ID
            registration_date: registration_date ? new Date(registration_date) : new Date(),
            photo: photo || patient_photo || null,
            patient_photo: patient_photo || photo || null,

            // Father
            father_name: father_name || null,
            father_mobile: father_mobile || null,
            father_email: father_email || null,
            father_occupation: father_occupation || null,

            // Mother
            mother_name: mother_name || mothers_name || null,
            mother_mobile: mother_mobile || null,
            mother_email: mother_email || null,
            mother_occupation: mother_occupation || null,

            communication_preference: communication_preference ?? null,

            // Contact
            email: email || null,
            area: area || null,
            city: city || null,
            state: state || null,
            country: country || null,
            pin_code: pin_code || null,
            phone_residence: phone_residence || null,
            primary_address: primary_address || address || null,
            address: address || primary_address || null,

            // Additional
            source: source || null,
            reference_details: reference_details || ref_details || null,
            ref_details: ref_details || reference_details || null,
            home_branch: home_branch || null,
            doctor: doctor || null,
            religion: religion || null,
            language: language || null,
            account_type: account_type || null,
            rating: rating || null,
            remarks: remarks || remark || null,
            remark: remark || remarks || null,

            // Enrollment & Status
            enrollment_option: enrollment_option || 'just_enroll',
            send_to_specific: send_to_specific ?? false,
            is_active: is_active !== undefined ? is_active : true,

            registration_source: (registration_source || 'dashboard').toLowerCase()
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

// @desc    Lookup patient by wa_id
exports.getPatientByWaId = async (req, res) => {
    try {
        const raw = req.params.mobile || req.params.wa_id;
        const normalized = normalizeWaId(raw);
        const wa_hash = hashField(normalizePhone(raw));

        const patient = await Patient.findOne({
            wa_hash,
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
        let { page = 1, limit = 20, search, source, status, gender, city, doctor } = req.query;
        page = parseInt(page, 10);
        limit = parseInt(limit, 10);
        const skip = (page - 1) * limit;

        const query = { is_deleted: false };

        if (gender) query.gender = gender;
        if (city) query.city = new RegExp(city, 'i');
        if (doctor) query.doctor = new RegExp(doctor, 'i');

        if (search) {
            const searchHash = hashField(normalizePhone(search));
            const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            query.$or = [
                { child_name: regex },
                { first_name: regex },
                { last_name: regex },
                { parent_name: regex },
                { father_name: regex },
                { mother_name: regex },
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

        // Protect immutable fields
        delete updates.patient_id;
        delete updates.registered_at;
        delete updates._id;
        delete updates.wa_hash;

        updates.last_updated_at = new Date();
        updates.last_updated_by = actor;

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

// @desc    Soft delete patient
// @route   DELETE /api/patients/:patient_id
exports.deletePatient = async (req, res) => {
    try {
        const { patient_id } = req.params;
        const actor = req.user ? req.user.username : 'ADMIN';

        const patient = await Patient.findOneAndUpdate(
            { patient_id, is_deleted: false },
            { $set: { is_deleted: true, is_active: false, deleted_at: new Date(), deleted_by: actor } },
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
        res.status(500).json({ success: false, error_code: 'INTERNAL_ERROR', message: err.message });
    }
};

// @desc    Upload patient photo (Base64 or multipart)
// @route   PATCH /api/patients/:patient_id/photo
exports.uploadPatientPhoto = async (req, res) => {
    try {
        const { patient_id } = req.params;
        // Accept base64 string in body.photo or body.patient_photo
        const { photo, patient_photo } = req.body || {};
        const photoData = photo || patient_photo;

        if (!photoData) {
            return res.status(400).json({ success: false, message: 'No photo data provided. Send base64 image in photo field.' });
        }

        const patient = await Patient.findOneAndUpdate(
            { patient_id, is_deleted: false },
            { $set: { photo: photoData, patient_photo: photoData, last_updated_at: new Date() } },
            { new: true }
        );

        if (!patient) {
            return res.status(404).json({ success: false, error_code: 'PATIENT_NOT_FOUND', message: 'Patient not found' });
        }

        res.json({ success: true, message: 'Photo uploaded successfully', photo_url: photoData });
    } catch (err) {
        res.status(500).json({ success: false, error_code: 'INTERNAL_ERROR', message: err.message });
    }
};

// @desc    Export patients to CSV
// @route   GET /api/patients/export/csv
exports.exportPatientsCsv = async (req, res) => {
    try {
        const { date_from, date_to, city, gender, doctor } = req.query;

        const filter = { is_deleted: false };
        if (city) filter.city = new RegExp(city, 'i');
        if (gender) filter.gender = gender;
        if (doctor) filter.doctor = new RegExp(doctor, 'i');
        if (date_from || date_to) {
            filter.registered_at = {};
            if (date_from) filter.registered_at.$gte = new Date(date_from);
            if (date_to) filter.registered_at.$lte = new Date(date_to);
        }

        const patients = await Patient.find(filter).select('-password_hash -wa_hash -photo -patient_photo').lean();

        // Build CSV
        const fields = ['patient_id', 'child_name', 'gender', 'dob', 'father_name', 'mother_name', 'area', 'city', 'state', 'email', 'doctor', 'registration_source', 'is_active', 'registered_at'];
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
        res.status(500).json({ success: false, error_code: 'INTERNAL_ERROR', message: err.message });
    }
};

// @desc    Patient statistics
// @route   GET /api/patients/stats
exports.getPatientStats = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());

        const [total, active, inactive, byGender, byCity, byDoctor, bySources, newMonth, newWeek] = await Promise.all([
            Patient.countDocuments({ is_deleted: false }),
            Patient.countDocuments({ is_deleted: false, is_active: true }),
            Patient.countDocuments({ is_deleted: false, is_active: false }),
            Patient.aggregate([{ $match: { is_deleted: false } }, { $group: { _id: '$gender', count: { $sum: 1 } } }]),
            Patient.aggregate([{ $match: { is_deleted: false } }, { $group: { _id: '$city', count: { $sum: 1 } } }]),
            Patient.aggregate([{ $match: { is_deleted: false } }, { $group: { _id: '$doctor', count: { $sum: 1 } } }]),
            Patient.aggregate([{ $match: { is_deleted: false } }, { $group: { _id: '$registration_source', count: { $sum: 1 } } }]),
            Patient.countDocuments({ is_deleted: false, registered_at: { $gte: startOfMonth } }),
            Patient.countDocuments({ is_deleted: false, registered_at: { $gte: startOfWeek } }),
        ]);

        const toObj = (arr) => arr.reduce((acc, { _id, count }) => { if (_id) acc[_id] = count; return acc; }, {});

        res.json({
            success: true,
            data: {
                total_patients: total,
                active_patients: active,
                inactive_patients: inactive,
                by_gender: toObj(byGender),
                by_city: toObj(byCity),
                by_doctor: toObj(byDoctor),
                registration_sources: toObj(bySources),
                new_this_month: newMonth,
                new_this_week: newWeek
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error_code: 'INTERNAL_ERROR', message: err.message });
    }
};
