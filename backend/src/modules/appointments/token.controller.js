const Appointment = require('../../models/Appointment');
const Patient = require('../../models/Patient');
const Slot = require('../../models/Slot');
const DoctorAvailability = require('../../models/DoctorAvailability');
const Doctor = require('../../models/Doctor');
const audit = require('../../utils/audit');
const { toMidnight, normalizeWaId, normalizePhone, canonicalizeDoctorName, getNextToken: getNextTokenNumber } = require('../../utils/helpers');
const { hashField } = require('../../utils/encryption');
const { generateAppointmentId } = require('./appointment.controller');

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

// Helper: generate next token number for a doctor on a given date (exported)
const getNextToken = (doctor_id, date) => getNextTokenNumber(Appointment, doctor_id, date);
exports.getNextToken = getNextToken;

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
        const doctor = await resolveDoctor(doctor_id, doctor_name);
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const queryDate = toMidnight(appointment_date);
        const slot = await Slot.findOne({ slot_id });
        if (!slot) return res.status(404).json({ success: false, message: 'Slot not found' });

        // Check if slot is taken
        const SlotAvailability = require('../../models/SlotAvailability');
        const slotTaken = await SlotAvailability.findOne({
            slot_id,
            slot_date: queryDate,
            doctor_name: doctor.name,
            $or: [{ is_booked: true }, { blocked_by_admin: true }]
        });
        if (slotTaken) {
            return res.status(409).json({ success: false, message: 'This time slot is already booked or blocked for this doctor.' });
        }

        // Check duplicate appointment for patient today
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
        const appointment_id = await generateAppointmentId();

        const token_number = await getNextTokenNumber(Appointment, doctor.doctor_id, queryDate);

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

        await appointment.save();

        // 5. Mark slot as booked (Atomic update to prevent race conditions)
        await SlotAvailability.findOneAndUpdate(
            {
                slot_id,
                slot_date: queryDate,
                doctor_name: doctor.name,
                is_booked: false,
                blocked_by_admin: false
            },
            {
                $set: {
                    is_booked: true,
                    appointment_id,
                    doctor_name: doctor.name,
                    doctor_id: doctor.doctor_id,
                    last_updated_at: new Date()
                }
            },
            { upsert: true, new: true }
        );

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

        if (!doctor_id) {
            return res.status(400).json({ success: false, message: 'doctor_id is required' });
        }

        const filter = { token_number: parseInt(token), appointment_date: queryDate, doctor_id };

        const appt = await Appointment.findOneAndUpdate(
            filter,
            { $set: { check_in_time: new Date(), token_status: 'CHECKED_IN', last_updated_at: new Date() } },
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

        if (doctor_id || doctor_name) {
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

        const enriched = appointments.map(a => ({
            patient_id: a.patient_id,
            child_name: patientMap[a.patient_id] || null,
            token_number: a.token_number,
            status: a.token_status,
            slot_id: a.slot_id,
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
            const avail = availMap[dr.doctor_id] || { status: 'PRESENT', current_token: 0, eta_time: 'No Delay' };
            const drTokens = activeTokens.filter(t => t.doctor_id === dr.doctor_id);
            const nowServing = drTokens.find(t => t.token_status === 'IN_PROGRESS');
            const waiting = drTokens.filter(t => t.token_status === 'CHECKED_IN');

            return {
                doctor_id: dr.doctor_id,
                doctor_name: dr.name,
                speciality: dr.speciality,
                now_serving_token: nowServing?.token_number || null,
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
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── GET /api/appointments/next-token/:doctor_id ──────────────────────
// Advance the queue — mark current IN_PROGRESS as COMPLETED, call next CHECKED_IN
exports.getNextToken = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        const queryDate = toMidnight(new Date());

        // Complete current in-progress
        await Appointment.updateMany(
            { doctor_id, appointment_date: queryDate, token_status: 'IN_PROGRESS' },
            { $set: { token_status: 'COMPLETED', status: 'COMPLETED', last_updated_at: new Date() } }
        );

        // Find next patient: Prioritize CHECKED_IN over WAITING, then by check_in_time or token_number
        const next = await Appointment.findOneAndUpdate(
            {
                doctor_id,
                appointment_date: queryDate,
                token_status: { $in: ['CHECKED_IN', 'WAITING'] },
                is_deleted: false
            },
            { $set: { token_status: 'IN_PROGRESS', called_at: new Date(), last_updated_at: new Date() } },
            {
                sort: {
                    // High priority: CHECKED_IN patients
                    token_status: 1, // CHECKED_IN comes before WAITING in default sort if we are lucky, but let's be explicit
                    // Actually token_status sort is not reliable for enum. 
                    // We'll use a two-step approach or a complex sort if possible.
                    // But for simple logic: CHECKED_IN > WAITING.
                },
                new: true
            }
        ).lean();

        // Since $in doesn't guarantee order, let's refine the findOneAndUpdate
        // Better: Try to find CHECKED_IN first.
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
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── PATCH /api/appointments/token/:token/status ──────────────────────
exports.updateTokenStatus = async (req, res) => {
    try {
        const { token } = req.params;
        const { status, doctor_id, date } = req.body || {};

        if (!status) return res.status(400).json({ success: false, message: 'status is required' });
        const validStatuses = ['WAITING', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'NO_SHOW'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: `status must be one of: ${validStatuses.join(', ')}` });
        }

        const queryDate = toMidnight(date || new Date());

        if (!doctor_id) {
            return res.status(400).json({ success: false, message: 'doctor_id is required' });
        }

        const filter = { token_number: parseInt(token), appointment_date: queryDate, doctor_id };

        const updateFields = { token_status: status, last_updated_at: new Date() };
        if (status === 'IN_PROGRESS') updateFields.called_at = new Date();
        if (status === 'COMPLETED') updateFields.status = 'COMPLETED';
        if (status === 'NO_SHOW') updateFields.status = 'NO_SHOW';

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
        const new_appointment_id = await generateAppointmentId();

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
