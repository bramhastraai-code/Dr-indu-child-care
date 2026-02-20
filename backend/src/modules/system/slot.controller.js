const Slot = require('../../models/Slot');
const SlotAvailability = require('../../models/SlotAvailability');
const audit = require('../../utils/audit');
const { toMidnight } = require('../../utils/helpers');

// @route   GET /api/slots/available
exports.getAvailableSlots = async (req, res) => {
    try {
        const { doctor_type, date } = req.query;

        if (!doctor_type || !date) {
            return res.status(400).json({ success: false, message: 'doctor_type and date are required' });
        }

        const queryDate = toMidnight(date);
        const dayOfWeek = queryDate.getDay(); // 0=Sun … 6=Sat

        // 1. Get all active slot templates that are enabled for this doctor+day
        const templates = await Slot.find({ is_active: true }).sort({ start_time: 1 });
        const todayTemplates = templates.filter(t => {
            // Use per-doctor-type schedule if defined, else fall back to global days_of_week
            const perDoctor = t.days_by_doctor?.get(doctor_type);
            const activeDays = (perDoctor && perDoctor.length > 0) ? perDoctor
                : (t.days_of_week?.length > 0 ? t.days_of_week : [0, 1, 2, 3, 4, 5, 6]);
            return activeDays.includes(dayOfWeek);
        });

        // 2. Get ALL booked/blocked slots on this date (across all doctor types)
        const unavailable = await SlotAvailability.find({
            slot_date: queryDate,
            $or: [{ is_booked: true }, { blocked_by_admin: true }]
        });

        const bookedSlotIds = new Set(unavailable.map(a => a.slot_id));

        const available_slots = todayTemplates
            .filter(t => !bookedSlotIds.has(t.slot_id))
            .map(t => ({
                slot_id: t.slot_id,
                label: t.slot_label || t.display_label,
                session: t.session,
                start_time: t.start_time,
                end_time: t.end_time
            }));

        res.json({
            success: true,
            date,
            doctor_type,
            day_of_week: dayOfWeek,
            is_clinic_open: true,
            data: available_slots,
            total_available: available_slots.length
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @route   GET /api/slots/daily-status
exports.getDailyStatus = async (req, res) => {
    try {
        const { doctor_type, date } = req.query;
        if (!doctor_type || !date) {
            return res.status(400).json({ success: false, message: 'doctor_type and date are required' });
        }

        const queryDate = toMidnight(date);
        const templates = await Slot.find().sort({ sort_order: 1 });
        const availability = await SlotAvailability.find({ slot_date: queryDate });

        const statusMap = {};
        availability.forEach(a => {
            const prev = statusMap[a.slot_id] || {
                is_booked: false,
                blocked_by_admin: false,
                blocked_reason: null,
                appointment_id: null
            };
            statusMap[a.slot_id] = {
                is_booked: prev.is_booked || Boolean(a.is_booked),
                blocked_by_admin: prev.blocked_by_admin || Boolean(a.blocked_by_admin),
                blocked_reason: prev.blocked_reason || a.blocked_reason || null,
                appointment_id: prev.appointment_id || a.appointment_id || null
            };
        });

        const data = templates.map(t => {
            const status = statusMap[t.slot_id] || { is_booked: false, blocked_by_admin: false };
            return {
                ...t.toObject(),
                is_booked: Boolean(status.is_booked),
                blocked_by_admin: Boolean(status.blocked_by_admin),
                blocked_reason: status.blocked_reason || null,
                appointment_id: status.appointment_id || null,
                status
            };
        });

        res.json({ success: true, date, doctor_type, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @route   POST /api/slots/block
exports.blockSlot = async (req, res) => {
    try {
        const { slots, slot_date, doctor_type, reason, blocked_by } = req.body;

        if (!slots || !Array.isArray(slots) || !slot_date || !doctor_type) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const queryDate = toMidnight(slot_date);
        const actor = blocked_by || (req.admin ? req.admin.username : 'SECRETARY');

        const ops = slots.map(slot_id =>
            SlotAvailability.findOneAndUpdate(
                { slot_id, slot_date: queryDate, doctor_type },
                {
                    is_booked: false,
                    blocked_by_admin: true,
                    blocked_reason: reason || null,
                    blocked_by: actor,
                    blocked_at: new Date()
                },
                { upsert: true }
            )
        );

        await Promise.all(ops);

        await audit({
            event_type: 'SLOT_BLOCKED',
            entity_type: 'time_slots',
            entity_id: `${doctor_type}_${slot_date}`,
            actor,
            actor_type: req.admin ? req.admin.role : 'SECRETARY',
            new_value: { slots, reason }
        });

        res.json({ success: true, message: 'Slots blocked successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @route   POST /api/slots/unblock
exports.unblockSlot = async (req, res) => {
    try {
        const { slots, slot_date, doctor_type } = req.body;

        if (!slots || !Array.isArray(slots) || !slot_date || !doctor_type) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const queryDate = toMidnight(slot_date);
        const actor = req.admin ? req.admin.username : 'SECRETARY';

        await SlotAvailability.updateMany(
            {
                slot_id: { $in: slots },
                slot_date: queryDate,
                doctor_type,
                is_booked: false // Safety: don't unblock if actually booked
            },
            {
                blocked_by_admin: false,
                blocked_reason: null,
                blocked_by: null,
                blocked_at: null
            }
        );

        await audit({
            event_type: 'SLOT_UNBLOCKED',
            entity_type: 'time_slots',
            entity_id: `${doctor_type}_${slot_date}`,
            actor,
            actor_type: req.admin ? req.admin.role : 'SECRETARY',
            new_value: { slots }
        });

        res.json({ success: true, message: 'Slots unblocked successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @route   GET /api/slots/config
exports.getSlotConfig = async (req, res) => {
    try {
        const slots = await Slot.find().sort({ sort_order: 1 });
        res.json({ success: true, data: slots });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @route   PUT /api/slots/config
exports.updateSlotConfig = async (req, res) => {
    try {
        const { slots } = req.body;
        const actor = req.admin ? req.admin.username : 'ADMIN';

        const ops = slots.map(s =>
            Slot.findOneAndUpdate(
                { slot_id: s.slot_id },
                { ...s },
                { upsert: true, new: true }
            )
        );

        const data = await Promise.all(ops);

        await audit({
            event_type: 'SLOT_CONFIG_UPDATED',
            entity_type: 'time_slots',
            entity_id: 'GLOBAL',
            actor,
            actor_type: req.admin ? req.admin.role : 'ADMIN'
        });

        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @route   POST /api/slots/daily-update
exports.updateDailySlot = async (req, res) => {
    try {
        const { slot_id, slot_date, doctor_type, custom_label, custom_start_time, custom_end_time } = req.body;

        if (!slot_id || !slot_date || !doctor_type) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const queryDate = toMidnight(slot_date);
        const actor = req.admin ? req.admin.username : 'ADMIN';

        const updated = await SlotAvailability.findOneAndUpdate(
            { slot_id, slot_date: queryDate, doctor_type },
            {
                custom_label,
                custom_start_time,
                custom_end_time,
                blocked_by: actor,
                blocked_at: new Date()
            },
            { upsert: true, new: true }
        );

        await audit({
            event_type: 'DAILY_SLOT_UPDATED',
            entity_type: 'time_slots',
            entity_id: `${slot_id}_${slot_date}`,
            actor,
            actor_type: req.admin ? req.admin.role : 'ADMIN',
            new_value: { custom_label, custom_start_time, custom_end_time }
        });

        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @route   POST /api/slots/config/add  — create a new slot template
exports.createSlot = async (req, res) => {
    try {
        const { slot_label, start_time, end_time, session, sort_order } = req.body;
        if (!slot_label || !start_time || !end_time || !session) {
            return res.status(400).json({ success: false, message: 'slot_label, start_time, end_time and session are required' });
        }
        // Auto-generate a unique slot_id from start_time e.g. "10:30" → "SLOT_1030"
        const base = `SLOT_${start_time.replace(':', '')}`;
        let slot_id = base;
        let i = 2;
        while (await Slot.findOne({ slot_id })) { slot_id = `${base}_${i++}`; }

        const slot = await Slot.create({
            slot_id, slot_label, display_label: slot_label,
            start_time, end_time, session, is_active: true,
            sort_order: sort_order ?? 99
        });
        const actor = req.admin?.username || 'ADMIN';
        await audit({ event_type: 'SLOT_CREATED', entity_type: 'time_slots', entity_id: slot_id, actor, new_value: slot });
        res.status(201).json({ success: true, data: slot });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @route   DELETE /api/slots/config/:slot_id  — remove a slot template
exports.deleteSlot = async (req, res) => {
    try {
        const { slot_id } = req.params;
        const slot = await Slot.findOne({ slot_id });
        if (!slot) return res.status(404).json({ success: false, message: 'Slot not found' });

        // If slot has live bookings → soft-delete (deactivate) only
        const used = await SlotAvailability.exists({ slot_id, is_booked: true });
        if (used) {
            await Slot.findOneAndUpdate({ slot_id }, { is_active: false });
            return res.json({ success: true, message: 'Slot deactivated (existing bookings preserved)', soft: true });
        }
        await Slot.deleteOne({ slot_id });
        await SlotAvailability.deleteMany({ slot_id });
        const actor = req.admin?.username || 'ADMIN';
        await audit({ event_type: 'SLOT_DELETED', entity_type: 'time_slots', entity_id: slot_id, actor });
        res.json({ success: true, message: 'Slot permanently deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
