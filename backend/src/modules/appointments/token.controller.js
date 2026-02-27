const Appointment = require('../../models/Appointment');
const Patient = require('../../models/Patient');
const Slot = require('../../models/Slot');
const DoctorAvailability = require('../../models/DoctorAvailability');
const Doctor = require('../../models/Doctor');
const audit = require('../../utils/audit');
const { toMidnight, normalizeWaId, normalizePhone } = require('../../utils/helpers');
const { hashField } = require('../../utils/encryption');

// Helper: generate next token number for a doctor on a given date
const getNextToken = async (doctor_id, date) => {
    const last = await Appointment.findOne({
        doctor_id,
        appointment_date: date,
        token_number: { $ne: null }
    }).sort({ token_number: -1 }).select('token_number');
    return (last?.token_number || 0) + 1;
};

// ── POST /api/appointments/book-with-token ──────────────────────────
// Book appointment AND assign a queue token in one step
exports.bookWithToken = async (req, res) => {
    try {
        const {
            patient_id, wa_id, mobile,
            doctor_id, doctor_name,
            appointment_date, slot_id,
            visit_type, reason,
            booking_source = 'dashboard'
        } = req.body || {};

        if (!appointment_date || !slot_id || (!doctor_id && !doctor_name)) {
            return res.status(400).json({ success: false, message: 'appointment_date, slot_id, and doctor_id/doctor_name are required' });
        }

        // Resolve patient
        let patient;
        if (patient_id) {
            patient = await Patient.findOne({ patient_id, is_deleted: false });
        } else if (wa_id || mobile) {
            const raw = wa_id || mobile;
            const wa_hash = hashField(normalizePhone(raw));
            patient = await Patient.findOne({ wa_hash, is_deleted: false });
        }
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        // Resolve doctor
        let doctor;
        if (doctor_id) doctor = await Doctor.findOne({ doctor_id });
        else doctor = await Doctor.findOne({ name: new RegExp(`^${doctor_name}$`, 'i') });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const queryDate = toMidnight(appointment_date);
        const slot = await Slot.findOne({ slot_id });
        if (!slot) return res.status(404).json({ success: false, message: 'Slot not found' });

        // Check duplicate
        const existing = await Appointment.findOne({
            patient_id: patient.patient_id,
            appointment_date: queryDate,
            status: { $in: ['BOOKED', 'CONFIRMED'] }
        });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: `Patient already has appointment ${existing.appointment_id} today`
            });
        }

        // Generate IDs
        const year = new Date().getFullYear();
        const prefix = `APT-${year}-`;
        const lastAppt = await Appointment.findOne({ appointment_id: { $regex: `^${prefix}` } }).sort({ appointment_id: -1 });
        const seq = lastAppt ? parseInt(lastAppt.appointment_id.replace(prefix, ''), 10) + 1 : 1;
        const appointment_id = `${prefix}${seq.toString().padStart(5, '0')}`;

        const token_number = await getNextToken(doctor.doctor_id, queryDate);

        const appointment = await Appointment.create({
            appointment_id,
            patient_id: patient.patient_id,
            doctor_id: doctor.doctor_id,
            doctor_name: doctor.name,
            doctor_speciality: doctor.speciality,
            appointment_date: queryDate,
            slot_id,
            appointment_time: slot.start_time,
            visit_type: visit_type || 'CONSULTATION',
            reason: reason || null,
            status: 'CONFIRMED',
            booking_source,
            token_number,
            token_status: 'WAITING',
            confirmation_sent: true,
            created_at: new Date(),
            last_updated_at: new Date(),
            last_updated_by: req.user?.username || booking_source
        });

        await audit({
            event_type: 'APPOINTMENT_BOOKED_WITH_TOKEN',
            entity_type: 'appointment',
            entity_id: appointment_id,
            actor: req.user?.username || booking_source,
            actor_type: 'ADMIN',
            new_value: { patient_id: patient.patient_id, token_number, doctor_id: doctor.doctor_id }
        });

        res.status(201).json({
            success: true,
            data: {
                appointment_id,
                token_number,
                token_status: 'WAITING',
                patient_id: patient.patient_id,
                child_name: patient.child_name,
                doctor_name: doctor.name,
                appointment_date: queryDate,
                appointment_time: slot.start_time
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── POST /api/appointments/token/:token/check-in ────────────────────
exports.checkIn = async (req, res) => {
    try {
        const { token } = req.params;
        const { doctor_id, date } = req.body || {};
        const queryDate = toMidnight(date || new Date());

        const filter = { token_number: parseInt(token), appointment_date: queryDate };
        if (doctor_id) filter.doctor_id = doctor_id;

        const appt = await Appointment.findOneAndUpdate(
            filter,
            { $set: { check_in_time: new Date(), token_status: 'WAITING', last_updated_at: new Date() } },
            { new: true }
        );

        if (!appt) return res.status(404).json({ success: false, message: `Token ${token} not found for today` });

        res.json({ success: true, message: `Token ${token} checked in`, data: appt });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── GET /api/appointments/daily-tokens ──────────────────────────────
exports.getDailyTokens = async (req, res) => {
    try {
        const { doctor_id, doctor_name, date } = req.query;
        const queryDate = toMidnight(date || new Date());

        const filter = { appointment_date: queryDate, token_number: { $ne: null }, is_deleted: false };
        if (doctor_id) filter.doctor_id = doctor_id;
        if (doctor_name) filter.doctor_name = new RegExp(doctor_name, 'i');

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

        const enriched = appointments.map(a => ({
            ...a,
            child_name: patientMap[a.patient_id] || null
        }));

        // Group by doctor
        const byDoctor = {};
        enriched.forEach(a => {
            const key = a.doctor_id || a.doctor_name;
            if (!byDoctor[key]) byDoctor[key] = { doctor_name: a.doctor_name, doctor_id: a.doctor_id, tokens: [] };
            byDoctor[key].tokens.push(a);
        });

        res.json({
            success: true,
            date: queryDate,
            total: appointments.length,
            by_doctor: Object.values(byDoctor),
            data: enriched
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── GET /api/appointments/clinic-display ────────────────────────────
// Public-facing clinic display board
exports.getClinicDisplay = async (req, res) => {
    try {
        const { date } = req.query;
        const queryDate = toMidnight(date || new Date());

        // Get all active doctors' availability
        const availabilities = await DoctorAvailability.find({ date: queryDate }).lean();
        const availMap = {};
        availabilities.forEach(a => { availMap[a.doctor_id] = a; });

        // Get in-progress and recent completed tokens
        const activeTokens = await Appointment.find({
            appointment_date: queryDate,
            token_number: { $ne: null },
            token_status: { $in: ['IN_PROGRESS', 'WAITING'] },
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
            const avail = availMap[dr.doctor_id] || { status: 'PRESENT', current_token: 0, eta_time: null };
            const drTokens = activeTokens.filter(t => t.doctor_id === dr.doctor_id);
            const nowServing = drTokens.find(t => t.token_status === 'IN_PROGRESS');
            const waiting = drTokens.filter(t => t.token_status === 'WAITING');

            return {
                doctor_id: dr.doctor_id,
                doctor_name: dr.name,
                speciality: dr.speciality,
                status: avail.status,
                eta_time: avail.eta_time,
                now_serving_token: nowServing?.token_number || null,
                now_serving_patient: nowServing ? (pMap[nowServing.patient_id] || 'Patient') : null,
                queue_length: waiting.length,
                next_token: waiting[0]?.token_number || null
            };
        });

        res.json({
            success: true,
            date: queryDate,
            generated_at: new Date(),
            display
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── GET /api/appointments/next-token/:doctor_id ──────────────────────
// Advance the queue — mark current IN_PROGRESS as COMPLETED, call next WAITING
exports.getNextToken = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        const queryDate = toMidnight(new Date());

        // Complete current in-progress
        await Appointment.updateMany(
            { doctor_id, appointment_date: queryDate, token_status: 'IN_PROGRESS' },
            { $set: { token_status: 'COMPLETED', last_updated_at: new Date() } }
        );

        // Find next WAITING token (checked-in first, then by token number)
        const next = await Appointment.findOneAndUpdate(
            {
                doctor_id,
                appointment_date: queryDate,
                token_status: 'WAITING',
                is_deleted: false
            },
            { $set: { token_status: 'IN_PROGRESS', called_at: new Date(), last_updated_at: new Date() } },
            { sort: { check_in_time: 1, token_number: 1 }, new: true }
        );

        // Update current_token in availability
        if (next) {
            await DoctorAvailability.findOneAndUpdate(
                { doctor_id, date: queryDate },
                { $set: { current_token: next.token_number, updated_at: new Date() } }
            );
        }

        const remaining = await Appointment.countDocuments({
            doctor_id,
            appointment_date: queryDate,
            token_status: 'WAITING'
        });

        res.json({
            success: true,
            current_token: next?.token_number || null,
            appointment_id: next?.appointment_id || null,
            patient_id: next?.patient_id || null,
            remaining_queue: remaining,
            message: next ? `Now serving token ${next.token_number}` : 'No more patients in queue'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── PATCH /api/appointments/token/:token/status ──────────────────────
exports.updateTokenStatus = async (req, res) => {
    try {
        const { token } = req.params;
        const { status, doctor_id, date } = req.body || {};

        if (!status) return res.status(400).json({ success: false, message: 'status is required' });
        if (!['WAITING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'].includes(status)) {
            return res.status(400).json({ success: false, message: 'status must be WAITING, IN_PROGRESS, COMPLETED or SKIPPED' });
        }

        const queryDate = toMidnight(date || new Date());
        const filter = { token_number: parseInt(token), appointment_date: queryDate };
        if (doctor_id) filter.doctor_id = doctor_id;

        const updateFields = { token_status: status, last_updated_at: new Date() };
        if (status === 'IN_PROGRESS') updateFields.called_at = new Date();
        if (status === 'COMPLETED') updateFields.status = 'COMPLETED';

        const appt = await Appointment.findOneAndUpdate(filter, { $set: updateFields }, { new: true });
        if (!appt) return res.status(404).json({ success: false, message: `Token ${token} not found` });

        // Sync current_token in availability
        if (status === 'IN_PROGRESS' && appt.doctor_id) {
            await DoctorAvailability.findOneAndUpdate(
                { doctor_id: appt.doctor_id, date: queryDate },
                { $set: { current_token: parseInt(token), updated_at: new Date() } }
            );
        }

        res.json({ success: true, data: appt });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── GET /api/appointments/token-status/:token ────────────────────────
// Patient self-check — "where am I in the queue?"
exports.getTokenStatus = async (req, res) => {
    try {
        const { token } = req.params;
        const { doctor_id, date } = req.query;
        const queryDate = toMidnight(date || new Date());

        const filter = { token_number: parseInt(token), appointment_date: queryDate };
        if (doctor_id) filter.doctor_id = doctor_id;

        const appt = await Appointment.findOne(filter).lean();
        if (!appt) return res.status(404).json({ success: false, message: `Token ${token} not found` });

        // Count how many tokens are ahead in the queue
        const aheadFilter = {
            doctor_id: appt.doctor_id,
            appointment_date: queryDate,
            token_number: { $lt: parseInt(token) },
            token_status: 'WAITING'
        };
        const patientsAhead = await Appointment.countDocuments(aheadFilter);

        // Get doctor availability (ETA if late)
        const avail = await DoctorAvailability.findOne({ doctor_id: appt.doctor_id, date: queryDate }).lean();

        res.json({
            success: true,
            data: {
                token_number: appt.token_number,
                token_status: appt.token_status,
                appointment_id: appt.appointment_id,
                doctor_name: appt.doctor_name,
                appointment_time: appt.appointment_time,
                patients_ahead: patientsAhead,
                doctor_status: avail?.status || 'PRESENT',
                doctor_eta: avail?.eta_time || null,
                message: appt.token_status === 'IN_PROGRESS'
                    ? 'Your turn! Please proceed to the doctor.'
                    : appt.token_status === 'WAITING'
                        ? `You are #${patientsAhead + 1} in queue`
                        : `Status: ${appt.token_status}`
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── POST /api/appointments/auto-reschedule ───────────────────────────
// Auto-reschedule NO_SHOW or same-day cancelled appointments to next available slot
exports.autoReschedule = async (req, res) => {
    try {
        const { appointment_id, target_date, reason } = req.body || {};

        if (!appointment_id) return res.status(400).json({ success: false, message: 'appointment_id is required' });

        const appt = await Appointment.findOne({ appointment_id });
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });

        if (!['NO_SHOW', 'CANCELLED'].includes(appt.status)) {
            return res.status(400).json({ success: false, message: 'Only NO_SHOW or CANCELLED appointments can be auto-rescheduled' });
        }

        // Find next available slot for same doctor
        const SlotAvailability = require('../../models/SlotAvailability');
        const targetDate = toMidnight(target_date || (() => {
            const d = new Date(); d.setDate(d.getDate() + 1); return d;
        })());

        const freeSlot = await SlotAvailability.findOne({
            doctor_name: appt.doctor_name,
            slot_date: targetDate,
            is_booked: false,
            blocked_by_admin: false
        });

        if (!freeSlot) {
            return res.status(409).json({
                success: false,
                message: `No available slots for ${appt.doctor_name} on ${targetDate.toISOString().split('T')[0]}`
            });
        }

        // Generate new appointment ID
        const year = new Date().getFullYear();
        const prefix = `APT-${year}-`;
        const lastAppt = await Appointment.findOne({ appointment_id: { $regex: `^${prefix}` } }).sort({ appointment_id: -1 });
        const seq = lastAppt ? parseInt(lastAppt.appointment_id.replace(prefix, ''), 10) + 1 : 1;
        const new_appointment_id = `${prefix}${seq.toString().padStart(5, '0')}`;

        const token_number = await getNextToken(appt.doctor_id, targetDate);

        const newAppt = await Appointment.create({
            appointment_id: new_appointment_id,
            patient_id: appt.patient_id,
            doctor_id: appt.doctor_id,
            doctor_name: appt.doctor_name,
            doctor_speciality: appt.doctor_speciality,
            appointment_date: targetDate,
            slot_id: freeSlot.slot_id,
            appointment_time: freeSlot.custom_start_time || appt.appointment_time,
            visit_type: appt.visit_type,
            reason: reason || `Auto-rescheduled from ${appointment_id} (${appt.status})`,
            status: 'CONFIRMED',
            booking_source: 'dashboard',
            token_number,
            token_status: 'WAITING',
            confirmation_sent: false,
            created_at: new Date(),
            last_updated_at: new Date(),
            last_updated_by: req.user?.username || 'SYSTEM'
        });

        // Mark the slot booked
        await SlotAvailability.updateOne(
            { slot_id: freeSlot.slot_id, slot_date: targetDate, doctor_name: appt.doctor_name },
            { $set: { is_booked: true, appointment_id: new_appointment_id } }
        );

        await audit({
            event_type: 'APPOINTMENT_AUTO_RESCHEDULED',
            entity_type: 'appointment',
            entity_id: new_appointment_id,
            actor: req.user?.username || 'SYSTEM',
            actor_type: 'SYSTEM',
            new_value: { original_id: appointment_id, new_id: new_appointment_id, target_date: targetDate }
        });

        res.status(201).json({
            success: true,
            message: 'Appointment auto-rescheduled successfully',
            data: {
                original_appointment_id: appointment_id,
                new_appointment_id,
                new_date: targetDate,
                token_number,
                slot_id: freeSlot.slot_id
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
