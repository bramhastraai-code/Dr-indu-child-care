const Doctor = require('../../models/Doctor');
const DoctorAvailability = require('../../models/DoctorAvailability');
const Appointment = require('../../models/Appointment');
const Patient = require('../../models/Patient');
const audit = require('../../utils/audit');
const { toMidnight } = require('../../utils/helpers');
const { calculateTokenTime } = require('../../utils/tokenHelpers');
const { handleDoctorLate, handleDoctorArrived } = require('../../services/doctorLateWorkflow');
const { decrypt } = require('../../utils/encryption');
const { triggerWebhook } = require('../../services/webhookService');

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const getTodayDayName = () => DAYS[new Date().getDay()];
const getDayNameForDate = (date) => DAYS[new Date(date).getDay()];

const ensureAvailabilityRecord = async (doctor) => {
    try {
        // Availability is a singleton per doctor (date: null is no longer strictly required in query if doctor_id is unique)
        // We look for any record for this doctor. The unique index on doctor_id ensures we only have one.
        let record = await DoctorAvailability.findOneAndUpdate(
            { doctor_id: doctor.doctor_id },
            {
                $setOnInsert: {
                    doctor_name: doctor.name,
                    status: 'PRESENT',
                    date: null, // Keep it null explicitly for consistency if needed, but not as a query constraint
                    updated_at: new Date()
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        return record;
    } catch (err) {
        console.error(`[ensureAvailabilityRecord] Error for ${doctor.doctor_id}:`, err);
        throw err;
    }
};



// Validate time string in HH:MM format
const isValidTime = (t) => {
    if (!t) return false;
    return /^\d{2}:\d{2}$/.test(t);
};

// ── GET /api/doctor/schedule/:doctor_id ────────────────────────────────────
// Returns the full weekly arrival schedule for a doctor
exports.getSchedule = async (req, res) => {
    try {
        const { doctor_id } = req.params;

        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        let schedule = await DoctorAvailability.findOne({ doctor_id });

        // If no schedule exists yet, return defaults
        if (!schedule) {
            return res.json({
                success: true,
                doctor_id,
                doctor_name: doctor.name,
                schedule: {
                    monday: { arrival_time: '10:00', is_working: true },
                    tuesday: { arrival_time: '10:00', is_working: true },
                    wednesday: { arrival_time: '10:00', is_working: true },
                    thursday: { arrival_time: '10:00', is_working: true },
                    friday: { arrival_time: '10:00', is_working: true },
                    saturday: { arrival_time: '10:00', is_working: true },
                    sunday: { arrival_time: null, is_working: false }
                },
                message: 'No schedule saved yet — showing defaults'
            });
        }

        res.json({
            success: true,
            doctor_id,
            doctor_name: schedule.doctor_name,
            schedule: schedule.schedule,
            updated_at: schedule.updated_at,
            updated_by: schedule.updated_by
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// GET /api/doctor/availability/:doctor_id?date=YYYY-MM-DD
// Returns availability + queue snapshot for a given date
exports.getAvailability = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        const { date } = req.query;
        if (!date) return res.status(400).json({ success: false, message: 'date is required' });

        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const record = await ensureAvailabilityRecord(doctor);
        if (!record) throw new Error('Could not find or create availability record');

        const queryDate = toMidnight(date || new Date());
        const dayName = getDayNameForDate(queryDate);

        // Use schedule from the master record
        const schedule = record.schedule || {};
        const daySchedule = schedule[dayName] || { arrival_time: '10:00', is_working: true };

        const queueTotal = await Appointment.countDocuments({
            doctor_id,
            appointment_date: queryDate,
            is_deleted: false,
            status: { $nin: ['CANCELLED', 'NO_SHOW'] }
        });

        res.json({
            success: true,
            data: {
                doctor_id,
                doctor_name: doctor.name,
                date: queryDate.toISOString().split('T')[0],
                day: dayName,
                arrival_time: daySchedule.arrival_time,
                is_working: daySchedule.is_working,
                status: record.status || 'PRESENT',
                eta_minutes: record.eta_minutes ?? null,
                eta_time: record.eta_time ?? null,
                notes: record.notes ?? null,
                queue: { total: queueTotal }
            }
        });

    } catch (err) {
        console.error(`[getAvailability] ERROR for ${req.params.doctor_id}:`, err);
        res.status(500).json({ success: false, error: err.message });
    }
};


// GET /api/doctor/availability-dashboard/:doctor_id
// Returns lightweight dashboard snapshot
exports.getAvailabilityDashboard = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        console.log(`[getAvailabilityDashboard] Loading for ${doctor_id}`);
        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const record = await ensureAvailabilityRecord(doctor);
        if (!record) throw new Error('Failed to ensure availability record');

        const today = toMidnight(new Date());
        const queueTotal = await Appointment.countDocuments({
            doctor_id,
            appointment_date: today,
            is_deleted: false,
            status: { $nin: ['CANCELLED', 'NO_SHOW'] }
        });

        res.json({
            success: true,
            data: {
                doctor_id,
                doctor_name: doctor.name,
                availability: {
                    status: record.status || 'PRESENT',
                    eta_minutes: record.eta_minutes ?? null,
                    eta_time: record.eta_time ?? null,
                    notes: record.notes ?? null
                },
                queue_summary: { total: queueTotal }
            }
        });
    } catch (err) {
        console.error(`[getAvailabilityDashboard] ERROR for ${req.params.doctor_id}:`, err);
        res.status(500).json({ success: false, error: err.message });
    }
};


// POST /api/doctor/availability/update
exports.updateAvailability = async (req, res) => {
    try {
        const { doctor_id, status, eta_minutes, eta_time, notes } = req.body || {};
        if (!doctor_id) return res.status(400).json({ success: false, message: 'doctor_id is required' });

        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const record = await ensureAvailabilityRecord(doctor);
        const prevStatus = record.status;

        record.status = status || record.status || 'PRESENT';
        if (eta_minutes !== undefined) record.eta_minutes = eta_minutes;
        if (eta_time !== undefined) record.eta_time = eta_time;
        if (notes !== undefined) record.notes = notes;
        record.updated_at = new Date();
        record.updated_by = req.user?.username || 'ADMIN';
        await record.save();

        if (record.status === 'LATE') {
            await handleDoctorLate(doctor.doctor_id, doctor.name, Number(record.eta_minutes) || 0, record.eta_time || null);
        } else if (prevStatus === 'LATE' && record.status === 'PRESENT') {
            await handleDoctorArrived(doctor.doctor_id, doctor.name);
        }

        res.json({ success: true, message: 'Availability updated', data: record });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// PATCH /api/doctor/availability/:doctor_id/status
exports.updateAvailabilityStatus = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        let { status, notes } = req.body || {};

        // Robust handling if Frontend accidentally sends { status: { status: '...' } }
        if (status && typeof status === 'object' && status.status) {
            if (notes === undefined && status.notes !== undefined) notes = status.notes;
            status = status.status;
        }

        if (!status || typeof status !== 'string') {
            return res.status(400).json({ success: false, message: 'valid string status is required' });
        }

        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const record = await ensureAvailabilityRecord(doctor);
        const prevStatus = record.status;
        record.status = status;
        if (notes !== undefined) record.notes = notes;
        record.updated_at = new Date();
        record.updated_by = req.user?.username || 'ADMIN';
        await record.save();

        if (record.status === 'LATE') {
            await handleDoctorLate(doctor.doctor_id, doctor.name, Number(record.eta_minutes) || 0, record.eta_time || null);
        } else if (prevStatus === 'LATE' && record.status === 'PRESENT') {
            await handleDoctorArrived(doctor.doctor_id, doctor.name);
        }

        res.json({ success: true, message: 'Status updated', data: record });
    } catch (err) {
        console.error('[updateAvailabilityStatus] ERROR:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};


// PATCH /api/doctor/availability/:doctor_id/eta
exports.updateAvailabilityEta = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        const { eta_minutes, eta_time, reason } = req.body || {};

        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const record = await ensureAvailabilityRecord(doctor);
        if (eta_minutes !== undefined) record.eta_minutes = eta_minutes;
        if (eta_time !== undefined) record.eta_time = eta_time;
        if (reason !== undefined) record.notes = reason;
        record.updated_at = new Date();
        record.updated_by = req.user?.username || 'ADMIN';
        await record.save();

        res.json({ success: true, message: 'ETA updated', data: record });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// POST /api/doctor/late-checkin
exports.logLateCheckin = async (req, res) => {
    try {
        const { doctor_id, eta_minutes, reason } = req.body || {};
        if (!doctor_id) return res.status(400).json({ success: false, message: 'doctor_id is required' });

        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const record = await ensureAvailabilityRecord(doctor);
        record.status = 'LATE';
        record.eta_minutes = Number(eta_minutes) || 0;
        if (reason) record.notes = reason;
        record.updated_at = new Date();
        record.updated_by = req.user?.username || 'ADMIN';
        await record.save();

        await handleDoctorLate(doctor.doctor_id, doctor.name, Number(record.eta_minutes) || 0, record.eta_time || null);

        res.json({ success: true, message: 'Late check-in logged', data: record });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// GET /api/doctor/late-checkins/:doctor_id
exports.getLateCheckins = async (req, res) => {
    try {
        // Placeholder: no historical log stored in this model.
        res.json({ success: true, data: [] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── PUT /api/doctor/schedule/:doctor_id ────────────────────────────────────
// Set or update the weekly arrival schedule for a doctor
// Body: { schedule: { monday: { arrival_time: "10:00", is_working: true }, ... } }
exports.setSchedule = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        const { schedule } = req.body || {};

        if (!schedule || typeof schedule !== 'object') {
            return res.status(400).json({ success: false, message: 'schedule object is required' });
        }

        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        // Validate and build the schedule update
        const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const scheduleUpdate = {};

        for (const day of validDays) {
            if (schedule[day] !== undefined) {
                const dayData = schedule[day];
                if (typeof dayData !== 'object') {
                    return res.status(400).json({ success: false, message: `Invalid data for ${day}` });
                }

                const is_working = dayData.is_working !== undefined ? Boolean(dayData.is_working) : true;
                const arrival_time = is_working ? (dayData.arrival_time || null) : null;

                if (is_working && arrival_time && !isValidTime(arrival_time)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid arrival_time for ${day}: use HH:MM format (e.g. "10:00")`
                    });
                }

                scheduleUpdate[`schedule.${day}`] = { arrival_time, is_working };
            }
        }

        // Fetch current record so we can snapshot it into history
        const existing = await DoctorAvailability.findOne({ doctor_id }).lean();

        const updated = await DoctorAvailability.findOneAndUpdate(
            { doctor_id },
            {
                $set: {
                    ...scheduleUpdate,
                    doctor_name: doctor.name,
                    updated_at: new Date(),
                    updated_by: req.user?.username || 'ADMIN'
                },
                // Push the previous schedule as a history snapshot
                $push: {
                    change_history: {
                        changed_at: new Date(),
                        changed_by: req.user?.username || 'ADMIN',
                        snapshot: existing?.schedule || null
                    }
                }
            },
            { upsert: true, new: true }
        );

        await audit({
            event_type: 'DOCTOR_SCHEDULE_UPDATED',
            entity_type: 'doctor_schedule',
            entity_id: doctor_id,
            actor: req.user?.username || 'ADMIN',
            actor_type: 'ADMIN',
            new_value: scheduleUpdate
        });

        res.json({
            success: true,
            message: 'Weekly schedule updated successfully',
            doctor_id,
            doctor_name: updated.doctor_name,
            schedule: updated.schedule,
            updated_at: updated.updated_at
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── GET /api/doctor/schedule/:doctor_id/today ──────────────────────────────
// Returns today's arrival time and working status for a doctor
exports.getTodaySchedule = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        const today = getTodayDayName();

        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const record = await DoctorAvailability.findOne({ doctor_id });
        const todaySchedule = record?.schedule?.[today] || { arrival_time: '10:00', is_working: true };

        res.json({
            success: true,
            doctor_id,
            doctor_name: doctor.name,
            day: today,
            arrival_time: todaySchedule.arrival_time,
            is_working: todaySchedule.is_working,
            message: todaySchedule.is_working
                ? `Doctor arrives at ${todaySchedule.arrival_time || 'unspecified time'} today (${today})`
                : `Doctor is not working today (${today})`
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── GET /api/doctor/schedule/:doctor_id/history ────────────────────────────
// Returns the full change history for a doctor's schedule
exports.getScheduleHistory = async (req, res) => {
    try {
        const { doctor_id } = req.params;

        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const record = await DoctorAvailability.findOne({ doctor_id }).lean();
        if (!record) {
            return res.json({ success: true, doctor_id, doctor_name: doctor.name, total: 0, history: [] });
        }

        // Return newest first
        const history = (record.change_history || []).slice().reverse();

        res.json({
            success: true,
            doctor_id,
            doctor_name: doctor.name,
            total: history.length,
            history
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── PATCH /api/doctor/today-start ─────────────────────────────────────────────
// Sets the doctor's start time for today. Recalculates appointment times.
// Does NOT send patient notifications by default — use POST /notify-patients for that.
exports.setTodayStartTime = async (req, res) => {
    try {
        // notify_patients defaults to FALSE — admin just sets the time silently
        const { doctor_id, start_time, notify_patients = false } = req.body || {};

        if (!doctor_id || !start_time) {
            return res.status(400).json({ success: false, message: 'doctor_id and start_time (HH:MM) are required' });
        }
        if (!/^\d{2}:\d{2}$/.test(start_time)) {
            return res.status(400).json({ success: false, message: 'start_time must be in HH:MM format (e.g. "11:30")' });
        }

        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const today = toMidnight(new Date());

        // 1. Save today_start_time in DoctorAvailability
        const record = await DoctorAvailability.findOneAndUpdate(
            { doctor_id },
            {
                $set: {
                    today_start_time: start_time,
                    today_start_notified_at: notify_patients ? new Date() : null,
                    updated_at: new Date(),
                    updated_by: req.user?.username || 'ADMIN'
                }
            },
            { upsert: true, new: true }
        );

        // 2. Fetch all active (non-cancelled) appointments for today for this doctor
        const appointments = await Appointment.find({
            doctor_id,
            appointment_date: today,
            is_deleted: false,
            status: { $nin: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] }
        }).sort({ token_number: 1 }).lean();

        // 3. Recalculate appointment times and bulk-update
        const bulkOps = [];
        const updatedTimes = {}; // token_number -> new appointment_time

        for (const appt of appointments) {
            if (!appt.token_number) continue;
            const newTime = calculateTokenTime(start_time, appt.token_number);
            updatedTimes[appt.token_number] = newTime;
            bulkOps.push({
                updateOne: {
                    filter: { _id: appt._id },
                    update: {
                        $set: {
                            appointment_time: newTime,
                            last_updated_at: new Date(),
                            last_updated_by: 'SYSTEM_TODAY_START'
                        }
                    }
                }
            });
        }

        if (bulkOps.length > 0) {
            await Appointment.bulkWrite(bulkOps, { ordered: false });
        }

        // 4. Send WhatsApp notifications to each patient
        let notifiedCount = 0;
        if (notify_patients && appointments.length > 0) {
            const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

            for (const appt of appointments) {
                if (!appt.token_number) continue;
                try {
                    const patient = await Patient.findOne({ patient_id: appt.patient_id }).lean();
                    if (!patient) continue;

                    // Resolve wa_id (may be encrypted)
                    let waId = appt.wa_id || patient.wa_id;
                    try { waId = decrypt(waId); } catch (_) { /* raw */ }
                    waId = String(waId || '').replace(/\D/g, '');
                    if (!waId) continue;

                    const newTime = updatedTimes[appt.token_number];

                    // Trigger n8n webhook for time update (using lowercase)
                    await triggerWebhook('doctor-update', {
                        parent_name: patient.father_name || patient.mother_name || patient.parent_name || 'Parent',
                        child_name: patient.child_name || 'Your child',
                        doctor_name: doctor.name,
                        date: dateStr,
                        appointment_time: newTime,
                        token: `#${appt.token_number} (${appt.token_pool || 'ONLINE'})`,
                        token_number: appt.token_number,
                        clinic_name: process.env.CLINIC_NAME || 'Dr. Indu Child Care Clinic',
                        clinic_contact: process.env.CLINIC_PHONE || '',
                        event_type: 'APPOINTMENT_TIME_UPDATED'
                    });
                    notifiedCount++;
                } catch (waErr) {
                    console.error(`[setTodayStartTime] WhatsApp error for appt ${appt.appointment_id}:`, waErr.message);
                }
            }
        }

        // 5. Audit
        await audit({
            event_type: 'DOCTOR_TODAY_START_SET',
            entity_type: 'doctor_availability',
            entity_id: doctor_id,
            actor: req.user?.username || 'ADMIN',
            actor_type: req.user?.role || 'ADMIN',
            new_value: { start_time, appointments_updated: bulkOps.length, patients_notified: notifiedCount }
        });

        res.json({
            success: true,
            message: `Today's start time set to ${start_time}. ${bulkOps.length} appointment(s) updated. ${notifiedCount} patient(s) notified.`,
            data: {
                doctor_id,
                doctor_name: doctor.name,
                today_start_time: start_time,
                appointments_updated: bulkOps.length,
                patients_notified: notifiedCount
            }
        });
    } catch (err) {
        console.error('[setTodayStartTime]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── POST /api/doctor/notify-patients ──────────────────────────────────────────
// Explicitly notify all patients of today's current appointment times.
// Called when the doctor/receptionist clicks "Notify All Patients" in the dashboard.
// Does NOT change any times — reads what is already set.
exports.notifyPatientsOfTime = async (req, res) => {
    try {
        const { doctor_id } = req.body || {};
        if (!doctor_id) {
            return res.status(400).json({ success: false, message: 'doctor_id is required' });
        }

        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const today = toMidnight(new Date());

        // Get all active appointments for today
        const appointments = await Appointment.find({
            doctor_id,
            appointment_date: today,
            is_deleted: false,
            status: { $nin: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] }
        }).sort({ token_number: 1 }).lean();

        if (appointments.length === 0) {
            return res.json({ success: true, message: 'No active patients to notify today.', patients_notified: 0 });
        }

        const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        let notifiedCount = 0;

        for (const appt of appointments) {
            if (!appt.token_number || !appt.appointment_time) continue;
            try {
                const patient = await Patient.findOne({ patient_id: appt.patient_id }).lean();
                if (!patient) continue;

                // Resolve wa_id (may be encrypted)
                let waId = appt.wa_id || patient.wa_id;
                try { waId = decrypt(waId); } catch (_) { /* raw */ }
                waId = String(waId || '').replace(/\D/g, '');
                if (!waId) continue;

                // Trigger n8n webhook (using lowercase)
                await triggerWebhook('doctor-update', {
                    parent_name: patient.father_name || patient.mother_name || patient.parent_name || 'Parent',
                    child_name: patient.child_name || 'Your child',
                    doctor_name: doctor.name,
                    date: dateStr,
                    appointment_time: appt.appointment_time,
                    token: `#${appt.token_number} (${appt.token_pool || 'ONLINE'})`,
                    token_number: appt.token_number,
                    clinic_name: process.env.CLINIC_NAME || 'Dr. Indu Child Care Clinic',
                    clinic_contact: process.env.CLINIC_PHONE || '',
                    event_type: 'APPOINTMENT_TIME_UPDATED'
                });
                notifiedCount++;
            } catch (waErr) {
                console.error(`[notifyPatientsOfTime] WhatsApp error for appt ${appt.appointment_id}:`, waErr.message);
            }
        }

        // Mark notification timestamp
        await DoctorAvailability.findOneAndUpdate(
            { doctor_id },
            { $set: { today_start_notified_at: new Date(), updated_at: new Date() } }
        );

        await audit({
            event_type: 'PATIENTS_NOTIFIED_OF_TIME',
            entity_type: 'doctor_availability',
            entity_id: doctor_id,
            actor: req.user?.username || 'ADMIN',
            actor_type: req.user?.role || 'ADMIN',
            new_value: { patients_notified: notifiedCount, date: today }
        });

        res.json({
            success: true,
            message: `${notifiedCount} patient(s) have been notified of their appointment times.`,
            data: { doctor_id, doctor_name: doctor.name, patients_notified: notifiedCount }
        });
    } catch (err) {
        console.error('[notifyPatientsOfTime]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
