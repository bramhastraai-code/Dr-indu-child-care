const Patient = require('../../models/Patient');
const MRD = require('../../models/MRD');
const BotSession = require('../../models/BotSession');
const Appointment = require('../../models/Appointment');
const audit = require('../../utils/audit');
const { normalizePhone, normalizeWaId, normalizeGender } = require('../../utils/helpers');
const { hashField, decrypt } = require('../../utils/encryption');
const {
    getDoctorIdFromSession,
    ensureDoctorSessionHasProfile
} = require('../../utils/doctorScope');
const { generatePatientKey } = require('../../utils/patientKey');

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

    // 1. Try to get initials from firstName/lastName
    if (firstName && firstName.trim()) {
        fInitial = firstName.trim().charAt(0).toUpperCase();
    }
    if (lastName && lastName.trim()) {
        lInitial = lastName.trim().charAt(0).toUpperCase();
    } else if (childName && childName.trim()) {
        // 2. Fallback to childName if lastName is missing
        const parts = childName.trim().split(/\s+/);
        if (parts.length >= 1 && (!firstName || !firstName.trim())) {
            fInitial = parts[0].charAt(0).toUpperCase();
        }
        if (parts.length >= 2) {
            lInitial = parts[parts.length - 1].charAt(0).toUpperCase();
        } else if (parts.length === 1 && (!lastName || !lastName.trim())) {
            // Use second letter or repeat first if only one word
            lInitial = parts[0].length > 1 ? parts[0].charAt(1).toUpperCase() : parts[0].charAt(0).toUpperCase();
        }
    }

    const initials = `${fInitial}${lInitial}`;
    const prefix = `${year}-${initials}`;

    // 3. Find all existing patients with this prefix to get the max sequence
    // We fetch all to avoid string sorting issues (e.g., "9" > "10" in some cases)
    const existingPatients = await Patient.find({
        patient_id: { $regex: `^${prefix}\\d+$` }
    }).select('patient_id').lean();

    let maxSeq = 0;
    existingPatients.forEach(p => {
        const seqPart = p.patient_id.slice(prefix.length);
        const seqNum = parseInt(seqPart, 10);
        if (!isNaN(seqNum) && seqNum > maxSeq) {
            maxSeq = seqNum;
        }
    });

    const nextSeq = maxSeq + 1;
    // No left padding (e.g., 1, 10, 100)
    const seqStr = `${nextSeq}`;

    return `${prefix}${seqStr}`;
};

const getScopedPatientIdFilter = async (req) => {
    // Doctors can now see all patients. Scoping is removed for viewing.
    return null;
};

const ensureDoctorCanAccessPatient = async (req, res, patientId, message = 'Access denied for this patient profile') => {
    // Doctors can now access any patient profile. Scoping is removed for viewing.
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

            // Section 2 – Photo & ID
            registration_date,
            photo,
            patient_photo,

            // Section 3 – Parent / Guardian
            father_name,
            father_email,
            father_occupation,
            mother_name,
            mother_email,
            mother_occupation,
            parent_mobile,              // user request
            communication_preference,

            // Section 4 – Contact
            email,

            // Section 5 – Additional
            source,
            referred_by,
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
            return res.status(400).json({ success: false, message: 'First and Last name are required' });
        }

        // 2. Resolve WhatsApp ID / Mobile
        const raw_wa_id = wa_id || parent_mobile || mobile;
        if (!raw_wa_id) {
            return res.status(400).json({ success: false, message: 'Unique mobile number is required' });
        }


        // Email is required and must be unique
        if (!email || !email.trim()) {
            return res.status(400).json({ success: false, message: 'Email Address is required' });
        }
        const email_hash = hashField(email.trim().toLowerCase());
        const existingEmail = await Patient.findOne({ email_hash, is_deleted: false });
        if (existingEmail) {
            return res.status(400).json({
                success: false,
                message: 'This email address is already registered with another patient'
            });
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
        const patient_uid = patient_id; // Mapping patient_id to patient_uid as per spec format
        const patient_key = await generatePatientKey(first_name, last_name, final_child_name);

        const patient = await Patient.create({
            patient_id,
            patient_uid,
            patient_key,
            wa_id: final_wa_id,
            wa_hash,

            // Personal
            child_name: final_child_name,
            salutation: salutation || null,
            first_name: first_name || null,
            middle_name: middle_name || null,
            last_name: last_name || null,
            gender: normalizedGender,
            mothers_name: mothers_name || mother_name || null,
            parent_name: parent_name || null,

            // Birth
            dob_unknown: dob_unknown || false,
            dob: parsedDob,
            age_years: age_years ?? null,
            age_months: age_months ?? null,
            age_days: age_days ?? null,

            // Photo & ID
            registration_date: registration_date ? new Date(registration_date) : new Date(),
            patient_photo: patient_photo || photo || null,

            // Father
            father_name: father_name || null,
            father_email: father_email || null,
            father_occupation: father_occupation || null,

            // Mother
            mother_name: mother_name || mothers_name || null,
            mother_email: mother_email || null,
            mother_occupation: mother_occupation || null,

            communication_preference: communication_preference ?? null,

            // Contact
            email: email || null,

            // Additional
            source: source || null,
            referred_by: referred_by || null,
            home_branch: home_branch || null,
            doctor: doctor || null,
            religion: religion || null,
            language: language || null,
            account_type: account_type || null,
            rating: rating || null,
            remarks: remarks || remark || null,

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

// @desc    Lookup patient by email
exports.getPatientByEmail = async (req, res, next) => {
    try {
        const email = req.params.email || '';
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const email_hash = hashField(email.trim().toLowerCase());
        const patient = await Patient.findOne({
            email_hash,
            is_deleted: false
        });

        if (!patient) {
            return res.json({
                success: true,
                is_registered: false,
                message: 'Patient not registered with this email'
            });
        }

        res.json({
            success: true,
            is_registered: true,
            data: patient
        });
    } catch (err) {
        next(err);
    }
};
// @desc    Get patient by patient_id
exports.getPatientById = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const patient = await Patient.findOne({ patient_id: req.params.patient_id, is_deleted: false });

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

        let { page = 1, limit = 20, search, source, status, gender, doctor } = req.query;
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
                { patient_key: regex },
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
        next(err);
    }
};

// @desc    Upload patient photo (Base64 or multipart)
// @route   PATCH /api/patients/:patient_id/photo
exports.uploadPatientPhoto = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { patient_id } = req.params;
        if (!await ensureDoctorCanAccessPatient(req, res, patient_id, 'You can only update patients linked to your profile')) return;

        const { photo, patient_photo } = req.body || {};
        const photoData = photo || patient_photo;

        if (!photoData) {
            return res.status(400).json({ success: false, message: 'No photo data provided. Send base64 image in photo field.' });
        }

        const patient = await Patient.findOneAndUpdate(
            { patient_id, is_deleted: false },
            { $set: { patient_photo: photoData, last_updated_at: new Date() } },
            { new: true }
        );

        if (!patient) {
            return res.status(404).json({ success: false, error_code: 'PATIENT_NOT_FOUND', message: 'Patient not found' });
        }

        res.json({ success: true, message: 'Photo uploaded successfully', photo_url: photoData });
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
            filter.registered_at = {};
            if (date_from) filter.registered_at.$gte = new Date(date_from);
            if (date_to) filter.registered_at.$lte = new Date(date_to);
        }

        const patients = await Patient.find(filter).select('-password_hash -wa_hash -photo -patient_photo').lean();

        // Build CSV
        const fields = ['patient_id', 'child_name', 'gender', 'dob', 'father_name', 'mother_name', 'email', 'doctor', 'registration_source', 'is_active', 'registered_at'];
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
            Patient.countDocuments({ ...baseMatch, registered_at: { $gte: startOfMonth } }),
            Patient.countDocuments({ ...baseMatch, registered_at: { $gte: startOfWeek } }),
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


