const Appointment = require('../../models/Appointment');
const Patient = require('../../models/Patient');
const DoctorAvailability = require('../../models/DoctorAvailability');
const Doctor = require('../../models/Doctor');
const audit = require('../../utils/audit');
const { toMidnight, normalizeWaId, normalizePhone, canonicalizeDoctorName, getNextToken: getNextTokenNumber } = require('../../utils/helpers');
const { hashField } = require('../../utils/encryption');
const { generateAppointmentId, assignTokensForDate } = require('./appointment.controller');
const {
    getDoctorIdFromSession,
    ensureDoctorSessionHasProfile,
    ensureDoctorMatches
} = require('../../utils/doctorScope');
const { getDoctorShiftConfig } = require('../../utils/tokenHelpers');

// Helper: Update doctor consultation rolling average
const updateDoctorConsultationStats = async (doctor_id, durationMinutes) => {
    if (!durationMinutes || durationMinutes <= 0) return;

    // Cap duration to reasonable limits (e.g., 2 mins min, 60 mins max) to avoid outliers
    const cappedDuration = Math.max(2, Math.min(60, durationMinutes));

    const doctor = await Doctor.findOne({ doctor_id });
    if (!doctor) return;

    const oldCount = doctor.consultation_count || 0;
    const oldAvg = doctor.avg_consultation_time || 10;
    const newCount = oldCount + 1;

    // Rolling average formula
    const newAvg = ((oldAvg * oldCount) + cappedDuration) / newCount;

    await Doctor.updateOne(
        { doctor_id },
        {
            $set: {
                avg_consultation_time: Math.round(newAvg * 10) / 10,
                consultation_count: newCount
            }
        }
    );
};

// Helper: resolve doctor by ID or canonical name
const resolveDoctor = async (doctor_id, doctor_name) => {
    if (doctor_id) {
        return await Doctor.findOne({ doctor_id });
    }
    if (doctor_name) {
        const canonical = canonicalizeDoctorName(doctor_name);
        return await Doctor.findOne({
            $or: [
                { name: { $regex: new RegExp(`^${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
                { name: { $regex: new RegExp(`^${doctor_name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
            ]
        });
    }
    return null;
};

const resolveScopedDoctorInput = (req, doctor_id, doctor_name) => {
    const sessionDoctorId = getDoctorIdFromSession(req);
    if (!sessionDoctorId) return { doctor_id, doctor_name };
    return { doctor_id: sessionDoctorId, doctor_name: null };
};

// Helper: generate next token number for a doctor on a given date (exported)
const getNextTokenNumberForDoctor = (doctor_id, date) => getNextTokenNumber(Appointment, doctor_id, date);
exports.getNextTokenNumberForDoctor = getNextTokenNumberForDoctor;

// ── POST /api/appointments/book-with-token ──────────────────────────
// Modern wrapper for createAppointment using token system
exports.bookWithToken = async (req, res) => {
    // Re-route to createAppointment logic or just tell them to use that
    const { createAppointment } = require('./appointment.controller');
    return createAppointment(req, res);
};

// ── POST /api/appointments/token/:token/check-in ────────────────────
exports.checkIn = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { token } = req.params;
        const { doctor_id, date } = req.body || {};
        const queryDate = toMidnight(date || new Date());
        const sessionDoctorId = getDoctorIdFromSession(req);
        const effectiveDoctorId = sessionDoctorId || doctor_id;

        if (!effectiveDoctorId) {
            return res.status(400).json({ success: false, message: 'doctor_id is required' });
        }
        if (!ensureDoctorMatches(req, res, effectiveDoctorId, 'You can only check-in tokens for your own queue')) return;

        const filter = { token_number: parseInt(token), appointment_date: queryDate, doctor_id: effectiveDoctorId };

        const appt = await Appointment.findOneAndUpdate(
            filter,
            { $set: { check_in_time: new Date(), token_status: 'CHECKED_IN', last_updated_at: new Date() } },
            { new: true }
        );

        if (!appt) return res.status(404).json({ success: false, message: `Token ${token} not found for today` });

        res.json({ success: true, message: `Token ${token} checked in`, data: appt });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/appointments/daily-tokens ──────────────────────────────
exports.getDailyTokens = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { doctor_id, doctor_name, date } = req.query;
        const queryDate = toMidnight(date || new Date());

        // Ensure all appointments for this date have tokens assigned
        await assignTokensForDate(queryDate);
        const sessionDoctorId = getDoctorIdFromSession(req);

        const filter = { appointment_date: queryDate, token_number: { $ne: null }, is_deleted: false };

        if (sessionDoctorId) {
            filter.doctor_id = sessionDoctorId;
        } else if (doctor_id || doctor_name) {
            const dr = await resolveDoctor(doctor_id, doctor_name);
            if (dr) filter.doctor_id = dr.doctor_id;
            else if (doctor_name) filter.doctor_name = new RegExp(doctor_name, 'i');
        }

        const appointments = await Appointment.find(filter)
            .sort({ doctor_id: 1, token_number: 1 })
            .lean();

        // Enrich with patient names
        const patientIds = [...new Set(appointments.map(a => a.patient_id))];
        const patients = await Patient.find({ patient_id: { $in: patientIds } })
            .select('patient_id child_name full_name')
            .lean();
        const patientMap = {};
        patients.forEach(p => { patientMap[p.patient_id] = p.child_name || p.full_name; });

        // Group by doctor to calculate approx_time dynamically
        const docs = await Doctor.find({ is_active: true }).lean();
        const drAvgMap = {};
        docs.forEach(d => { drAvgMap[d.doctor_id] = d.avg_consultation_time || 10; });

        const now = new Date();
        const docQueues = {};

        // Separate out into queues by doctor
        appointments.forEach(a => {
            if (!docQueues[a.doctor_id]) {
                docQueues[a.doctor_id] = {
                    inProgress: null,
                    waiting: [],
                    avgTime: drAvgMap[a.doctor_id] || 10
                };
            }
            if (a.token_status === 'IN_PROGRESS') {
                docQueues[a.doctor_id].inProgress = a;
            } else if (a.token_status === 'CHECKED_IN' || a.token_status === 'WAITING') {
                docQueues[a.doctor_id].waiting.push(a);
            }
        });

        // Calculate dynamic rolling approx_time relative to now if there is an active queue
        appointments.forEach(a => {
            a.approx_time = a.appointment_time || null;
            if (a.token_status === 'COMPLETED') {
                a.approx_time = 'Completed';
            } else if (a.token_status === 'SKIPPED' || a.token_status === 'NO_SHOW') {
                a.approx_time = a.token_status; // Just reflect the status
            } else if (a.token_status === 'IN_PROGRESS') {
                a.approx_time = 'Now';
            }
        });

        for (const drId in docQueues) {
            const queue = docQueues[drId];
            queue.waiting.sort((a, b) => {
                // Priority: CHECKED_IN over WAITING, then by token number
                if (a.token_status === 'CHECKED_IN' && b.token_status !== 'CHECKED_IN') return -1;
                if (a.token_status !== 'CHECKED_IN' && b.token_status === 'CHECKED_IN') return 1;
                return (a.token_number || 0) - (b.token_number || 0);
            });

            let currentMinsFromNow = 0;
            if (queue.inProgress && queue.inProgress.called_at) {
                const elapsed = Math.round((now - new Date(queue.inProgress.called_at)) / 60000);
                currentMinsFromNow = Math.max(0, queue.avgTime - elapsed);
            }

            let rollingWaitIndex = 0;
            queue.waiting.forEach(waitingAppt => {
                const totalWaitMins = currentMinsFromNow + (rollingWaitIndex * queue.avgTime);
                const projectedTime = new Date(now.getTime() + totalWaitMins * 60000);

                let [baseH, baseM] = (waitingAppt.appointment_time || '10:00').split(':').map(Number);
                const scheduledTime = new Date(queryDate.getTime());
                scheduledTime.setHours(baseH, baseM, 0, 0);

                // Use the projected time if it's delayed past the scheduled time, else use the scheduled time
                const finalTime = projectedTime > scheduledTime ? projectedTime : scheduledTime;

                // Format it back to YYYY-MM-DD HH:MM AM/PM
                const year = finalTime.getFullYear();
                const month = String(finalTime.getMonth() + 1).padStart(2, '0');
                const day = String(finalTime.getDate()).padStart(2, '0');
                const minutes = finalTime.getMinutes().toString().padStart(2, '0');
                const ampm = finalTime.getHours() >= 12 ? 'PM' : 'AM';
                const hours12 = (finalTime.getHours() % 12) || 12;

                waitingAppt.approx_time = `${year}-${month}-${day} ${hours12}:${minutes} ${ampm}`;
                rollingWaitIndex++;
            });
        }

        const enriched = appointments.map(a => ({
            _id: a._id,
            patient_id: a.patient_id,
            child_name: patientMap[a.patient_id] || null,
            token: a.token_number,
            token_display: a.token_display,
            token_number: a.token_number,
            token_pool: a.token_pool,
            appointment_date: a.appointment_date,
            appointment_time: a.appointment_time,
            approx_time: a.approx_time || a.appointment_time,
            status: a.token_status,
            appointment_id: a.appointment_id,
            doctor_name: a.doctor_name,
            doctor_id: a.doctor_id
        }));

        res.json({
            success: true,
            date: queryDate,
            total: appointments.length,
            data: enriched
        });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/appointments/clinic-display ────────────────────────────
// Public-facing clinic display board
exports.getClinicDisplay = async (req, res) => {
    try {
        const { date } = req.query;
        const queryDate = toMidnight(date || new Date());

        // Ensure all appointments for this date have tokens assigned
        await assignTokensForDate(queryDate);

        // Get all active doctors' availability
        const availabilities = await DoctorAvailability.find({ date: queryDate }).lean();
        const availMap = {};
        availabilities.forEach(a => { availMap[a.doctor_id] = a; });

        // Get in-progress and recent completed tokens
        const activeTokens = await Appointment.find({
            appointment_date: queryDate,
            token_number: { $ne: null },
            token_status: { $in: ['IN_PROGRESS', 'WAITING', 'CHECKED_IN'] },
            is_deleted: false
        }).sort({ doctor_id: 1, token_number: 1 }).lean();

        const patientIds = [...new Set(activeTokens.map(a => a.patient_id))];
        const patients = await Patient.find({ patient_id: { $in: patientIds } })
            .select('patient_id child_name').lean();
        const pMap = {};
        patients.forEach(p => { pMap[p.patient_id] = p.child_name; });

        // Build per-doctor display data
        const doctors = await Doctor.find({ is_active: true }).lean();
        const display = doctors.map(dr => {
            const avail = availMap[dr.doctor_id] || { status: 'PRESENT', current_token: 0, eta_time: 'No Delay' };
            const drTokens = activeTokens.filter(t => t.doctor_id === dr.doctor_id);
            const nowServing = drTokens.find(t => t.token_status === 'IN_PROGRESS');
            // Priority: CHECKED_IN tokens first, then WAITING tokens, both sorted by token_number
            const waiting = [
                ...drTokens.filter(t => t.token_status === 'CHECKED_IN'),
                ...drTokens.filter(t => t.token_status === 'WAITING')
            ];

            return {
                doctor_id: dr.doctor_id,
                doctor_name: dr.name,
                speciality: dr.speciality,
                now_serving_token: nowServing?.token_number || null,
                now_serving_patient: nowServing ? pMap[nowServing.patient_id] : null,
                next_token: waiting[0]?.token_number || null,
                queue_length: waiting.length,
                status: avail.status || 'PRESENT',
                eta_time: avail.eta_time || 'No Delay'
            };
        });

        res.json({
            success: true,
            date: queryDate,
            generated_at: new Date(),
            display
        });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/appointments/next-token/:doctor_id ──────────────────────
// Advance the queue — mark current IN_PROGRESS as COMPLETED, call next CHECKED_IN
exports.getNextToken = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        if (!ensureDoctorSessionHasProfile(req, res)) return;
        if (!ensureDoctorMatches(req, res, doctor_id, 'You can only advance your own queue')) return;
        const queryDate = toMidnight(new Date());

        // Complete current in-progress
        const currentInProgress = await Appointment.findOne({ doctor_id, appointment_date: queryDate, token_status: 'IN_PROGRESS' });
        if (currentInProgress) {
            const now = new Date();
            const calledAt = currentInProgress.called_at || currentInProgress.last_updated_at;
            const durationMs = now - (new Date(calledAt));
            const durationMins = Math.round(durationMs / 60000);

            await updateDoctorConsultationStats(doctor_id, durationMins);

            currentInProgress.token_status = 'COMPLETED';
            currentInProgress.status = 'COMPLETED';
            currentInProgress.checked_out_at = now;
            currentInProgress.last_updated_at = now;
            await currentInProgress.save();
        }

        // Find next patient: Prioritize CHECKED_IN over WAITING, then by check_in_time or token_number
        // Prefer CHECKED_IN over WAITING.
        let nextPatient = await Appointment.findOneAndUpdate(
            { doctor_id, appointment_date: queryDate, token_status: 'CHECKED_IN', is_deleted: false },
            { $set: { token_status: 'IN_PROGRESS', called_at: new Date(), last_updated_at: new Date() } },
            { sort: { token_number: 1 }, new: true }
        );

        if (!nextPatient) {
            // If no CHECKED_IN, take next WAITING
            nextPatient = await Appointment.findOneAndUpdate(
                { doctor_id, appointment_date: queryDate, token_status: 'WAITING', is_deleted: false },
                { $set: { token_status: 'IN_PROGRESS', called_at: new Date(), last_updated_at: new Date() } },
                { sort: { token_number: 1 }, new: true }
            );
        }

        // Update current_token in availability
        if (nextPatient) {
            await DoctorAvailability.findOneAndUpdate(
                { doctor_id, date: queryDate },
                { $set: { current_token: nextPatient.token_number, updated_at: new Date() } }
            );
        }

        const remaining = await Appointment.countDocuments({
            doctor_id,
            appointment_date: queryDate,
            token_status: { $in: ['WAITING', 'CHECKED_IN'] }
        });

        res.json({
            success: true,
            current_token: nextPatient?.token_number || null,
            appointment_id: nextPatient?.appointment_id || null,
            patient_id: nextPatient?.patient_id || null,
            remaining_queue: remaining,
            message: nextPatient ? `Now serving token ${nextPatient.token_number}` : 'No more patients in queue'
        });
    } catch (err) {
        next(err);
    }
};

// ── PATCH /api/appointments/token/:token/status ──────────────────────
exports.updateTokenStatus = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { token } = req.params;
        const { status, doctor_id, date } = req.body || {};

        if (!status) return res.status(400).json({ success: false, message: 'status is required' });
        const validStatuses = ['WAITING', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'NO_SHOW'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: `status must be one of: ${validStatuses.join(', ')}` });
        }

        const queryDate = toMidnight(date || new Date());
        const sessionDoctorId = getDoctorIdFromSession(req);
        const effectiveDoctorId = sessionDoctorId || doctor_id;

        if (!effectiveDoctorId) {
            return res.status(400).json({ success: false, message: 'doctor_id is required' });
        }
        if (!ensureDoctorMatches(req, res, effectiveDoctorId, 'You can only update tokens for your own queue')) return;

        const filter = { token_number: parseInt(token), appointment_date: queryDate, doctor_id: effectiveDoctorId };

        const updateFields = { token_status: status, last_updated_at: new Date() };
        if (status === 'IN_PROGRESS') updateFields.called_at = new Date();
        if (status === 'COMPLETED') {
            updateFields.status = 'COMPLETED';
            updateFields.checked_out_at = new Date();
            updateFields.completed_at = new Date(); // keeping for compatibility if used
        }
        if (status === 'NO_SHOW') {
            updateFields.status = 'NO_SHOW';
            updateFields.no_show_at = new Date();
        }

        const appt = await Appointment.findOneAndUpdate(filter, { $set: updateFields }, { new: true });
        if (!appt) return res.status(404).json({ success: false, message: `Token ${token} not found` });

        // Update stats if completed
        if (status === 'COMPLETED' && appt.called_at) {
            const now = new Date();
            const calledAt = new Date(appt.called_at);
            const durationMins = Math.round((now - calledAt) / 60000);
            await updateDoctorConsultationStats(effectiveDoctorId, durationMins);
        }

        // Sync current_token in availability
        if (status === 'IN_PROGRESS' && appt.doctor_id) {
            await DoctorAvailability.findOneAndUpdate(
                { doctor_id: appt.doctor_id, date: queryDate },
                { $set: { current_token: parseInt(token), updated_at: new Date() } }
            );
        }

        res.json({ success: true, data: appt });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/appointments/token-status/:token ────────────────────────
// Patient self-check — "where am I in the queue?"
exports.getTokenStatus = async (req, res) => {
    try {
        const { token } = req.params;
        const { doctor_id, date } = req.query;
        if (!doctor_id) {
            return res.status(400).json({ success: false, message: 'doctor_id is required' });
        }
        const queryDate = toMidnight(date || new Date());

        const filter = { token_number: parseInt(token), appointment_date: queryDate, doctor_id };

        const appt = await Appointment.findOne(filter).lean();
        if (!appt) return res.status(404).json({ success: false, message: `Token ${token} not found` });

        // Position in queue: relative to CHECKED_IN users (who are waiting)
        const positionFilter = {
            doctor_id: appt.doctor_id,
            appointment_date: queryDate,
            token_number: { $lt: parseInt(token) },
            token_status: 'CHECKED_IN'
        };
        const positionInQueue = await Appointment.countDocuments(positionFilter);

        // Average consultation time: 10 mins (can be made dynamic)
        const estWaitTime = (positionInQueue + (appt.token_status === 'CHECKED_IN' ? 0 : 1)) * 10;

        // Get doctor availability
        const avail = await DoctorAvailability.findOne({ doctor_id: appt.doctor_id, date: queryDate }).lean();

        res.json({
            success: true,
            data: {
                token_number: appt.token_number,
                token_status: appt.token_status,
                appointment_id: appt.appointment_id,
                doctor_name: appt.doctor_name,
                appointment_time: appt.appointment_time,
                position_in_queue: positionInQueue + 1,
                estimated_wait: `${estWaitTime}m`,
                doctor_status: avail?.status || 'PRESENT',
                doctor_eta: avail?.eta_time || null,
                message: appt.token_status === 'IN_PROGRESS'
                    ? 'Your turn! Please proceed to the doctor.'
                    : appt.token_status === 'CHECKED_IN'
                        ? `You are #${positionInQueue + 1} in the active waiting queue`
                        : `Status: ${appt.token_status}. Please check-in upon arrival.`
            }
        });
    } catch (err) {
        next(err);
    }
};

// ── POST /api/appointments/auto-reschedule ───────────────────────────
// Auto-reschedule NO_SHOW or same-day cancelled appointments to next available token
exports.autoReschedule = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { appointment_id, doctor_id, date, target_date, reason } = req.body || {};

        const targetDate = toMidnight(target_date || (() => {
            const d = new Date(); d.setDate(d.getDate() + 1); return d;
        })());

        // Single Appointment Reschedule
        if (appointment_id) {
            const appt = await Appointment.findOne({ appointment_id });
            if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
            if (!ensureDoctorMatches(req, res, appt.doctor_id, 'You can only reschedule your own appointments')) return;

            if (!['NO_SHOW', 'CANCELLED'].includes(appt.status)) {
                return res.status(400).json({ success: false, message: 'Only NO_SHOW or CANCELLED appointments can be auto-rescheduled' });
            }

            const shift = await getDoctorShiftConfig(appt.doctor_id, targetDate);
            const new_appointment_id = await generateAppointmentId();

            const newApptData = {
                appointment_id: new_appointment_id,
                patient_id: appt.patient_id,
                doctor_id: appt.doctor_id,
                doctor_name: appt.doctor_name,
                doctor_speciality: appt.doctor_speciality,
                appointment_date: targetDate,
                appointment_time: shift.start_time,
                visit_type: appt.visit_type,
                reason: reason || `Auto-rescheduled from ${appointment_id} (${appt.status})`,
                status: 'CONFIRMED',
                booking_source: 'dashboard',
                registration_type: appt.registration_type || 'online',
                token_pool: appt.token_pool || 'ONLINE',
                token_number: null,
                token_status: 'PENDING',
                confirmation_sent: false,
                created_at: new Date(),
                last_updated_at: new Date(),
                last_updated_by: req.user?.username || 'SYSTEM'
            };

            await Appointment.create(newApptData);
            await assignTokensForDate(targetDate);

            await audit({
                event_type: 'APPOINTMENT_AUTO_RESCHEDULED',
                entity_type: 'appointment',
                entity_id: new_appointment_id,
                actor: req.user?.username || 'SYSTEM',
                actor_type: 'SYSTEM',
                new_value: { original_id: appointment_id, new_id: new_appointment_id, target_date: targetDate }
            });

            return res.status(201).json({
                success: true,
                message: 'Appointment auto-rescheduled successfully',
                data: {
                    original_appointment_id: appointment_id,
                    new_appointment_id,
                    new_date: targetDate,
                    token_status: 'PENDING'
                }
            });
        }

        // Bulk Auto-Reschedule
        const queryDate = toMidnight(date || new Date());
        const filter = {
            appointment_date: queryDate,
            status: { $in: ['NO_SHOW', 'CANCELLED'] },
            is_deleted: false
        };

        const sessionDoctorId = getDoctorIdFromSession(req);
        if (sessionDoctorId) {
            filter.doctor_id = sessionDoctorId;
        } else if (doctor_id) {
            filter.doctor_id = doctor_id;
        }

        const apptsToReschedule = await Appointment.find(filter);

        if (apptsToReschedule.length === 0) {
            return res.status(200).json({ success: true, message: 'No missed or cancelled appointments found to reschedule.' });
        }

        let rescheduledCount = 0;
        for (const appt of apptsToReschedule) {
            const shift = await getDoctorShiftConfig(appt.doctor_id, targetDate);
            const new_appointment_id = await generateAppointmentId();

            const newApptData = {
                appointment_id: new_appointment_id,
                patient_id: appt.patient_id,
                doctor_id: appt.doctor_id,
                doctor_name: appt.doctor_name,
                doctor_speciality: appt.doctor_speciality,
                appointment_date: targetDate,
                appointment_time: shift.start_time,
                visit_type: appt.visit_type,
                reason: reason || `Auto-rescheduled from ${appt.appointment_id} (${appt.status})`,
                status: 'CONFIRMED',
                booking_source: 'dashboard',
                registration_type: appt.registration_type || 'online',
                token_pool: appt.token_pool || 'ONLINE',
                token_number: null,
                token_status: 'PENDING',
                confirmation_sent: false,
                created_at: new Date(),
                last_updated_at: new Date(),
                last_updated_by: req.user?.username || 'SYSTEM'
            };

            await Appointment.create(newApptData);

            await audit({
                event_type: 'APPOINTMENT_AUTO_RESCHEDULED',
                entity_type: 'appointment',
                entity_id: new_appointment_id,
                actor: req.user?.username || 'SYSTEM',
                actor_type: 'SYSTEM',
                new_value: { original_id: appt.appointment_id, new_id: new_appointment_id, target_date: targetDate }
            });

            rescheduledCount++;
        }

        await assignTokensForDate(targetDate);

        res.status(201).json({
            success: true,
            message: `Successfully auto-rescheduled ${rescheduledCount} missed appointments.`,
            rescheduled_count: rescheduledCount
        });
    } catch (err) {
        next(err);
    }
};

// ── DELETE /api/appointments/queue/:doctor_id ───────────────────────
exports.clearQueue = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        if (!ensureDoctorSessionHasProfile(req, res)) return;
        if (!ensureDoctorMatches(req, res, doctor_id, 'You can only clear your own queue')) return;
        const { date } = req.query;
        const queryDate = toMidnight(date || new Date());
        const actor = req.user ? req.user.username : 'ADMIN';

        const result = await Appointment.updateMany(
            {
                doctor_id,
                appointment_date: queryDate,
                status: { $in: ['BOOKED', 'CONFIRMED'] },
                is_deleted: false
            },
            {
                $set: {
                    status: 'CANCELLED',
                    token_status: 'SKIPPED',
                    cancellation_reason: 'Queue cleared by admin',
                    last_updated_at: new Date(),
                    last_updated_by: actor
                }
            }
        );

        await DoctorAvailability.findOneAndUpdate(
            { doctor_id, date: queryDate },
            { $set: { current_token: 0, updated_at: new Date() } }
        );

        await audit({
            event_type: 'QUEUE_CLEARED',
            entity_type: 'doctor_availability',
            entity_id: doctor_id,
            actor,
            actor_type: req.user ? req.user.role : 'ADMIN',
            meta: { date: queryDate, cancelled_count: result.modifiedCount }
        });

        res.json({ success: true, message: `Queue cleared for doctor ${doctor_id}. ${result.modifiedCount} appointments cancelled.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── POS /api/appointments/notify-delay ──────────────────────────────
exports.notifyDelay = async (req, res) => {
    try {
        const { doctor_id, date, delay_minutes } = req.body || {};
        const queryDate = toMidnight(date || new Date());
        const minutes = parseInt(delay_minutes) || 30;

        if (!doctor_id) return res.status(400).json({ success: false, message: 'doctor_id is required' });

        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        // Find all WAITING or CHECKED_IN tokens for this doctor today
        const appointments = await Appointment.find({
            doctor_id,
            appointment_date: queryDate,
            token_status: { $in: ['WAITING', 'CHECKED_IN'] },
            is_deleted: false
        }).lean();

        if (appointments.length === 0) {
            return res.status(200).json({ success: true, message: 'No waiting patients to notify' });
        }

        const { queueMessage, newBatchId } = require('../../services/messageQueueService');
        const batchId = newBatchId();
        const axios = require('axios');

        let count = 0;
        for (const appt of appointments) {
            const patient = await Patient.findOne({ patient_id: appt.patient_id }).lean();
            if (!patient) continue;

            const wa_id = appt.wa_id || patient.wa_id || patient.parent_mobile;
            if (!wa_id) continue;

            // Calculate new time
            let newTimeStr = appt.appointment_time;
            try {
                if (appt.appointment_time && appt.appointment_time.includes(':')) {
                    const [h, m] = appt.appointment_time.split(':');
                    const d = new Date();
                    d.setHours(parseInt(h), parseInt(m) + minutes, 0, 0);
                    newTimeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                }
            } catch (e) {
                console.error('[notifyDelay] time calculation error:', e.message);
            }

            await queueMessage(wa_id, 'DOCTOR_RUNNING_LATE', {
                parent_name: patient.father_name || patient.mother_name || 'Parent',
                doctor_name: doctor.name,
                minutes: minutes,
                date: queryDate.toLocaleDateString(),
                original_time: appt.appointment_time,
                new_time: newTimeStr,
                token: appt.token_number,
                clinic_name: process.env.CLINIC_NAME || 'Dr. Indu Child Care Clinic'
            }, { batchId, relatedEntity: { appointment_id: appt.appointment_id } });

            // Trigger n8n webhook for Doctor late delay
            axios.post('https://n8n.brahmaastra.ai/webhook/Doctor-update', {
                mobile: wa_id, // Combine wa_id/mobile as just "mobile"
                patient_name: patient.child_name || 'Patient',
                parent_name: patient.father_name || patient.mother_name || 'Parent',
                doctor_name: doctor.name,
                delay_minutes: minutes,
                original_time: appt.appointment_time,
                new_time: newTimeStr,
                token_number: appt.token_number,
                appointment_date: queryDate.toISOString().split('T')[0]
            }).catch(err => console.error('[notifyDelay n8n] webhook failed:', err.message));

            count++;
        }

        await audit({
            event_type: 'DOCTOR_DELAY_NOTIFIED',
            entity_type: 'doctor_availability',
            entity_id: doctor_id,
            actor: req.user?.username || 'ADMIN',
            actor_type: req.user?.role || 'ADMIN',
            meta: { date: queryDate, delay_minutes: minutes, notified_count: count, batch_id: batchId }
        });

        res.json({ success: true, message: `Delay notification queued for ${count} waiting patients.` });
    } catch (err) {
        next(err);
    }
};
// ── GET /api/appointments/wait-time/:doctor_id ──────────────────────
exports.getWaitTime = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        const { date } = req.query;
        const queryDate = toMidnight(date || new Date());

        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const avgConsultationTime = doctor.avg_consultation_time || 10;

        const [waitingCount, inProgress] = await Promise.all([
            Appointment.countDocuments({
                doctor_id,
                appointment_date: queryDate,
                token_status: { $in: ['WAITING', 'CHECKED_IN'] },
                is_deleted: false
            }),
            Appointment.findOne({
                doctor_id,
                appointment_date: queryDate,
                token_status: 'IN_PROGRESS',
                is_deleted: false
            }).select('called_at')
        ]);

        let currentPatientRemaining = 0;
        if (inProgress && inProgress.called_at) {
            const now = new Date();
            const elapsed = Math.round((now - new Date(inProgress.called_at)) / 60000);
            currentPatientRemaining = Math.max(0, avgConsultationTime - elapsed);
        }

        const totalEstimatedWaitMinutes = (waitingCount * avgConsultationTime) + currentPatientRemaining;

        res.json({
            success: true,
            data: {
                doctor_id,
                doctor_name: doctor.name,
                avg_consultation_time: avgConsultationTime,
                patients_waiting: waitingCount,
                in_progress: !!inProgress,
                current_patient_remaining: currentPatientRemaining,
                estimated_wait_minutes: totalEstimatedWaitMinutes,
                estimated_wait_text: totalEstimatedWaitMinutes > 0 ? `${totalEstimatedWaitMinutes} min` : 'No wait'
            }
        });
    } catch (err) {
        next(err);
    }
};
