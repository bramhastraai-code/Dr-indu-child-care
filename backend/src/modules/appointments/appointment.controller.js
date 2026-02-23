const Appointment = require('../../models/Appointment');
const SlotAvailability = require('../../models/SlotAvailability');
const Patient = require('../../models/Patient');
const Slot = require('../../models/Slot');
const MRD = require('../../models/MRD');
const audit = require('../../utils/audit');
const { toMidnight, extractMobile, normalizeWaId, normalizePhone } = require('../../utils/helpers');
const { hashField } = require('../../utils/encryption');

// ── Helpers ──────────────────────────────────────────────────────────────────

const generateAppointmentId = async () => {
    const year = new Date().getFullYear();
    const prefix = `APT-${year}-`;
    const last = await Appointment.findOne({ appointment_id: { $regex: `^${prefix}` } })
        .sort({ appointment_id: -1 });
    const seq = last ? parseInt(last.appointment_id.replace(prefix, ''), 10) + 1 : 1;
    return `${prefix}${seq.toString().padStart(5, '0')}`;
};

const enrichAppointment = async (a) => {
    const [patient, slot, mrdEntry] = await Promise.all([
        Patient.findOne({ patient_id: a.patient_id }),
        Slot.findOne({ slot_id: a.slot_id }),
        MRD.findOne({ 'entries.appointment_id': a.appointment_id })
    ]);
    return {
        ...a.toObject(),
        child_name: patient?.child_name || null,
        parent_name: patient?.parent_name || null,
        // Keep `parent_mobile` for backward compatibility in API responses.
        parent_mobile: patient?.mobile || null,
        mobile: patient?.mobile || null,
        slot_label: slot ? (slot.slot_label || slot.display_label) : null,
        start_time: slot?.start_time || null,
        end_time: slot?.end_time || null,
        session: slot?.session || null,
        has_mrd_entry: !!mrdEntry
    };
};

// ── 1. GET /api/appointments ─────────────────────────────────────────────────
// List appointments with filters: date, patient_id, status, source, page, limit
exports.getAppointments = async (req, res) => {
    try {
        const { date, patient_id, status, source, page = 1, limit = 50 } = req.query;
        const filter = {};

        if (date) {
            const d = toMidnight(date);
            filter.appointment_date = d;
        }
        if (patient_id) filter.patient_id = patient_id;
        if (status) filter.status = status.toUpperCase();
        if (source) filter.booking_source = source.toLowerCase();

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [appointments, total] = await Promise.all([
            Appointment.find(filter).sort({ appointment_date: 1, slot_id: 1 }).skip(skip).limit(parseInt(limit)),
            Appointment.countDocuments(filter)
        ]);

        const enriched = await Promise.all(appointments.map(enrichAppointment));
        res.json({
            success: true,
            data: enriched,
            pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (err) {
        console.error('[getAppointments]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── 2. POST /api/appointments ────────────────────────────────────────────────
// Book a new appointment. All channels use this endpoint.
// booking_source: 'dashboard' | 'whatsapp' | 'form' | 'api'
// Patient identified by patient_id (dashboard/form/api) OR mobile/wa_id (whatsapp)
exports.createAppointment = async (req, res) => {
    try {
        const {
            patient_id,
            mobile, wa_id,         // for whatsapp source
            doctor_type,
            visit_type,
            appointment_mode,
            appointment_date,
            slot_id,
            reason,
            booking_source = 'dashboard'
        } = req.body;

        // Validate booking_source
        const validSources = ['dashboard', 'whatsapp', 'form', 'api'];
        if (!validSources.includes(booking_source)) {
            return res.status(400).json({ success: false, message: `booking_source must be one of: ${validSources.join(', ')}` });
        }

        if (!appointment_date || !slot_id || !doctor_type) {
            return res.status(400).json({ success: false, error_code: 'VALIDATION_ERROR', message: 'appointment_date, slot_id, and doctor_type are required.' });
        }

        // Resolve patient
        let patient;
        if (patient_id) {
            patient = await Patient.findOne({ patient_id, is_deleted: false });
        } else if (mobile || wa_id) {
            const lookupValue = mobile || wa_id;
            const normalizedWaId = normalizeWaId(lookupValue);
            const normalizedMobile = normalizePhone(lookupValue);
            const mobileHash = hashField(normalizedMobile);
            patient = await Patient.findOne({
                $or: [
                    { mobile_hash: mobileHash },
                    { wa_id: lookupValue },
                    { wa_id: normalizedWaId },
                    { wa_id: normalizedMobile }
                ],
                is_deleted: false
            });
        }

        if (!patient) {
            return res.status(404).json({ success: false, error_code: 'PATIENT_NOT_FOUND', message: 'Patient not found or not registered.' });
        }

        const queryDate = toMidnight(appointment_date);
        if (isNaN(queryDate.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid appointment_date. Use YYYY-MM-DD.' });
        }

        // 1. Slot conflict — physical slots are shared across all doctor types
        const slotTaken = await SlotAvailability.findOne({
            slot_id,
            slot_date: queryDate,
            $or: [{ is_booked: true }, { blocked_by_admin: true }]
        });
        if (slotTaken) {
            return res.status(409).json({ success: false, message: 'This time slot is already booked or blocked. Please choose another.' });
        }

        // 2. One appointment per patient per day
        const existing = await Appointment.findOne({
            patient_id: patient.patient_id,
            appointment_date: queryDate,
            status: { $in: ['BOOKED', 'CONFIRMED'] }
        });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: `Patient already has appointment ${existing.appointment_id} on this date. Cancel it first to rebook.`
            });
        }

        // 3. Get slot for time label
        const slot = await Slot.findOne({ slot_id });

        // 4. Create appointment
        const appointment_id = await generateAppointmentId();
        await Appointment.create({
            appointment_id,
            patient_id: patient.patient_id,
            visit_type: visit_type || 'CONSULTATION',
            appointment_mode: appointment_mode || 'OFFLINE',
            doctor_type,
            appointment_date: queryDate,
            slot_id,
            appointment_time: slot?.start_time || null,
            reason: reason || null,
            status: 'CONFIRMED',
            booking_source,
            confirmation_sent: true,
            created_at: new Date(),
            last_updated_at: new Date(),
            last_updated_by: req.user?.username || booking_source.toUpperCase()
        });

        // 5. Mark slot as booked
        const avail = await SlotAvailability.findOne({ slot_id, slot_date: queryDate });
        if (avail) {
            await SlotAvailability.updateOne({ _id: avail._id }, { $set: { is_booked: true, appointment_id, doctor_type } });
        } else {
            await SlotAvailability.create({ slot_id, slot_date: queryDate, doctor_type, is_booked: true, blocked_by_admin: false, appointment_id });
        }

        // 6. Audit
        await audit({
            event_type: 'APPOINTMENT_BOOKED',
            entity_type: 'appointment',
            entity_id: appointment_id,
            actor: req.user?.username || booking_source.toUpperCase(),
            actor_type: booking_source === 'dashboard' ? 'ADMIN' : 'SYSTEM',
            new_value: { patient_id: patient.patient_id, date: appointment_date, slot_id, booking_source }
        });

        res.status(201).json({
            success: true,
            data: {
                appointment_id,
                patient_id: patient.patient_id,
                child_name: patient.child_name,
                status: 'CONFIRMED',
                booking_source,
                appointment_date: queryDate,
                appointment_time: slot?.start_time || null,
                doctor_type,
                visit_type: visit_type || 'CONSULTATION',
                appointment_mode: appointment_mode || 'OFFLINE',
                slot: slot ? { slot_id, label: slot.slot_label || slot.display_label } : { slot_id }
            }
        });

    } catch (err) {
        console.error('[createAppointment]', err.stack);
        if (err.code === 11000) return res.status(409).json({ success: false, message: 'Concurrent booking detected. Please choose another slot.' });
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── 3. GET /api/appointments/stats ───────────────────────────────────────────
// Dashboard stats: totals by status and booking_source for today or a given date
exports.getAppointmentStats = async (req, res) => {
    try {
        const { date } = req.query;
        const queryDate = date ? toMidnight(date) : toMidnight(new Date());

        const [statusCounts, sourceCounts, total] = await Promise.all([
            Appointment.aggregate([
                { $match: { appointment_date: queryDate } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            Appointment.aggregate([
                { $match: { appointment_date: queryDate } },
                { $group: { _id: '$booking_source', count: { $sum: 1 } } }
            ]),
            Appointment.countDocuments({ appointment_date: queryDate })
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
        console.error('[getAppointmentStats]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── 4. GET /api/appointments/by-mobile/:mobile ───────────────────────────────
// Lookup upcoming appointments by mobile number (replaces /by-wa/:wa_id)
exports.getAppointmentsByMobile = async (req, res) => {
    try {
        const rawMobile = req.params.mobile;
        const normalizedMobile = normalizePhone(rawMobile);
        const mobileHash = hashField(normalizedMobile);

        const patient = await Patient.findOne({
            $or: [
                { mobile_hash: mobileHash },
                { wa_id: rawMobile },
                { wa_id: normalizedMobile }
            ],
            is_deleted: false
        });
        if (!patient) return res.status(404).json({ success: false, message: `No patient found for mobile ${rawMobile}` });

        const appointments = await Appointment.find({
            patient_id: patient.patient_id,
            status: { $in: ['BOOKED', 'CONFIRMED'] },
            appointment_date: { $gte: toMidnight(new Date()) }
        }).sort({ appointment_date: 1 }).limit(5);

        const enriched = await Promise.all(appointments.map(enrichAppointment));
        res.json({
            success: true,
            patient_id: patient.patient_id,
            child_name: patient.child_name,
            mobile: patient.mobile || normalizedMobile,
            data: enriched
        });
    } catch (err) {
        console.error('[getAppointmentsByMobile]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── 5. GET /api/appointments/:appointment_id ─────────────────────────────────
exports.getAppointmentById = async (req, res) => {
    try {
        const appt = await Appointment.findOne({ appointment_id: req.params.appointment_id });
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
        const enriched = await enrichAppointment(appt);
        res.json({ success: true, data: enriched });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── 6. PATCH /api/appointments/:appointment_id ───────────────────────────────
// Reschedule or update appointment (date, slot, reason, doctor)
exports.updateAppointment = async (req, res) => {
    try {
        const { appointment_id } = req.params;
        const { appointment_date, slot_id, doctor_type, visit_type, appointment_mode, reason } = req.body;

        const appt = await Appointment.findOne({ appointment_id });
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
        if (appt.status === 'CANCELLED') return res.status(409).json({ success: false, message: 'Cannot update a cancelled appointment.' });

        const updates = { last_updated_at: new Date(), last_updated_by: req.user?.username || 'SYSTEM' };

        // Handle slot change (reschedule)
        if (appointment_date || slot_id) {
            const newDate = appointment_date ? toMidnight(appointment_date) : appt.appointment_date;
            const newSlotId = slot_id || appt.slot_id;
            const newDocType = doctor_type || appt.doctor_type;

            // Check if target slot is free
            const slotTaken = await SlotAvailability.findOne({
                slot_id: newSlotId,
                slot_date: newDate,
                $or: [{ is_booked: true }, { blocked_by_admin: true }]
            });
            if (slotTaken && slotTaken.appointment_id !== appointment_id) {
                return res.status(409).json({ success: false, message: 'Target slot is already booked. Choose another.' });
            }

            // Free old slot
            await SlotAvailability.updateOne(
                { slot_id: appt.slot_id, slot_date: appt.appointment_date },
                { $set: { is_booked: false, appointment_id: null } }
            );

            // Book new slot
            const newAvail = await SlotAvailability.findOne({ slot_id: newSlotId, slot_date: newDate });
            if (newAvail) {
                await SlotAvailability.updateOne({ _id: newAvail._id }, { $set: { is_booked: true, appointment_id, doctor_type: newDocType } });
            } else {
                await SlotAvailability.create({ slot_id: newSlotId, slot_date: newDate, doctor_type: newDocType, is_booked: true, blocked_by_admin: false, appointment_id });
            }

            const newSlot = await Slot.findOne({ slot_id: newSlotId });
            updates.appointment_date = newDate;
            updates.slot_id = newSlotId;
            updates.appointment_time = newSlot?.start_time || null;
            updates.doctor_type = newDocType;
        }

        if (visit_type) updates.visit_type = visit_type;
        if (appointment_mode) updates.appointment_mode = appointment_mode;
        if (reason !== undefined) updates.reason = reason;

        const updated = await Appointment.findOneAndUpdate({ appointment_id }, { $set: updates }, { new: true });

        await audit({
            event_type: 'APPOINTMENT_UPDATED', entity_type: 'appointment', entity_id: appointment_id,
            actor: req.user?.username || 'SYSTEM', actor_type: req.user ? req.user.role : 'SYSTEM',
            new_value: updates
        });

        const enriched = await enrichAppointment(updated);
        res.json({ success: true, message: 'Appointment updated.', data: enriched });
    } catch (err) {
        console.error('[updateAppointment]', err.stack);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── 7. PATCH /api/appointments/:appointment_id/cancel ────────────────────────
// Cancel by bot or dashboard — same endpoint, cancelled_by field tracks who
exports.cancelAppointment = async (req, res) => {
    try {
        const { appointment_id } = req.params;
        const { cancellation_reason, cancelled_by = 'dashboard' } = req.body;

        const validCancelledBy = ['whatsapp', 'dashboard', 'system'];
        const canceller = validCancelledBy.includes(cancelled_by) ? cancelled_by : 'dashboard';

        const appt = await Appointment.findOne({ appointment_id });
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
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

        // Free the slot
        await SlotAvailability.updateOne(
            { slot_id: appt.slot_id, slot_date: appt.appointment_date },
            { $set: { is_booked: false, appointment_id: null } }
        );

        await audit({
            event_type: 'APPOINTMENT_CANCELLED', entity_type: 'appointment', entity_id: appointment_id,
            actor: req.user?.username || canceller.toUpperCase(),
            actor_type: canceller === 'dashboard' ? 'ADMIN' : 'SYSTEM',
            new_value: { cancellation_reason, cancelled_by: canceller }
        });

        res.json({ success: true, message: `Appointment ${appointment_id} cancelled.`, cancelled_by: canceller });
    } catch (err) {
        console.error('[cancelAppointment]', err.stack);
        res.status(500).json({ success: false, error: err.message });
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
        const rawWaId = req.params.wa_id;
        const normalized = normalizeWaId(rawWaId);
        const mobile = extractMobile(rawWaId);
        const mobileHash = hashField(normalizePhone(mobile));

        // Find patient by raw wa_id stored on Patient, or by extracted mobile
        const patient = await Patient.findOne({
            $or: [
                { wa_id: normalized },
                { wa_id: rawWaId },
                { wa_id: mobile },
                { mobile_hash: mobileHash }
            ],
            is_deleted: false
        });
        if (!patient) {
            return res.status(404).json({ success: false, message: `No patient found for wa_id ${rawWaId}` });
        }

        const appointments = await Appointment.find({
            patient_id: patient.patient_id,
            status: { $in: ['BOOKED', 'CONFIRMED'] },
            appointment_date: { $gte: toMidnight(new Date()) }
        }).sort({ appointment_date: 1 }).limit(5);

        const enriched = await Promise.all(appointments.map(enrichAppointment));
        res.json({
            success: true,
            patient_id: patient.patient_id,
            child_name: patient.child_name,
            mobile: patient.mobile || mobile,
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
    try {
        const {
            wa_id: rawWaId,
            doctor_type,
            visit_type,
            appointment_mode,
            appointment_date,
            slot_id,
            reason
        } = req.body;

        if (!rawWaId || !appointment_date || !slot_id || !doctor_type) {
            return res.status(400).json({
                success: false,
                message: 'wa_id, appointment_date, slot_id, and doctor_type are required.'
            });
        }

        // Step 1: Normalize wa_id
        const normalized = normalizeWaId(rawWaId);
        // Step 2: Extract local mobile
        const mobile = extractMobile(rawWaId);
        const mobileHash = hashField(normalizePhone(mobile));

        // Step 3: Check patient exists
        const patient = await Patient.findOne({
            $or: [
                { wa_id: normalized },
                { wa_id: rawWaId },
                { wa_id: mobile },
                { mobile_hash: mobileHash }
            ],
            is_deleted: false
        });

        // Step 4: If not found — reject with 409
        if (!patient) {
            return res.status(409).json({
                success: false,
                message: 'Mobile number not registered. Please complete registration first.'
            });
        }

        // Step 5: Book using unified core logic (inline to store wa_id)
        const queryDate = toMidnight(appointment_date);
        if (isNaN(queryDate.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid appointment_date. Use YYYY-MM-DD.' });
        }

        const slotTaken = await SlotAvailability.findOne({
            slot_id, slot_date: queryDate,
            $or: [{ is_booked: true }, { blocked_by_admin: true }]
        });
        if (slotTaken) {
            return res.status(409).json({ success: false, message: 'This time slot is already booked or blocked. Please choose another.' });
        }

        const existing = await Appointment.findOne({
            patient_id: patient.patient_id,
            appointment_date: queryDate,
            status: { $in: ['BOOKED', 'CONFIRMED'] }
        });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: `Patient already has appointment ${existing.appointment_id} on this date. Cancel it first to rebook.`
            });
        }

        const slot = await Slot.findOne({ slot_id });
        const appointment_id = await generateAppointmentId();

        await Appointment.create({
            appointment_id,
            patient_id: patient.patient_id,
            visit_type: visit_type || 'CONSULTATION',
            appointment_mode: appointment_mode || 'OFFLINE',
            doctor_type,
            appointment_date: queryDate,
            slot_id,
            appointment_time: slot?.start_time || null,
            reason: reason || null,
            wa_id: normalized,          // stored for traceability
            status: 'CONFIRMED',
            booking_source: 'whatsapp',
            confirmation_sent: true,
            created_at: new Date(),
            last_updated_at: new Date(),
            last_updated_by: normalized
        });

        // Mark slot booked
        const avail = await SlotAvailability.findOne({ slot_id, slot_date: queryDate });
        if (avail) {
            await SlotAvailability.updateOne({ _id: avail._id }, { $set: { is_booked: true, appointment_id, doctor_type } });
        } else {
            await SlotAvailability.create({ slot_id, slot_date: queryDate, doctor_type, is_booked: true, blocked_by_admin: false, appointment_id });
        }

        await audit({
            event_type: 'APPOINTMENT_BOOKED', entity_type: 'appointment', entity_id: appointment_id,
            actor: normalized, actor_type: 'SYSTEM',
            new_value: { patient_id: patient.patient_id, date: appointment_date, slot_id, booking_source: 'whatsapp', wa_id: normalized }
        });

        res.status(201).json({
            success: true,
            data: {
                appointment_id,
                patient_id: patient.patient_id,
                child_name: patient.child_name,
                mobile: patient.mobile || mobile,
                status: 'CONFIRMED',
                booking_source: 'whatsapp',
                wa_id: normalized,
                appointment_date: queryDate,
                appointment_time: slot?.start_time || null,
                slot: slot ? { slot_id, label: slot.slot_label || slot.display_label } : { slot_id }
            }
        });

    } catch (err) {
        console.error('[bookByWhatsapp]', err.stack);
        if (err.code === 11000) return res.status(409).json({ success: false, message: 'Concurrent booking detected. Please choose another slot.' });
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── POST /api/appointments/form ───────────────────────────────────────────────
// Dedicated web form booking endpoint.
// Patient identified by mobile number. No auth required.
exports.bookByForm = async (req, res) => {
    try {
        const {
            mobile,
            doctor_type,
            visit_type,
            appointment_mode,
            appointment_date,
            slot_id,
            reason
        } = req.body;

        if (!mobile || !appointment_date || !slot_id || !doctor_type) {
            return res.status(400).json({
                success: false,
                message: 'mobile, appointment_date, slot_id, and doctor_type are required.'
            });
        }

        const normalizedMobile = normalizePhone(mobile);
        const mobileHash = hashField(normalizedMobile);

        // Lookup patient by mobile number
        const patient = await Patient.findOne({
            $or: [
                { mobile_hash: mobileHash },
                { wa_id: mobile },
                { wa_id: normalizedMobile }
            ],
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

        const slotTaken = await SlotAvailability.findOne({
            slot_id, slot_date: queryDate,
            $or: [{ is_booked: true }, { blocked_by_admin: true }]
        });
        if (slotTaken) {
            return res.status(409).json({ success: false, message: 'This time slot is already booked or blocked. Please choose another.' });
        }

        const existing = await Appointment.findOne({
            patient_id: patient.patient_id,
            appointment_date: queryDate,
            status: { $in: ['BOOKED', 'CONFIRMED'] }
        });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: `Patient already has appointment ${existing.appointment_id} on this date. Cancel it first.`
            });
        }

        const slot = await Slot.findOne({ slot_id });
        const appointment_id = await generateAppointmentId();

        await Appointment.create({
            appointment_id,
            patient_id: patient.patient_id,
            visit_type: visit_type || 'CONSULTATION',
            appointment_mode: appointment_mode || 'OFFLINE',
            doctor_type,
            appointment_date: queryDate,
            slot_id,
            appointment_time: slot?.start_time || null,
            reason: reason || null,
            status: 'CONFIRMED',
            booking_source: 'form',
            confirmation_sent: true,
            created_at: new Date(),
            last_updated_at: new Date(),
            last_updated_by: 'FORM'
        });

        const avail = await SlotAvailability.findOne({ slot_id, slot_date: queryDate });
        if (avail) {
            await SlotAvailability.updateOne({ _id: avail._id }, { $set: { is_booked: true, appointment_id, doctor_type } });
        } else {
            await SlotAvailability.create({ slot_id, slot_date: queryDate, doctor_type, is_booked: true, blocked_by_admin: false, appointment_id });
        }

        await audit({
            event_type: 'APPOINTMENT_BOOKED', entity_type: 'appointment', entity_id: appointment_id,
            actor: mobile, actor_type: 'SYSTEM',
            new_value: { patient_id: patient.patient_id, date: appointment_date, slot_id, booking_source: 'form' }
        });

        res.status(201).json({
            success: true,
            data: {
                appointment_id,
                patient_id: patient.patient_id,
                child_name: patient.child_name,
                mobile: patient.mobile || normalizedMobile,
                status: 'CONFIRMED',
                booking_source: 'form',
                appointment_date: queryDate,
                appointment_time: slot?.start_time || null,
                slot: slot ? { slot_id, label: slot.slot_label || slot.display_label } : { slot_id }
            }
        });

    } catch (err) {
        console.error('[bookByForm]', err.stack);
        if (err.code === 11000) return res.status(409).json({ success: false, message: 'Concurrent booking detected. Please choose another slot.' });
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── 9. GET /api/appointments/reminders/pending-24h ───────────────────────────
// Fetch appointments for tomorrow that haven't had a 24h reminder sent.
exports.getPending24hReminders = async (req, res) => {
    try {
        const tomorrow = new Date();
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        const queryDate = toMidnight(tomorrow);

        const appointments = await Appointment.find({
            appointment_date: queryDate,
            status: { $in: ['BOOKED', 'CONFIRMED'] },
            reminder_24h_sent: false
        }).sort({ slot_id: 1 });

        const enriched = await Promise.all(appointments.map(enrichAppointment));
        res.json({ success: true, date: queryDate, count: enriched.length, data: enriched });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── 10. PATCH /api/appointments/reminders/:appointment_id/mark-sent ──────────
// Mark a specific reminder type as sent
exports.markReminderSent = async (req, res) => {
    try {
        const { appointment_id } = req.params;
        const { type } = req.body; // '24h' or '2h'

        if (!['24h', '2h'].includes(type)) {
            return res.status(400).json({ success: false, message: "Type must be '24h' or '2h'" });
        }

        const appointment = await Appointment.findOne({ appointment_id });
        if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });

        // Validation: Check if the appointment date matches the reminder type
        const now = new Date();
        const appDate = toMidnight(appointment.appointment_date);

        if (type === '24h') {
            const tomorrow = toMidnight(new Date());
            tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
            if (appDate.getTime() !== tomorrow.getTime()) {
                console.warn(`[Reminder Warning] Marking 24h reminder for appointment on ${appDate.toISOString().split('T')[0]}, but today is ${now.toISOString().split('T')[0]}`);
                // We'll allow it but log a warning, as sometimes manual overrides or late triggers happen
            }
        } else if (type === '2h') {
            const today = toMidnight(new Date());
            if (appDate.getTime() !== today.getTime()) {
                console.warn(`[Reminder Warning] Marking 2h reminder for appointment on ${appDate.toISOString().split('T')[0]}, but today is ${now.toISOString().split('T')[0]}`);
            }
        }

        const field = type === '24h' ? 'reminder_24h_sent' : 'reminder_2h_sent';
        const timeField = type === '24h' ? 'reminder_24h_sent_at' : 'reminder_2h_sent_at';

        const updated = await Appointment.findOneAndUpdate(
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
        res.status(500).json({ success: false, error: err.message });
    }
};
