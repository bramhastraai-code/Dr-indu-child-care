const Appointment = require('../../models/Appointment');
const Patient = require('../../models/Patient');
const MRD = require('../../models/MRD');
const Doctor = require('../../models/Doctor');
const SystemConfig = require('../../models/SystemConfig');

const audit = require('../../utils/audit');
const { toMidnight, extractMobile, normalizeWaId, normalizePhone, canonicalizeDoctorName } = require('../../utils/helpers');
const { decrypt, hashField } = require('../../utils/encryption');
const { getDoctorShiftConfig } = require('../../utils/tokenHelpers');
const DoctorTokenConfig = require('../../models/DoctorTokenConfig');
const {
    getDoctorIdFromSession,
    ensureDoctorSessionHasProfile,
    ensureDoctorMatches,
    withDoctorFilter
} = require('../../utils/doctorScope');
const { queueMessage } = require('../../services/messageQueueService');
const axios = require('axios');

// ── Helpers ──────────────────────────────────────────────────────────────────

const generateAppointmentId = async () => {
    const year = new Date().getFullYear();
    const prefix = `APT-${year}-`;
    const last = await Appointment.findOne({ appointment_id: { $regex: `^${prefix}` } })
        .sort({ appointment_id: -1 });
    const seq = last ? parseInt(last.appointment_id.replace(prefix, ''), 10) + 1 : 1;
    return `${prefix}${seq.toString().padStart(5, '0')}`;
};
exports.generateAppointmentId = generateAppointmentId;
const { calculateTokenTime, generateTokenDisplay } = require('../../utils/tokenHelpers');

const resolveDoctorDetails = async ({ doctor_id, doctor_name, doctor_speciality }) => {
    let finalId = doctor_id || null;
    let finalName = doctor_name;
    let finalSpeciality = doctor_speciality;

    if (doctor_id) {
        const doc = await Doctor.findOne({ doctor_id });
        if (doc) {
            finalName = doc.name;
            if (!finalSpeciality) finalSpeciality = doc.speciality;
        }
    } else if (doctor_name) {
        const canonicalName = canonicalizeDoctorName(doctor_name);
        // Try fuzzy name match if no ID provided
        const doc = await Doctor.findOne({
            $or: [
                { name: { $regex: new RegExp(`^${canonicalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
                { name: { $regex: new RegExp(`^${doctor_name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
            ]
        });
        if (doc) {
            finalId = doc.doctor_id;
            if (!finalSpeciality) finalSpeciality = doc.speciality;
            finalName = doc.name; // Use canonical name from DB
        } else {
            finalName = canonicalName; // Use the canonical version of input if no DB match
        }
    }
    return { finalId, finalName, finalSpeciality };
};

const resolveScopedDoctorInput = (req, doctor_id, doctor_name) => {
    const sessionDoctorId = getDoctorIdFromSession(req);
    if (!sessionDoctorId) {
        return { doctor_id, doctor_name };
    }
    return { doctor_id: sessionDoctorId, doctor_name: null };
};

const parseTimeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return Number.MAX_SAFE_INTEGER;
    const [h, m] = timeStr.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.MAX_SAFE_INTEGER;
    return (h * 60) + m;
};

const assignTokensForDate = async (targetDate) => {
    const queryDate = toMidnight(targetDate);
    const dateKey = queryDate.toISOString().split('T')[0];
    const lockKey = `TOKEN_ASSIGN_LOCK_${dateKey}`;
    const lockOwner = `pid${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const lockUntil = new Date(Date.now() + (2 * 60 * 1000));
    let lockAcquired = false;

    try {
        try {
            await SystemConfig.create({
                config_key: lockKey,
                config_value: {
                    locked: true,
                    owner: lockOwner,
                    lock_until: lockUntil
                },
                description: 'Token assignment lock for 24h reminder flow',
                updated_at: new Date(),
                updated_by: 'SYSTEM_24H_TOKEN'
            });
            lockAcquired = true;
        } catch (lockCreateErr) {
            if (lockCreateErr.code !== 11000) throw lockCreateErr;
        }

        if (!lockAcquired) {
            const stolen = await SystemConfig.findOneAndUpdate(
                {
                    config_key: lockKey,
                    'config_value.lock_until': { $lte: new Date() }
                },
                {
                    $set: {
                        config_value: {
                            locked: true,
                            owner: lockOwner,
                            lock_until: lockUntil
                        },
                        updated_at: new Date(),
                        updated_by: 'SYSTEM_24H_TOKEN'
                    }
                },
                { new: true }
            );
            lockAcquired = Boolean(stolen);
        }

        if (!lockAcquired) {
            return { generated: 0, normalized: 0, skipped: true, reason: 'lock_not_acquired' };
        }

        // 1. Load ALL appointments for the day to correctly calculate max tokens and grouping
        const allAppointments = await Appointment.find({
            appointment_date: queryDate,
            is_deleted: false
        })
            .select('_id appointment_id status doctor_id doctor_name appointment_time created_at token_number token_status token_display')
            .lean();

        if (allAppointments.length === 0) {
            return { generated: 0, normalized: 0 };
        }

        // 2. Load Doctors to map names to IDs if missing
        const doctors = await Doctor.find({ is_active: true }).select('doctor_id name').lean();
        const docByNameMap = new Map();
        doctors.forEach(d => {
            docByNameMap.set(canonicalizeDoctorName(d.name), d.doctor_id);
        });

        // 3. Group by doctor and pool consistently
        const groupedByDoctorAndPool = new Map();
        for (const appt of allAppointments) {
            let doctorKey = appt.doctor_id || (appt.doctor_name ? canonicalizeDoctorName(appt.doctor_name) : 'UNKNOWN');
            let poolKey = appt.token_pool || 'ONLINE';
            let key = `${doctorKey}_${poolKey}`;
            if (!groupedByDoctorAndPool.has(key)) groupedByDoctorAndPool.set(key, []);
            groupedByDoctorAndPool.get(key).push(appt);
        }

        const now = new Date();
        const bulkOps = [];
        let generated = 0;
        let normalized = 0;

        for (const [key, appointments] of groupedByDoctorAndPool.entries()) {
            const [doctorId, pool] = key.split('_');
            const shift = await getDoctorShiftConfig(doctorId, queryDate);
            const startTime = shift.start_time || '10:00';

            let maxToken = 0;
            for (const appt of appointments) {
                if (appt.token_number !== null && appt.token_number !== undefined) {
                    maxToken = Math.max(maxToken, Number(appt.token_number) || 0);
                }
            }

            const pendingTokenAppointments = appointments
                .filter(a => (a.status === 'BOOKED' || a.status === 'CONFIRMED' || a.status === 'PENDING') && (a.token_number === null || a.token_number === undefined))
                .sort((a, b) => {
                    const aMins = parseTimeToMinutes(a.appointment_time);
                    const bMins = parseTimeToMinutes(b.appointment_time);
                    if (aMins !== bMins) return aMins - bMins;

                    const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
                    const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
                    if (aCreated !== bCreated) return aCreated - bCreated;

                    return String(a.appointment_id || '').localeCompare(String(b.appointment_id || ''));
                });

            const { calculateTokenTime, generateTokenDisplay } = require('../../utils/tokenHelpers');

            for (const appt of pendingTokenAppointments) {
                maxToken += 1;
                generated += 1;

                const token_display = generateTokenDisplay(pool, maxToken);
                const appt_time = calculateTokenTime(startTime, maxToken);

                const updateFields = {
                    token_number: maxToken,
                    token_display,
                    appointment_time: appt_time,
                    token_status: 'WAITING',
                    last_updated_at: now,
                    last_updated_by: 'SYSTEM_24H_TOKEN'
                };

                if (!appt.doctor_id && appt.doctor_name) {
                    const resolvedId = docByNameMap.get(canonicalizeDoctorName(appt.doctor_name));
                    if (resolvedId) updateFields.doctor_id = resolvedId;
                }

                bulkOps.push({
                    updateOne: {
                        filter: { _id: appt._id },
                        update: { $set: updateFields }
                    }
                });
            }

            const missingStatusAppointments = appointments.filter(a =>
                a.token_number !== null &&
                a.token_number !== undefined &&
                (!a.token_status || !a.token_display)
            );
            for (const appt of missingStatusAppointments) {
                normalized += 1;
                const token_display = appt.token_display || generateTokenDisplay(pool, appt.token_number);
                const appt_time = appt.appointment_time || calculateTokenTime(startTime, appt.token_number);

                bulkOps.push({
                    updateOne: {
                        filter: { _id: appt._id },
                        update: {
                            $set: {
                                token_display,
                                appointment_time: appt_time,
                                token_status: appt.token_status || 'WAITING',
                                last_updated_at: now,
                                last_updated_by: 'SYSTEM_24H_TOKEN'
                            }
                        }
                    }
                });
            }
        }

        if (bulkOps.length > 0) {
            await Appointment.bulkWrite(bulkOps, { ordered: false });
        }

        return { generated, normalized };
    } finally {
        if (lockAcquired) {
            try {
                await SystemConfig.updateOne(
                    {
                        config_key: lockKey,
                        'config_value.owner': lockOwner
                    },
                    {
                        $set: {
                            config_value: {
                                locked: false,
                                owner: null,
                                lock_until: new Date(0)
                            },
                            updated_at: new Date(),
                            updated_by: 'SYSTEM_24H_TOKEN'
                        }
                    }
                );
            } catch (unlockErr) {
                console.error('[assignTokensForDate][unlock]', unlockErr.message);
            }
        }
    }
};
exports.assignTokensForDate = assignTokensForDate;

const enrichAppointment = async (a) => {
    const [patient, mrdEntry] = await Promise.all([
        Patient.findOne({ patient_id: a.patient_id }),
        MRD.findOne({ 'entries.appointment_id': a.appointment_id })
    ]);
    return {
        ...a.toObject(),
        child_name: patient?.full_name || patient?.child_name || null,
        parent_name: patient?.parent_name || null,
        wa_id: a.wa_id || patient?.wa_id || null,
        formatted_date: a.appointment_date ? a.appointment_date.toISOString().split('T')[0] : null,
        start_time: a.appointment_time || null,
        has_mrd_entry: !!mrdEntry
    };
};

// ── 1. GET /api/appointments ─────────────────────────────────────────────────
// List appointments with filters: date, patient_id, status, source, page, limit
exports.getAppointments = async (req, res) => {
    try {
        const { date, patient_id, doctor_id, doctor_name, status, source, page = 1, limit = 50 } = req.query;
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const filter = withDoctorFilter(req, { is_deleted: false });

        if (date) {
            const d = toMidnight(date);
            filter.appointment_date = d;
        }
        if (patient_id) filter.patient_id = patient_id;
        if (!getDoctorIdFromSession(req) && doctor_id) filter.doctor_id = doctor_id;
        if (!getDoctorIdFromSession(req) && doctor_name) filter.doctor_name = new RegExp(doctor_name, 'i');
        if (status) filter.status = status.toUpperCase();
        if (source) filter.booking_source = source.toLowerCase();

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [appointments, total] = await Promise.all([
            Appointment.find(filter).sort({ appointment_date: 1, token_number: 1 }).skip(skip).limit(parseInt(limit)),
            Appointment.countDocuments(filter)
        ]);

        const enriched = await Promise.all(appointments.map(enrichAppointment));
        res.json({
            success: true,
            data: enriched,
            pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (err) {
        next(err);
    }
};

// ── 2. POST /api/appointments ────────────────────────────────────────────────
// Book a new appointment. All channels use this endpoint.
// booking_source: 'dashboard' | 'whatsapp' | 'form' | 'api'
// Patient identified by patient_id (dashboard/form/api) OR mobile/wa_id (whatsapp)
exports.createAppointment = async (req, res, next) => {
    let appointmentPersisted = false;
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const {
            patient_id,
            doctor_id,
            doctor_name,
            doctor_speciality,
            appointment_date,
            visit_category,
            registration_type, // 'online' | 'walkin'
            appointment_mode,
            booking_source = 'dashboard',
            reason,
            wa_id,
            mobile
        } = req.body || {};

        const validCategories = ['First visit', 'Follow-up', 'Vaccination', 'Other'];
        const normalized_category = validCategories.find(c => c.toLowerCase() === (visit_category || '').toLowerCase()) || 'First visit';
        if (!visit_category && !normalized_category) {
            return res.status(400).json({ success: false, message: 'Valid visit_category is required: ' + validCategories.join(', ') });
        }

        const final_registration_type =
            booking_source === 'dashboard'
                ? 'walkin'
                : booking_source === 'form'
                    ? 'online'
                    : (registration_type || 'online');
        const token_pool = final_registration_type === 'walkin' ? 'WALK_IN' : 'ONLINE';

        // Validate booking_source
        const validSources = ['dashboard', 'whatsapp', 'form', 'api'];
        if (!validSources.includes(booking_source)) {
            return res.status(400).json({ success: false, message: `booking_source must be one of: ${validSources.join(', ')}` });
        }

        const { doctor_id: scopedDoctorId, doctor_name: scopedDoctorName } = resolveScopedDoctorInput(req, doctor_id, doctor_name);

        if (!appointment_date || (!scopedDoctorName && !scopedDoctorId)) {
            return res.status(400).json({ success: false, error_code: 'VALIDATION_ERROR', message: 'appointment_date and doctor_name or doctor_id are required.' });
        }

        // Resolve patient
        let patient;
        if (patient_id) {
            patient = await Patient.findOne({ patient_id, is_deleted: false });
        } else if (mobile || wa_id) {
            const lookupValue = wa_id || mobile;
            const normalized = normalizeWaId(lookupValue);
            const wa_hash = hashField(normalizePhone(lookupValue));
            patient = await Patient.findOne({
                wa_hash,
                is_deleted: false
            });
        }

        if (!patient) {
            return res.status(404).json({ success: false, error_code: 'PATIENT_NOT_FOUND', message: 'Patient not found or not registered.' });
        }

        // Resolve doctor name and speciality
        const { finalId: finalDoctorId, finalName: finalDoctorName, finalSpeciality: finalDoctorSpeciality } = await resolveDoctorDetails({
            doctor_id: scopedDoctorId,
            doctor_name: scopedDoctorName,
            doctor_speciality
        });

        if (!finalDoctorName) {
            return res.status(400).json({ success: false, message: 'doctor_name is required.' });
        }

        const queryDate = toMidnight(appointment_date);
        if (isNaN(queryDate.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid appointment_date. Use YYYY-MM-DD.' });
        }

        // Check if date is in the past (before today)
        const today = toMidnight(new Date());
        if (queryDate < today) {
            return res.status(400).json({ success: false, message: 'Cannot book appointments in the past.' });
        }

        // 1. Check Token Availability
        const shift = await getDoctorShiftConfig(finalDoctorId, queryDate);

        if (shift.is_holiday) {
            return res.status(400).json({ success: false, message: 'Clinic is closed on this date (Holiday/Day off).' });
        }

        const tokenCount = await Appointment.countDocuments({
            $or: [{ doctor_id: finalDoctorId }, { doctor_name: finalDoctorName }],
            appointment_date: queryDate,
            registration_type: final_registration_type,
            is_deleted: false,
            status: { $ne: 'CANCELLED' }
        });

        // Online Booking Limit is enforced as decided by admin/doctor
        if (final_registration_type === 'online') {
            const onlineLimit = shift.online || 20;
            if (tokenCount >= onlineLimit) {
                return res.status(400).json({
                    success: false,
                    message: `No online tokens available. (Limit: ${onlineLimit})`
                });
            }
        }
        // Walk-in Allotment is free (taken in the admin or staff)
        // No limit check for final_registration_type === 'walkin'

        const token_number = tokenCount + 1;
        const { calculateTokenTime, generateTokenDisplay } = require('../../utils/tokenHelpers');
        const token_display = generateTokenDisplay(token_pool, token_number);
        const appointment_time = calculateTokenTime(shift.start_time, token_number);

        const appointment_id = await generateAppointmentId();

        await Appointment.create({
            appointment_id,
            patient_id: patient.patient_id,
            doctor_id: finalDoctorId,
            doctor_name: finalDoctorName,
            doctor_speciality: finalDoctorSpeciality,
            appointment_date: queryDate,
            appointment_time,
            visit_category: normalized_category,
            registration_type: final_registration_type,
            token_pool,
            token_number,
            token_display,
            token_status: 'WAITING',
            appointment_mode: appointment_mode || 'OFFLINE',
            reason: reason || null,
            booking_source,
            wa_id: wa_id || patient.wa_id,
            status: 'PENDING',
            confirmation_sent: true,
            created_at: new Date(),
            last_updated_at: new Date(),
            last_updated_by: req.user?.username || booking_source
        });
        appointmentPersisted = true;

        // 6. Queue WhatsApp Notifications
        try {
            let waId;
            try { waId = decrypt(patient.wa_id); } catch { waId = patient.wa_id; }

            if (waId) {
                const vars = {
                    parent_name: patient.parent_name || patient.father_name || patient.mother_name || 'Parent',
                    child_name: patient.child_name || 'Your child',
                    doctor_name: finalDoctorName,
                    date: queryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
                    appointment_time: appointment_time || 'Check token status',
                    token: `#${token_number} (${token_pool})`,
                    clinic_name: process.env.CLINIC_NAME || 'Dr. Indu Child Care Clinic',
                    clinic_address: process.env.CLINIC_ADDRESS || 'Dr. Indu Child Care Clinic',
                    clinic_contact: process.env.CLINIC_PHONE || '91XXXXXXXXXX'
                };

                // Confirmation
                await queueMessage(waId, 'APPOINTMENT_CONFIRMED', vars, {
                    relatedEntity: { entity_type: 'appointment', entity_id: appointment_id }
                });

                // Schedule Reminders
                // 1. 24h Reminder (24 hours before appointment date/time)
                const scheduled24h = new Date(queryDate.getTime() - (24 * 60 * 60 * 1000));
                if (scheduled24h > new Date()) {
                    await queueMessage(waId, 'APPOINTMENT_REMINDER_24H', vars, {
                        scheduledFor: scheduled24h,
                        relatedEntity: { entity_type: 'appointment', entity_id: appointment_id }
                    });
                }

                // 2. 1h Reminder (1 hour before appointment time)
                const [h, m] = (appointment_time || '10:00').split(':').map(Number);
                const apptExactTime = new Date(queryDate);
                apptExactTime.setHours(h, m, 0, 0);
                const scheduled1h = new Date(apptExactTime.getTime() - (1 * 60 * 60 * 1000));

                if (scheduled1h > new Date()) {
                    await queueMessage(waId, 'APPOINTMENT_REMINDER_1H', vars, {
                        scheduledFor: scheduled1h,
                        relatedEntity: { entity_type: 'appointment', entity_id: appointment_id }
                    });
                }

                // 3. 2h Reminder (2 hours before appointment time)
                const scheduled2h = new Date(apptExactTime.getTime() - (2 * 60 * 60 * 1000));

                if (scheduled2h > new Date()) {
                    await queueMessage(waId, 'APPOINTMENT_REMINDER_2H', vars, {
                        scheduledFor: scheduled2h,
                        relatedEntity: { entity_type: 'appointment', entity_id: appointment_id }
                    });
                }
            }
        } catch (waErr) {
            console.error('[createAppointment][WhatsApp Queue Error]', waErr.message);
        }

        // 7. Audit
        const safeBookingSource = booking_source || 'dashboard';
        await audit({
            event_type: 'APPOINTMENT_BOOKED',
            entity_type: 'appointment',
            entity_id: appointment_id,
            actor: req.user?.username || safeBookingSource.toUpperCase(),
            actor_type: safeBookingSource === 'dashboard' ? 'ADMIN' : 'SYSTEM',
            new_value: { patient_id: patient.patient_id, date: appointment_date, booking_source: safeBookingSource, doctor_id: finalDoctorId, token_number, token_pool }
        });

        const responseData = {
            appointment_id,
            patient_id: patient.patient_id,
            child_name: patient.child_name,
            wa_id: patient.wa_id,
            status: 'CONFIRMED',
            booking_source: safeBookingSource,
            appointment_date: queryDate,
            appointment_time: appointment_time || null,
            doctor_name: finalDoctorName,
            doctor_speciality: finalDoctorSpeciality,
            doctor_id: finalDoctorId,
            visit_category: normalized_category,
            appointment_mode: appointment_mode || 'OFFLINE',
            token_number,
            token_pool,
            token_status: 'WAITING'
        };

        // Trigger n8n webhook
        axios.post('https://n8n.brahmaastra.ai/webhook/appointment', responseData)
            .catch(err => console.error('Appointment webhook failed:', err.message));

        res.status(201).json({
            success: true,
            data: responseData
        });

    } catch (err) {
        next(err);
    }
};

// ── 3. GET /api/appointments/stats ───────────────────────────────────────────
// Dashboard stats: totals by status and booking_source for today or a given date
exports.getAppointmentStats = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { date } = req.query;
        const queryDate = date ? toMidnight(date) : toMidnight(new Date());
        const baseMatch = withDoctorFilter(req, { appointment_date: queryDate });

        const [statusCounts, sourceCounts, total] = await Promise.all([
            Appointment.aggregate([
                { $match: baseMatch },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            Appointment.aggregate([
                { $match: baseMatch },
                { $group: { _id: '$booking_source', count: { $sum: 1 } } }
            ]),
            Appointment.countDocuments(baseMatch)
        ]);

        const byStatus = {};
        statusCounts.forEach(s => { byStatus[s._id.toLowerCase()] = s.count; });

        const bySource = {};
        sourceCounts.forEach(s => { bySource[s._id] = s.count; });

        res.json({
            success: true,
            date: queryDate,
            data: {
                total_today: total,
                booked: byStatus.booked || 0,
                confirmed: byStatus.confirmed || 0,
                completed: byStatus.completed || 0,
                cancelled: byStatus.cancelled || 0,
                no_show: byStatus.no_show || 0,
                whatsapp: bySource.whatsapp || 0,
                dashboard: bySource.dashboard || 0,
                form: bySource.form || 0,
                api: bySource.api || 0
            }
        });
    } catch (err) {
        next(err);
    }
};

// ── 5. GET /api/appointments/:appointment_id ─────────────────────────────────
exports.getAppointmentById = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const appt = await Appointment.findOne({ appointment_id: req.params.appointment_id });
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
        if (!ensureDoctorMatches(req, res, appt.doctor_id, 'You can only view appointments assigned to your profile')) return;
        const enriched = await enrichAppointment(appt);
        res.json({ success: true, data: enriched });
    } catch (err) {
        next(err);
    }
};

// ── 6. PATCH /api/appointments/:appointment_id ───────────────────────────────
// Reschedule or update appointment (date, reason, doctor)
exports.updateAppointment = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { appointment_id } = req.params;
        const {
            appointment_date,
            doctor_name, doctor_id, doctor_speciality,
            visit_category, appointment_mode, reason,
            token_number, token_pool, token_status,
            registration_type
        } = req.body || {};

        const appt = await Appointment.findOne({ appointment_id });
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
        if (!ensureDoctorMatches(req, res, appt.doctor_id, 'You can only update appointments assigned to your profile')) return;
        if (appt.status === 'CANCELLED') return res.status(409).json({ success: false, message: 'Cannot update a cancelled appointment.' });

        const updates = {
            last_updated_at: new Date(),
            last_updated_by: req.user?.username || 'SYSTEM'
        };

        const { doctor_id: scopedDoctorId, doctor_name: scopedDoctorName } = resolveScopedDoctorInput(req, doctor_id, doctor_name);

        // Handle core schedule change
        if (appointment_date || doctor_id || doctor_name) {
            const newDate = appointment_date ? toMidnight(appointment_date) : appt.appointment_date;
            const { finalId: newDocId, finalName: newDocName, finalSpeciality: newDocSpeciality } = await resolveDoctorDetails({
                doctor_id: scopedDoctorId || appt.doctor_id,
                doctor_name: scopedDoctorName || appt.doctor_name,
                doctor_speciality: doctor_speciality || appt.doctor_speciality
            });

            const scheduleChanged = (newDate.getTime() !== appt.appointment_date.getTime()) ||
                (newDocId !== appt.doctor_id);

            if (scheduleChanged) {
                updates.appointment_date = newDate;
                updates.doctor_id = newDocId;
                updates.doctor_name = newDocName;
                updates.doctor_speciality = newDocSpeciality;

                // Recalculate tokens on schedule change
                const shift = await getDoctorShiftConfig(newDocId, newDate);
                updates.appointment_time = shift.start_time;
                updates.token_number = null; // Reset for new assignment logic
                updates.token_display = null;
                updates.token_status = 'PENDING';
            }
        }

        // Direct Token Editing
        const { calculateTokenTime, generateTokenDisplay } = require('../../utils/tokenHelpers');
        if (token_number !== undefined || token_pool !== undefined) {
            const finalNum = token_number !== undefined ? token_number : appt.token_number;
            const finalPool = token_pool !== undefined ? token_pool : (appt.token_pool || 'ONLINE');

            if (finalNum) {
                updates.token_number = finalNum;
                updates.token_pool = finalPool;
                updates.token_display = generateTokenDisplay(finalPool, finalNum);

                // Update time based on token
                const shift = await getDoctorShiftConfig(updates.doctor_id || appt.doctor_id, updates.appointment_date || appt.appointment_date);
                updates.appointment_time = calculateTokenTime(shift.start_time, finalNum);
            } else {
                updates.token_number = null;
                updates.token_display = null;
            }
        }

        if (token_status) updates.token_status = token_status.toUpperCase();
        if (registration_type) {
            updates.registration_type = registration_type;
            updates.token_pool = registration_type === 'walkin' ? 'WALK_IN' : 'ONLINE';
        }

        if (visit_category) updates.visit_category = visit_category;
        if (appointment_mode) updates.appointment_mode = appointment_mode;
        if (reason !== undefined) updates.reason = reason;

        const updated = await Appointment.findOneAndUpdate({ appointment_id }, { $set: updates }, { new: true });

        await audit({
            event_type: 'APPOINTMENT_UPDATED',
            entity_type: 'appointment',
            entity_id: appointment_id,
            actor: req.user?.username || 'SYSTEM',
            actor_type: req.user ? req.user.role : 'SYSTEM',
            new_value: updates
        });

        const enriched = await enrichAppointment(updated);

        // Trigger n8n webhook for appointment modification
        axios.post('https://n8n.brahmaastra.ai/webhook/appointment-upgradation', enriched)
            .catch(err => console.error('[updateAppointment] n8n webhook failed:', err.message));

        res.json({ success: true, data: enriched });
    } catch (err) {
        next(err);
    }
};


// ── 7. PATCH /api/appointments/:appointment_id/cancel ────────────────────────
// Cancel by bot or dashboard — same endpoint, cancelled_by field tracks who
exports.cancelAppointment = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { appointment_id } = req.params;
        const { cancellation_reason, cancelled_by = 'dashboard' } = req.body || {};

        const validCancelledBy = ['whatsapp', 'dashboard', 'system'];
        const canceller = validCancelledBy.includes(cancelled_by) ? cancelled_by : 'dashboard';

        const appt = await Appointment.findOne({ appointment_id });
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
        if (!ensureDoctorMatches(req, res, appt.doctor_id, 'You can only cancel appointments assigned to your profile')) return;
        if (appt.status === 'CANCELLED') return res.status(409).json({ success: false, message: 'Appointment is already cancelled.' });

        await Appointment.updateOne({ appointment_id }, {
            $set: {
                status: 'CANCELLED',
                cancelled_at: new Date(),
                cancelled_by: canceller,
                cancellation_reason: cancellation_reason || null,
                last_updated_at: new Date(),
                last_updated_by: req.user?.username || canceller.toUpperCase()
            }
        });

        await audit({
            event_type: 'APPOINTMENT_CANCELLED', entity_type: 'appointment', entity_id: appointment_id,
            actor: req.user?.username || canceller.toUpperCase(),
            actor_type: canceller === 'dashboard' ? 'ADMIN' : 'SYSTEM',
            new_value: { cancellation_reason, cancelled_by: canceller }
        });

        res.json({ success: true, message: `Appointment ${appointment_id} cancelled.`, cancelled_by: canceller });
    } catch (err) {
        next(err);
    }
};

// ── Legacy today endpoint (keep for dashboard backward compat) ────────────────
exports.getTodayAppointments = async (req, res) => {
    req.query.date = new Date().toISOString().split('T')[0];
    return exports.getAppointments(req, res);
};

// ── GET /api/appointments/by-wa/:wa_id ───────────────────────────────────────
// Look up upcoming appointments by WhatsApp ID (bot-facing shortcut)
exports.getAppointmentsByWaId = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const rawWaId = req.params.wa_id;
        const parsedDays = Number.parseInt(req.query.days, 10);
        const parsedLimit = Number.parseInt(req.query.limit, 10);
        const maxDays = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.min(parsedDays, 90) : null;
        const maxLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : null;
        const wa_hash = hashField(normalizePhone(extractMobile(rawWaId)));

        const patient = await Patient.findOne({
            wa_hash,
            is_deleted: false
        });
        if (!patient) {
            return res.status(404).json({ success: false, message: `No patient found for wa_id ${rawWaId}` });
        }

        const today = toMidnight(new Date());
        const dateFilter = { $gte: today };
        if (maxDays) {
            const upper = new Date(today);
            upper.setUTCDate(upper.getUTCDate() + (maxDays - 1));
            dateFilter.$lte = upper;
        }

        const query = withDoctorFilter(req, {
            patient_id: patient.patient_id,
            status: { $in: ['BOOKED', 'CONFIRMED'] },
            appointment_date: dateFilter
        });

        let appointmentsQuery = Appointment.find(query).sort({ appointment_date: 1, token_number: 1 });
        if (maxLimit) appointmentsQuery = appointmentsQuery.limit(maxLimit);

        const appointments = await appointmentsQuery;

        const enriched = await Promise.all(appointments.map(enrichAppointment));
        res.json({
            success: true,
            patient_id: patient.patient_id,
            child_name: patient.child_name,
            mobile: patient.mobile || extractMobile(rawWaId),
            filters: { days: maxDays, limit: maxLimit },
            data: enriched
        });
    } catch (err) {
        console.error('[getAppointmentsByWaId]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── POST /api/appointments/whatsapp ──────────────────────────────────────────
// Dedicated WhatsApp bot booking endpoint.
// Patient is identified by wa_id (with normalization).
// Raw wa_id is stored on the appointment for full traceability.
exports.bookByWhatsapp = async (req, res) => {
    let appointmentPersisted = false;
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const {
            wa_id: rawWaId,
            doctor_name,
            doctor_id,
            doctor_speciality,
            visit_category,
            appointment_mode,
            appointment_date,
            reason
        } = req.body || {};

        const { doctor_id: scopedDoctorId, doctor_name: scopedDoctorName } = resolveScopedDoctorInput(req, doctor_id, doctor_name);

        if (!rawWaId || !appointment_date || (!scopedDoctorName && !scopedDoctorId)) {
            return res.status(400).json({
                success: false,
                message: 'wa_id, appointment_date, and doctor_name (or doctor_id) are required.'
            });
        }

        // Step 1: Normalize wa_id
        const normalized = normalizeWaId(rawWaId);
        // Step 2: Extract local mobile
        const wa_hash = hashField(normalizePhone(extractMobile(rawWaId)));

        // Step 3: Resolve Patient (Prioritize patient_id from body, else resolve by wa_hash)
        const { patient_id: req_patient_id, child_name: req_child_name } = req.body || {};
        let patient = null;

        if (req_patient_id) {
            patient = await Patient.findOne({ patient_id: req_patient_id, is_deleted: false });
        } else {
            const patients = await Patient.find({ wa_hash, is_deleted: false });

            if (patients.length === 0) {
                return res.status(409).json({
                    success: false,
                    error_code: 'PATIENT_NOT_FOUND',
                    message: 'Mobile number not registered. Please complete registration first.'
                });
            }

            if (patients.length === 1) {
                patient = patients[0];
            } else {
                // Siblings registered to same mobile number
                if (req_child_name) {
                    patient = patients.find(p => p.child_name && p.child_name.toLowerCase() === req_child_name.toLowerCase());
                }

                if (!patient) {
                    return res.status(409).json({
                        success: false,
                        error_code: 'AMBIGUOUS_PATIENT',
                        message: 'Multiple children registered to this mobile. Please specify a patient_id or child_name.',
                        options: patients.map(p => ({ patient_id: p.patient_id, child_name: p.child_name }))
                    });
                }
            }
        }

        // Step 4: Final verification
        if (!patient) {
            return res.status(409).json({ success: false, message: 'Could not resolve patient identity.' });
        }

        // Step 5: Book using unified core logic
        const queryDate = toMidnight(appointment_date);
        if (isNaN(queryDate.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid appointment_date. Use YYYY-MM-DD.' });
        }

        // Resolve doctor name and speciality
        const { finalId: finalDoctorId, finalName: finalDoctorName, finalSpeciality: finalDoctorSpeciality } = await resolveDoctorDetails({
            doctor_id: scopedDoctorId,
            doctor_name: scopedDoctorName,
            doctor_speciality
        });

        if (!finalDoctorName) {
            return res.status(400).json({ success: false, message: 'doctor_name is required.' });
        }

        const validCategories = ['First visit', 'Follow-up', 'Vaccination', 'Other'];
        const requestedCategory = visit_category || visit_type || 'First visit';
        const normalized_category = validCategories.find(
            (c) => c.toLowerCase() === String(requestedCategory).toLowerCase()
        ) || 'First visit';

        // 1. Check Token Availability
        const shift = await getDoctorShiftConfig(finalDoctorId, queryDate);
        if (shift.is_holiday) {
            return res.status(400).json({ success: false, message: 'Clinic is closed on this date (Holiday/Day off).' });
        }

        const registration_type = 'online';
        const token_pool = 'ONLINE';
        const limit = shift.online;

        const tokenCount = await Appointment.countDocuments({
            $or: [{ doctor_id: finalDoctorId }, { doctor_name: finalDoctorName }],
            appointment_date: queryDate,
            registration_type,
            is_deleted: false,
            status: { $ne: 'CANCELLED' }
        });

        if (tokenCount >= limit) {
            return res.status(400).json({
                success: false,
                message: `No ${token_pool.toLowerCase()} tokens available for this doctor on this day. (Limit: ${limit})`
            });
        }

        const { calculateTokenTime, generateTokenDisplay } = require('../../utils/tokenHelpers');
        const token_number = tokenCount + 1;
        const token_display = generateTokenDisplay(token_pool, token_number);
        const appointment_time = calculateTokenTime(shift.start_time, token_number);
        const appointment_id = await generateAppointmentId();

        await Appointment.create({
            appointment_id,
            patient_id: patient.patient_id,
            visit_category: normalized_category,
            visit_type: normalized_category,
            appointment_mode: appointment_mode || 'OFFLINE',
            doctor_name: finalDoctorName,
            doctor_speciality: finalDoctorSpeciality,
            doctor_id: finalDoctorId,
            appointment_date: queryDate,
            appointment_time,
            reason: reason || null,
            wa_id: normalized,
            status: 'PENDING',
            booking_source: 'whatsapp',
            token_number,
            token_display,
            token_pool,
            registration_type,
            token_status: 'WAITING',
            confirmation_sent: true,
            created_at: new Date(),
            last_updated_at: new Date(),
            last_updated_by: normalized
        });
        appointmentPersisted = true;

        await audit({
            event_type: 'APPOINTMENT_BOOKED',
            entity_type: 'appointment',
            entity_id: appointment_id,
            actor: normalized,
            actor_type: 'SYSTEM',
            new_value: { patient_id: patient.patient_id, date: appointment_date, booking_source: 'whatsapp', wa_id: normalized, doctor_id: finalDoctorId, token_display }
        });

        // Queue WhatsApp Notifications (Confirmation + Reminders)
        try {
            const waNotifId = String(normalized).replace(/\D/g, '');
            if (waNotifId) {
                const vars = {
                    parent_name: patient.father_name || patient.mother_name || patient.parent_name || 'Parent',
                    child_name: patient.child_name || 'Your child',
                    doctor_name: finalDoctorName,
                    date: queryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
                    appointment_time: appointment_time || 'Check token status',
                    token: `#${token_number} (${token_pool})`,
                    clinic_name: process.env.CLINIC_NAME || 'Dr. Indu Child Care Clinic',
                    clinic_address: process.env.CLINIC_ADDRESS || 'Dr. Indu Child Care Clinic',
                    clinic_contact: process.env.CLINIC_PHONE || ''
                };

                // Confirmation
                await queueMessage(waNotifId, 'APPOINTMENT_CONFIRMED', vars, {
                    relatedEntity: { entity_type: 'appointment', entity_id: appointment_id }
                });

                // 24h Reminder
                const scheduled24h = new Date(queryDate.getTime() - (24 * 60 * 60 * 1000));
                if (scheduled24h > new Date()) {
                    await queueMessage(waNotifId, 'APPOINTMENT_REMINDER_24H', vars, {
                        scheduledFor: scheduled24h,
                        relatedEntity: { entity_type: 'appointment', entity_id: appointment_id }
                    });
                }

                // 1h Reminder
                const [hwh, mwh] = (appointment_time || '10:00').split(':').map(Number);
                const apptExactTimeWh = new Date(queryDate);
                apptExactTimeWh.setHours(hwh, mwh, 0, 0);
                const scheduled1hWh = new Date(apptExactTimeWh.getTime() - (1 * 60 * 60 * 1000));
                if (scheduled1hWh > new Date()) {
                    await queueMessage(waNotifId, 'APPOINTMENT_REMINDER_1H', vars, {
                        scheduledFor: scheduled1hWh,
                        relatedEntity: { entity_type: 'appointment', entity_id: appointment_id }
                    });
                }

                // 2h Reminder
                const scheduled2hWh = new Date(apptExactTimeWh.getTime() - (2 * 60 * 60 * 1000));
                if (scheduled2hWh > new Date()) {
                    await queueMessage(waNotifId, 'APPOINTMENT_REMINDER_2H', vars, {
                        scheduledFor: scheduled2hWh,
                        relatedEntity: { entity_type: 'appointment', entity_id: appointment_id }
                    });
                }
            }
        } catch (waErr) {
            console.error('[bookByWhatsapp][WhatsApp Queue Error]', waErr.message);
        }

        res.status(201).json({
            success: true,
            data: {
                appointment_id,
                patient_id: patient.patient_id,
                child_name: patient.child_name,
                wa_id: normalized,
                status: 'PENDING',
                booking_source: 'whatsapp',
                appointment_date: queryDate,
                appointment_time,
                doctor_name: finalDoctorName,
                doctor_speciality: finalDoctorSpeciality,
                doctor_id: finalDoctorId,
                visit_category: normalized_category,
                visit_type: normalized_category,
                token_number,
                token_status: 'WAITING'
            }
        });

    } catch (err) {
        console.error('[bookByWhatsapp]', err.stack);
        if (err.code === 11000) return res.status(409).json({ success: false, message: 'Concurrent booking detected. Please try again.' });
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── POST /api/appointments/form ───────────────────────────────────────────────
// Dedicated web form booking endpoint.
// Patient identified by mobile number. No auth required.
exports.bookByForm = async (req, res) => {
    let appointmentPersisted = false;
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const {
            wa_id,
            mobile, // fallback
            doctor_name,
            doctor_id,
            doctor_speciality,
            visit_type,
            visit_category,
            appointment_mode,
            appointment_date,
            reason
        } = req.body || {};

        const { doctor_id: scopedDoctorId, doctor_name: scopedDoctorName } = resolveScopedDoctorInput(req, doctor_id, doctor_name);

        const raw = wa_id || mobile;
        if (!raw || !appointment_date || (!scopedDoctorName && !scopedDoctorId)) {
            return res.status(400).json({
                success: false,
                message: 'wa_id (or mobile), appointment_date, and doctor_name (or doctor_id) are required.'
            });
        }

        const normalized = normalizeWaId(raw);
        const wa_hash = hashField(normalizePhone(raw));

        // Lookup patient
        const patient = await Patient.findOne({
            wa_hash,
            is_deleted: false
        });

        if (!patient) {
            return res.status(409).json({
                success: false,
                message: 'Mobile number not registered. Please register as a patient first.'
            });
        }

        const queryDate = toMidnight(appointment_date);
        if (isNaN(queryDate.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid appointment_date. Use YYYY-MM-DD.' });
        }

        // Resolve doctor name and speciality
        const { finalId: finalDoctorId, finalName: finalDoctorName, finalSpeciality: finalDoctorSpeciality } = await resolveDoctorDetails({
            doctor_id: scopedDoctorId,
            doctor_name: scopedDoctorName,
            doctor_speciality
        });

        if (!finalDoctorName) {
            return res.status(400).json({ success: false, message: 'doctor_name is required.' });
        }

        const validCategories = ['First visit', 'Follow-up', 'Vaccination', 'Other'];
        const requestedCategory = visit_category || visit_type || 'First visit';
        const normalized_category = validCategories.find(
            (c) => c.toLowerCase() === String(requestedCategory).toLowerCase()
        ) || 'First visit';

        // 1. Check Token Availability
        const shift = await getDoctorShiftConfig(finalDoctorId, queryDate);
        if (shift.is_holiday) {
            return res.status(400).json({ success: false, message: 'Clinic is closed on this date (Holiday/Day off).' });
        }

        const registration_type = 'online';
        const token_pool = 'ONLINE';
        const limit = shift.online;

        const tokenCount = await Appointment.countDocuments({
            $or: [{ doctor_id: finalDoctorId }, { doctor_name: finalDoctorName }],
            appointment_date: queryDate,
            registration_type,
            is_deleted: false,
            status: { $ne: 'CANCELLED' }
        });

        if (tokenCount >= limit) {
            return res.status(400).json({
                success: false,
                message: `No ${token_pool.toLowerCase()} tokens available for this doctor on this day. (Limit: ${limit})`
            });
        }

        const { calculateTokenTime, generateTokenDisplay } = require('../../utils/tokenHelpers');
        const token_number = tokenCount + 1;
        const token_display = generateTokenDisplay(token_pool, token_number);
        const appointment_time = calculateTokenTime(shift.start_time, token_number);
        const appointment_id = await generateAppointmentId();

        await Appointment.create({
            appointment_id,
            patient_id: patient.patient_id,
            visit_category: normalized_category,
            visit_type: normalized_category,
            appointment_mode: appointment_mode || 'OFFLINE',
            doctor_name: finalDoctorName,
            doctor_speciality: finalDoctorSpeciality,
            doctor_id: finalDoctorId,
            appointment_date: queryDate,
            appointment_time,
            reason: reason || null,
            wa_id: normalized,
            status: 'PENDING',
            booking_source: 'form',
            token_number,
            token_display,
            token_pool,
            registration_type,
            token_status: 'WAITING',
            confirmation_sent: true,
            created_at: new Date(),
            last_updated_at: new Date(),
            last_updated_by: 'FORM_USER'
        });
        appointmentPersisted = true;

        await audit({
            event_type: 'APPOINTMENT_BOOKED',
            entity_type: 'appointment',
            entity_id: appointment_id,
            actor: 'FORM_USER',
            actor_type: 'SYSTEM',
            new_value: { patient_id: patient.patient_id, date: appointment_date, doctor_id: finalDoctorId, token_display }
        });

        // Queue WhatsApp Notifications (Confirmation + Reminders)
        try {
            let waFormId;
            try { const { decrypt: dec } = require('../../utils/encryption'); waFormId = dec(patient.wa_id); } catch { waFormId = patient.wa_id; }
            const waFormNotifId = String(waFormId || normalized).replace(/\D/g, '');
            if (waFormNotifId) {
                const vars = {
                    parent_name: patient.father_name || patient.mother_name || patient.parent_name || 'Parent',
                    child_name: patient.child_name || 'Your child',
                    doctor_name: finalDoctorName,
                    date: queryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
                    appointment_time: appointment_time || 'Check token status',
                    token: `#${token_number} (${token_pool})`,
                    clinic_name: process.env.CLINIC_NAME || 'Dr. Indu Child Care Clinic',
                    clinic_address: process.env.CLINIC_ADDRESS || 'Dr. Indu Child Care Clinic',
                    clinic_contact: process.env.CLINIC_PHONE || ''
                };

                // Confirmation
                await queueMessage(waFormNotifId, 'APPOINTMENT_CONFIRMED', vars, {
                    relatedEntity: { entity_type: 'appointment', entity_id: appointment_id }
                });

                // 24h Reminder
                const scheduled24hFm = new Date(queryDate.getTime() - (24 * 60 * 60 * 1000));
                if (scheduled24hFm > new Date()) {
                    await queueMessage(waFormNotifId, 'APPOINTMENT_REMINDER_24H', vars, {
                        scheduledFor: scheduled24hFm,
                        relatedEntity: { entity_type: 'appointment', entity_id: appointment_id }
                    });
                }

                // 1h Reminder
                const [hfm, mfm] = (appointment_time || '10:00').split(':').map(Number);
                const apptExactTimeFm = new Date(queryDate);
                apptExactTimeFm.setHours(hfm, mfm, 0, 0);
                const scheduled1hFm = new Date(apptExactTimeFm.getTime() - (1 * 60 * 60 * 1000));
                if (scheduled1hFm > new Date()) {
                    await queueMessage(waFormNotifId, 'APPOINTMENT_REMINDER_1H', vars, {
                        scheduledFor: scheduled1hFm,
                        relatedEntity: { entity_type: 'appointment', entity_id: appointment_id }
                    });
                }

                // 2h Reminder
                const scheduled2hFm = new Date(apptExactTimeFm.getTime() - (2 * 60 * 60 * 1000));
                if (scheduled2hFm > new Date()) {
                    await queueMessage(waFormNotifId, 'APPOINTMENT_REMINDER_2H', vars, {
                        scheduledFor: scheduled2hFm,
                        relatedEntity: { entity_type: 'appointment', entity_id: appointment_id }
                    });
                }
            }
        } catch (waErr) {
            console.error('[bookByForm][WhatsApp Queue Error]', waErr.message);
        }

        res.status(201).json({
            success: true,
            data: {
                appointment_id,
                patient_id: patient.patient_id,
                child_name: patient.child_name,
                wa_id: patient.wa_id || normalized,
                status: 'PENDING',
                booking_source: 'form',
                appointment_date: queryDate,
                appointment_time,
                doctor_name: finalDoctorName,
                doctor_speciality: finalDoctorSpeciality,
                doctor_id: finalDoctorId,
                visit_category: normalized_category,
                visit_type: normalized_category,
                token_number,
                token_display,
                token_pool,
                token_status: 'WAITING'
            }
        });

    } catch (err) {
        console.error('[bookByForm]', err.stack);
        if (err.code === 11000) return res.status(409).json({ success: false, message: 'Concurrent booking detected. Please try again.' });
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── 9. GET /api/appointments/reminders/pending-24h ───────────────────────────
// Fetch appointments for tomorrow that haven't had a 24h reminder sent.
exports.getPending24hReminders = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const tomorrow = new Date();
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        const queryDate = toMidnight(tomorrow);
        const tokenGeneration = await assignTokensForDate(queryDate);

        const reminderFilter = withDoctorFilter(req, {
            appointment_date: queryDate,
            status: { $in: ['BOOKED', 'CONFIRMED'] },
            reminder_24h_sent: false,
            is_deleted: false
        });

        const appointments = await Appointment.find(reminderFilter).sort({ token_number: 1 });

        const enriched = await Promise.all(appointments.map(enrichAppointment));

        if (appointments.length > 0) {
            const appointmentIds = appointments.map(a => a._id);
            await Appointment.updateMany(
                { _id: { $in: appointmentIds } },
                {
                    $set: {
                        reminder_24h_sent: true,
                        reminder_24h_sent_at: new Date(),
                        last_updated_at: new Date(),
                        last_updated_by: 'SYSTEM_BULK_REMINDER'
                    }
                }
            );

            // POST to webhook
            const axios = require('axios');
            for (const appt of enriched) {
                const payload = {
                    appointment_id: appt.appointment_id,
                    patient_id: appt.patient_id,
                    child_name: appt.child_name,
                    parent_name: appt.parent_name,
                    status: appt.status,
                    appointment_date: appt.formatted_date || (appt.appointment_date ? appt.appointment_date.toISOString().split('T')[0] : null),
                    appointment_time: appt.start_time || appt.appointment_time,
                    doctor_name: appt.doctor_name,
                    token_number: appt.token_number,
                    event_type: 'APPOINTMENT_REMINDER_24H'
                };
                
                // Fire and forget
                axios.post('https://n8n.brahmaastra.ai/webhook/24hr-message', payload)
                    .catch(err => console.error('[Pending24h] Webhook failed:', err.message));
            }
        }

        res.json({
            success: true,
            date: queryDate,
            count: enriched.length,
            token_generation: tokenGeneration,
            data: enriched
        });
    } catch (err) {
        next(err);
    }
};

// ── 10. PATCH /api/appointments/reminders/:appointment_id/mark-sent ──────────
// Mark a specific reminder type as sent
exports.markReminderSent = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { appointment_id } = req.params;
        const { type } = req.body || {}; // '24h' or '2h'

        if (!['24h', '2h'].includes(type)) {
            return res.status(400).json({ success: false, message: "Type must be '24h' or '2h'" });
        }

        let appointment = await Appointment.findOne({ appointment_id });
        if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });
        if (!ensureDoctorMatches(req, res, appointment.doctor_id, 'You can only update reminders for your own appointments')) return;

        // Validation: Check if the appointment date matches the reminder type
        const now = new Date();
        const appDate = toMidnight(appointment.appointment_date);

        if (type === '24h') {
            const tomorrow = toMidnight(new Date());
            tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
            if (appDate.getTime() !== tomorrow.getTime()) {
                console.warn(`[Reminder Warning] Marking 24h reminder for appointment on ${appDate.toISOString().split('T')[0]}, but today is ${now.toISOString().split('T')[0]}`);
                // We'll allow it but log a warning, as sometimes manual overrides or late triggers happen
            } else if (appointment.token_number === null || appointment.token_number === undefined || !appointment.token_status) {
                await assignTokensForDate(appointment.appointment_date);
                appointment = await Appointment.findOne({ appointment_id });
            }
        } else if (type === '2h') {
            const today = toMidnight(new Date());
            if (appDate.getTime() !== today.getTime()) {
                console.warn(`[Reminder Warning] Marking 2h reminder for appointment on ${appDate.toISOString().split('T')[0]}, but today is ${now.toISOString().split('T')[0]}`);
            }
        }

        const field = type === '24h' ? 'reminder_24h_sent' : 'reminder_2h_sent';
        const timeField = type === '24h' ? 'reminder_24h_sent_at' : 'reminder_2h_sent_at';

        const updatedResource = await Appointment.findOneAndUpdate(
            { appointment_id },
            {
                $set: {
                    [field]: true,
                    [timeField]: new Date(),
                    last_updated_at: new Date(),
                    last_updated_by: 'SYSTEM'
                }
            },
            { new: true }
        );

        res.json({ success: true, message: `Reminder ${type} marked as sent for ${appointment_id} at ${new Date().toISOString()}` });
    } catch (err) {
        next(err);
    }
};

// ── PATCH /api/appointments/:appointment_id/complete ─────────────────────────
exports.completeAppointment = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { appointment_id } = req.params;
        const { notes, next_followup_date } = req.body || {};

        const appt = await Appointment.findOne({ appointment_id });
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
        if (!ensureDoctorMatches(req, res, appt.doctor_id, 'You can only complete appointments assigned to your profile')) return;
        if (appt.status === 'CANCELLED') return res.status(409).json({ success: false, message: 'Cannot complete a cancelled appointment.' });

        await Appointment.updateOne({ appointment_id }, {
            $set: {
                status: 'completed',
                completed_at: new Date(),
                checked_out_at: new Date(),
                completed_by: req.user?.username || 'ADMIN',
                notes: notes || appt.notes,
                next_followup_date: next_followup_date ? new Date(next_followup_date) : null,
                last_updated_at: new Date(),
                last_updated_by: req.user?.username || 'ADMIN'
            }
        });

        await audit({
            event_type: 'APPOINTMENT_COMPLETED', entity_type: 'appointment', entity_id: appointment_id,
            actor: req.user?.username || 'ADMIN', actor_type: req.user ? req.user.role : 'ADMIN'
        });

        res.json({ success: true, message: 'Appointment marked as completed' });
    } catch (err) {
        next(err);
    }
};

// ── PATCH /api/appointments/:appointment_id/no-show ──────────────────────────
exports.markNoShow = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { appointment_id } = req.params;

        const appt = await Appointment.findOne({ appointment_id });
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
        if (!ensureDoctorMatches(req, res, appt.doctor_id, 'You can only mark no-show for appointments assigned to your profile')) return;
        if (appt.status === 'CANCELLED') return res.status(409).json({ success: false, message: 'Cannot mark a cancelled appointment as no-show.' });

        await Appointment.updateOne({ appointment_id }, {
            $set: {
                status: 'no_show',
                no_show_at: new Date(),
                last_updated_at: new Date(),
                last_updated_by: req.user?.username || 'ADMIN'
            }
        });

        await audit({
            event_type: 'APPOINTMENT_NO_SHOW', entity_type: 'appointment', entity_id: appointment_id,
            actor: req.user?.username || 'ADMIN', actor_type: req.user ? req.user.role : 'ADMIN'
        });

        res.json({ success: true, message: 'Appointment marked as no-show' });
    } catch (err) {
        next(err);
    }
};

// ── DELETE /api/appointments/:appointment_id ──────────────────────────────────
exports.deleteAppointment = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { appointment_id } = req.params;
        const actor = req.user ? req.user.username : 'ADMIN';

        const existing = await Appointment.findOne({ appointment_id, is_deleted: false });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Appointment not found' });
        }
        if (!ensureDoctorMatches(req, res, existing.doctor_id, 'You can only delete appointments assigned to your profile')) return;

        const appt = await Appointment.findOneAndUpdate(
            { appointment_id, is_deleted: false },
            { $set: { is_deleted: true, deleted_at: new Date(), deleted_by: actor } },
            { new: true }
        );

        await audit({
            event_type: 'APPOINTMENT_DELETED',
            entity_type: 'appointment',
            entity_id: appointment_id,
            actor,
            actor_type: req.user ? req.user.role : 'ADMIN'
        });

        res.json({ success: true, message: 'Appointment deleted successfully' });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/appointments/reminders/pending-2h ────────────────────────────────
exports.getPending2hReminders = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const now = new Date();
        const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        const today = toMidnight(now);

        const reminderFilter = withDoctorFilter(req, {
            appointment_date: today,
            status: { $in: ['BOOKED', 'CONFIRMED', 'PENDING'] },
            reminder_2h_sent: { $ne: true },
            is_deleted: false
        });

        const appointments = await Appointment.find(reminderFilter).sort({ token_number: 1 });

        // Filter to those whose appointment_time is within the next 2 hours (using token start_time)
        const result = [];
        for (const appt of appointments) {
            const timeStr = appt.appointment_time || '10:00';
            const [h, m] = timeStr.split(':').map(Number);
            // appointment_time is stored in IST; convert to UTC for comparison
            const apptTimeUTC = new Date(today);
            apptTimeUTC.setUTCHours(h - 5, m - 30, 0, 0);
            if (apptTimeUTC >= now && apptTimeUTC <= twoHoursLater) {
                result.push(appt);
            }
        }

        const enriched = await Promise.all(result.map(enrichAppointment));
        res.json({ success: true, data: enriched });
    } catch (err) {
        next(err);
    }
};


// @desc    Get available tokens for a doctor and date
// @route   GET /api/appointments/tokens/available
exports.getAvailableTokens = async (req, res) => {
    try {
        const { doctor_id, date } = req.query;
        if (!doctor_id || !date) {
            return res.status(400).json({ success: false, message: 'doctor_id and date are required' });
        }

        const queryDate = toMidnight(date);
        const shift = await getDoctorShiftConfig(doctor_id, queryDate);

        if (shift.is_holiday) {
            return res.json({
                success: true,
                data: { doctor_id, date, is_holiday: true, message: 'Clinic is closed on this date' }
            });
        }

        const [onlineBooked, walkinBooked] = await Promise.all([
            Appointment.countDocuments({
                doctor_id,
                appointment_date: queryDate,
                registration_type: 'online',
                is_deleted: false,
                status: { $ne: 'CANCELLED' }
            }),
            Appointment.countDocuments({
                doctor_id,
                appointment_date: queryDate,
                registration_type: 'walkin',
                is_deleted: false,
                status: { $ne: 'CANCELLED' }
            })
        ]);

        const onlineRemaining = Math.max(0, shift.online - onlineBooked);
        // Walk-in is free (decided by admin/staff), so we report a large number for UX
        const walkinRemaining = 999;

        res.json({
            success: true,
            data: {
                doctor_id,
                date: queryDate.toISOString().split('T')[0],
                online_tokens_remaining: onlineRemaining,
                walkin_tokens_remaining: walkinRemaining,
                online_next_token: onlineRemaining > 0 ? onlineBooked + 1 : null,
                walkin_next_token: walkinBooked + 1,
                total_online_limit: shift.online,
                walkin_allotment: 'FREE',
                start_time: shift.start_time
            }
        });
    } catch (err) {
        next(err);
    }
};

// @desc    Check-in an appointment
// @route   PATCH /api/appointments/:appointment_id/checkin
exports.checkInAppointment = async (req, res) => {
    try {
        const { appointment_id } = req.params;
        const appt = await Appointment.findOneAndUpdate(
            { appointment_id, is_deleted: false },
            {
                $set: {
                    status: 'checked_in',
                    checked_in_at: new Date(),
                    token_status: 'CHECKED_IN',
                    last_updated_at: new Date(),
                    last_updated_by: req.user?.username || 'ADMIN'
                }
            },
            { new: true }
        );

        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });

        await audit({
            event_type: 'APPOINTMENT_CHECKIN',
            entity_type: 'appointment',
            entity_id: appointment_id,
            actor: req.user?.username || 'ADMIN',
            actor_type: req.user?.role || 'ADMIN'
        });

        res.json({ success: true, message: 'Patient checked in', data: appt });
    } catch (err) {
        next(err);
    }
};

// @desc    Check-out an appointment
// @route   PATCH /api/appointments/:appointment_id/checkout
exports.checkOutAppointment = async (req, res) => {
    try {
        const { appointment_id } = req.params;
        const appt = await Appointment.findOneAndUpdate(
            { appointment_id, is_deleted: false },
            {
                $set: {
                    status: 'completed',
                    checked_out_at: new Date(),
                    token_status: 'COMPLETED',
                    last_updated_at: new Date(),
                    last_updated_by: req.user?.username || 'ADMIN'
                }
            },
            { new: true }
        );

        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });

        await audit({
            event_type: 'APPOINTMENT_CHECKOUT',
            entity_type: 'appointment',
            entity_id: appointment_id,
            actor: req.user?.username || 'ADMIN',
            actor_type: req.user?.role || 'ADMIN'
        });

        res.json({ success: true, message: 'Patient checked out and completed', data: appt });
    } catch (err) {
        next(err);
    }
};



