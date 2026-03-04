const Slot = require('../../models/Slot');
const SlotAvailability = require('../../models/SlotAvailability');
const Doctor = require('../../models/Doctor');
const audit = require('../../utils/audit');
const { toMidnight, canonicalizeDoctorName } = require('../../utils/helpers');
const {
    getDoctorIdFromSession,
    ensureDoctorSessionHasProfile,
    ensureDoctorMatches
} = require('../../utils/doctorScope');

const resolveScopedDoctorInput = (req, doctor_id, doctor_name) => {
    const sessionDoctorId = getDoctorIdFromSession(req);
    if (!sessionDoctorId) return { doctor_id, doctor_name };
    return { doctor_id: sessionDoctorId, doctor_name: null };
};

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const resolveDoctorRecord = async ({ doctor_id, doctor_name, activeOnly = false }) => {
    const conditions = [];

    if (doctor_id) {
        conditions.push({ doctor_id });
    }

    if (doctor_name) {
        const canonical = canonicalizeDoctorName(doctor_name);
        conditions.push({
            name: { $regex: new RegExp(`^${escapeRegex(doctor_name.trim())}$`, 'i') }
        });
        conditions.push({
            name: { $regex: new RegExp(`^${escapeRegex(canonical)}$`, 'i') }
        });
    }

    if (!conditions.length) return null;

    const filter = { $or: conditions };
    if (activeOnly) filter.is_active = true;

    return Doctor.findOne(filter);
};

// @route   GET /api/slots/available
exports.getAvailableSlots = async (req, res) => {
    try {
        const { doctor_name, date, doctor_id } = req.query;
        if (!ensureDoctorSessionHasProfile(req, res)) return;
        const { doctor_id: scopedDoctorId, doctor_name: scopedDoctorName } = resolveScopedDoctorInput(req, doctor_id, doctor_name);

        const queryDate = toMidnight(date);
        const dayOfWeek = queryDate.getUTCDay();
        const now = new Date();
        const isToday = queryDate.getUTCFullYear() === now.getUTCFullYear() &&
            queryDate.getUTCMonth() === now.getUTCMonth() &&
            queryDate.getUTCDate() === now.getUTCDate();

        const allTemplates = await Slot.find({ is_active: true }).sort({ start_time: 1 });

        // Case A: Specific Doctor (by ID or Name)
        if (scopedDoctorId || scopedDoctorName) {
            const targetDoctor = await resolveDoctorRecord({
                doctor_id: scopedDoctorId,
                doctor_name: scopedDoctorName
            });

            if (!targetDoctor) return res.status(404).json({ success: false, message: 'Doctor not found or inactive' });
            if (!ensureDoctorMatches(req, res, targetDoctor.doctor_id, 'You can only view slots for your own doctor profile')) return;
            if (!targetDoctor.is_active) return res.json({ success: true, message: 'Doctor is inactive', data: [] });

            const actualName = targetDoctor.name;
            const actualId = targetDoctor.doctor_id;

            // Resolve which templates apply to this doctor today
            const doctorSlotIds = targetDoctor.available_slots?.get(dayOfWeek.toString()) || [];
            let todayTemplates = [];
            if (doctorSlotIds.length === 0) {
                todayTemplates = allTemplates.filter(t => {
                    const safeName = actualName.replace(/\./g, '');
                    const perDoctor = t.days_by_doctor?.get(safeName) || t.days_by_doctor?.get(actualName);
                    const activeDays = (perDoctor && perDoctor.length > 0) ? perDoctor : (t.days_of_week || [0, 1, 2, 3, 4, 5, 6]);
                    return activeDays.includes(dayOfWeek);
                });
            } else {
                todayTemplates = allTemplates.filter(t => doctorSlotIds.includes(t.slot_id));
            }

            const dailyAvailability = await SlotAvailability.find({ slot_date: queryDate, $or: [{ doctor_id: actualId }, { doctor_name: actualName }] });
            const statusMap = new Map(dailyAvailability.map(a => [a.slot_id, a]));

            const available = todayTemplates
                .filter(t => {
                    const status = statusMap.get(t.slot_id);
                    if (status && (status.is_booked || status.blocked_by_admin)) return false;
                    if (isToday) {
                        const [h, m] = (status?.custom_start_time || t.start_time).split(':');
                        const slotMins = parseInt(h) * 60 + parseInt(m);
                        const clinicNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
                        const nowMins = clinicNow.getUTCHours() * 60 + clinicNow.getUTCMinutes();
                        if (slotMins < nowMins - 5) return false;
                    }
                    return true;
                })
                .map(t => {
                    const status = statusMap.get(t.slot_id);
                    const baseLabel = status?.custom_label || t.slot_label || t.display_label;
                    return {
                        slot_id: t.slot_id,
                        label: `${actualName} - ${baseLabel}`,
                        session: t.session,
                        start_time: status?.custom_start_time || t.start_time,
                        end_time: status?.custom_end_time || t.end_time
                    };
                });

            return res.json({
                success: true,
                date,
                formatted_date: queryDate.toISOString().split('T')[0],
                doctor_name: actualName,
                doctor_id: actualId,
                doctor_speciality: targetDoctor.speciality,
                data: available
            });
        }

        // Case B: n8n "Who is available?" mode (return for all active doctors)
        const activeDoctors = await Doctor.find({ is_active: true });
        const results = [];

        for (const dr of activeDoctors) {
            const drName = dr.name;
            const drId = dr.doctor_id;

            const drSlotIds = dr.available_slots?.get(dayOfWeek.toString()) || [];
            let drTemplates = [];
            if (drSlotIds.length === 0) {
                drTemplates = allTemplates.filter(t => {
                    const safeName = drName.replace(/\./g, '');
                    const perDoctor = t.days_by_doctor?.get(safeName) || t.days_by_doctor?.get(drName);
                    const activeDays = (perDoctor && perDoctor.length > 0) ? perDoctor : (t.days_of_week || [0, 1, 2, 3, 4, 5, 6]);
                    return activeDays.includes(dayOfWeek);
                });
            } else {
                drTemplates = allTemplates.filter(t => drSlotIds.includes(t.slot_id));
            }

            const daily = await SlotAvailability.find({ slot_date: queryDate, $or: [{ doctor_id: drId }, { doctor_name: drName }] });
            const statusMap = new Map(daily.map(a => [a.slot_id, a]));

            const available = drTemplates
                .filter(t => {
                    const status = statusMap.get(t.slot_id);
                    if (status && (status.is_booked || status.blocked_by_admin)) return false;
                    if (isToday) {
                        const [h, m] = (status?.custom_start_time || t.start_time).split(':');
                        const slotMins = parseInt(h) * 60 + parseInt(m);
                        const clinicNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
                        const nowMins = clinicNow.getUTCHours() * 60 + clinicNow.getUTCMinutes();
                        if (slotMins < nowMins - 5) return false;
                    }
                    return true;
                })
                .map(t => ({
                    slot_id: t.slot_id,
                    label: `${drName} - ${t.slot_label || t.display_label}`,
                    start_time: t.start_time
                }));

            if (available.length > 0) {
                results.push({
                    doctor_name: drName,
                    doctor_id: drId,
                    speciality: dr.speciality,
                    available_count: available.length,
                    slots: available
                });
            }
        }

        res.json({
            success: true,
            date,
            formatted_date: queryDate.toISOString().split('T')[0],
            data: results
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @route   GET /api/slots/daily-status
exports.getDailyStatus = async (req, res) => {
    try {
        const { doctor_name, date, doctor_id } = req.query;
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { doctor_id: scopedDoctorId, doctor_name: scopedDoctorName } = resolveScopedDoctorInput(req, doctor_id, doctor_name);
        if (!date || (!scopedDoctorId && !scopedDoctorName)) {
            return res.status(400).json({ success: false, message: 'doctor_id/doctor_name and date are required' });
        }

        const doctor = await resolveDoctorRecord({
            doctor_id: scopedDoctorId,
            doctor_name: scopedDoctorName
        });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });
        if (!ensureDoctorMatches(req, res, doctor.doctor_id, 'You can only view slot status for your own doctor profile')) return;

        const queryDate = toMidnight(date);
        const templates = await Slot.find({ is_active: true }).sort({ sort_order: 1 });
        const availability = await SlotAvailability.find({
            slot_date: queryDate,
            $or: [
                { doctor_id: doctor.doctor_id },
                { doctor_name: doctor.name }
            ]
        });

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

        res.json({ success: true, date, doctor_name: doctor.name, doctor_id: doctor.doctor_id, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @route   POST /api/slots/block
exports.blockSlot = async (req, res) => {
    try {
        const { slots, slot_date, doctor_name, doctor_id, reason, blocked_by } = req.body || {};
        if (!ensureDoctorSessionHasProfile(req, res)) return;
        const { doctor_id: scopedDoctorId, doctor_name: scopedDoctorName } = resolveScopedDoctorInput(req, doctor_id, doctor_name);

        if (!slots || !Array.isArray(slots) || !slot_date || (!scopedDoctorName && !scopedDoctorId)) {
            return res.status(400).json({ success: false, message: 'Missing required fields (slots, slot_date, and doctor_name/id)' });
        }

        const queryDate = toMidnight(slot_date);
        const actor = blocked_by || (req.user ? req.user.username : 'SECRETARY');

        // Resolve canonical doctor
        const doctor = await resolveDoctorRecord({
            doctor_id: scopedDoctorId,
            doctor_name: scopedDoctorName
        });

        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });
        if (!ensureDoctorMatches(req, res, doctor.doctor_id, 'You can only block slots for your own doctor profile')) return;
        if (!doctor.is_active) return res.status(400).json({ success: false, message: 'Doctor is inactive' });

        const finalName = doctor.name;
        const finalId = doctor.doctor_id;

        const ops = slots.map(slot_id =>
            SlotAvailability.findOneAndUpdate(
                { slot_id, slot_date: queryDate, doctor_name: finalName },
                {
                    doctor_id: finalId,
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
            entity_id: `${finalName}_${slot_date}`,
            actor,
            actor_type: req.user ? req.user.role : 'SECRETARY',
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
        const { slots, slot_date, doctor_name, doctor_id } = req.body || {};
        if (!ensureDoctorSessionHasProfile(req, res)) return;
        const { doctor_id: scopedDoctorId, doctor_name: scopedDoctorName } = resolveScopedDoctorInput(req, doctor_id, doctor_name);

        if (!slots || !Array.isArray(slots) || !slot_date || (!scopedDoctorName && !scopedDoctorId)) {
            return res.status(400).json({ success: false, message: 'Missing required fields (slots, slot_date, and doctor_name/id)' });
        }

        const queryDate = toMidnight(slot_date);
        const actor = req.user ? req.user.username : 'SECRETARY';

        // Resolve canonical doctor
        const doctor = await resolveDoctorRecord({
            doctor_id: scopedDoctorId,
            doctor_name: scopedDoctorName
        });

        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });
        if (!ensureDoctorMatches(req, res, doctor.doctor_id, 'You can only unblock slots for your own doctor profile')) return;
        const finalName = doctor.name;
        const finalId = doctor.doctor_id;

        const ops = slots.map(slot_id =>
            SlotAvailability.findOneAndUpdate(
                {
                    slot_id,
                    slot_date: queryDate,
                    doctor_name: finalName,
                    is_booked: false // Safety: don't unblock if actually booked
                },
                {
                    doctor_id: finalId,
                    blocked_by_admin: false,
                    blocked_reason: null,
                    blocked_by: null,
                    blocked_at: null
                },
                { upsert: false } // Don't create new ones if they don't exist
            )
        );

        await Promise.all(ops);

        await audit({
            event_type: 'SLOT_UNBLOCKED',
            entity_type: 'time_slots',
            entity_id: `${finalName}_${slot_date}`,
            actor,
            actor_type: req.user ? req.user.role : 'SECRETARY',
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
        const slots = await Slot.find({ is_active: true }).sort({ sort_order: 1, start_time: 1 });
        const Doctor = require('../../models/Doctor');
        const activeDoctors = await Doctor.find({ is_active: true }).sort({ name: 1 });

        // 1. Identify all unique names assigned to slots (Identities)
        const identities = new Map(); // Canonical -> DisplayName

        activeDoctors.forEach(dr => {
            const canonical = canonicalizeDoctorName(dr.name);
            // Deduplicate: If we already have this canonical name, stick to the prioritized display name
            if (!identities.has(canonical)) {
                identities.set(canonical, dr.name);
            }
        });

        slots.forEach(s => {
            if (s.days_by_doctor) {
                for (const key of s.days_by_doctor.keys()) {
                    const canonical = canonicalizeDoctorName(key);
                    if (!identities.has(canonical)) {
                        identities.set(canonical, key);
                    }
                }
            }
        });

        // 2. Build the result for each unique identity
        const results = Array.from(identities.entries()).map(([canonical, originalName]) => {
            const assignedSlots = slots.filter(s => {
                // Check direct assignment in days_by_doctor
                let perDr = null;
                if (s.days_by_doctor) {
                    for (const [key, val] of s.days_by_doctor.entries()) {
                        if (canonicalizeDoctorName(key) === canonical) {
                            perDr = val;
                            break;
                        }
                    }
                }

                if (perDr && perDr.length > 0) return true;

                // If general slot (no specific assignment), all real doctors get it
                const isRealDoctor = activeDoctors.some(d => canonicalizeDoctorName(d.name) === canonical);
                const hasAnySpecificDoctor = s.days_by_doctor &&
                    Array.from(s.days_by_doctor.values()).some(val => val && val.length > 0);

                if (!hasAnySpecificDoctor && isRealDoctor) return true;
                return false;
            }).map(s => {
                // Find correct active days for this specific identity
                let activeDays = s.days_of_week;
                if (s.days_by_doctor) {
                    for (const [key, val] of s.days_by_doctor.entries()) {
                        if (canonicalizeDoctorName(key) === canonical) {
                            activeDays = val;
                            break;
                        }
                    }
                }

                return {
                    slot_id: s.slot_id,
                    label: s.slot_label,
                    time: `${s.start_time} - ${s.end_time}`,
                    session: s.session,
                    active_days: activeDays
                };
            });

            return {
                name: originalName,
                is_doctor: activeDoctors.some(d => canonicalizeDoctorName(d.name) === canonical),
                slot_count: assignedSlots.length,
                slots: assignedSlots
            };
        }).filter(item => item.slot_count > 0 && item.is_doctor); // Only return doctors with slots

        res.json({
            success: true,
            count: results.length,
            data: results
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @route   PUT /api/slots/config
exports.updateSlotConfig = async (req, res) => {
    try {
        const { slots } = req.body || {};
        const actor = req.user?.username || 'ADMIN';

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
            actor_type: req.user ? req.user.role : 'ADMIN'
        });

        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @route   POST /api/slots/daily-update
exports.updateDailySlot = async (req, res) => {
    try {
        const { slot_id, slot_date, doctor_name, doctor_id, custom_label, custom_start_time, custom_end_time } = req.body || {};
        if (!ensureDoctorSessionHasProfile(req, res)) return;
        const { doctor_id: scopedDoctorId, doctor_name: scopedDoctorName } = resolveScopedDoctorInput(req, doctor_id, doctor_name);

        if (!slot_id || !slot_date || (!scopedDoctorName && !scopedDoctorId)) {
            return res.status(400).json({ success: false, message: 'Missing required fields (slot_id, slot_date, and doctor_name/id)' });
        }

        const queryDate = toMidnight(slot_date);
        const actor = req.user?.username || 'ADMIN';

        // Resolve canonical doctor
        const doctor = await resolveDoctorRecord({
            doctor_id: scopedDoctorId,
            doctor_name: scopedDoctorName
        });

        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });
        if (!ensureDoctorMatches(req, res, doctor.doctor_id, 'You can only update daily slots for your own doctor profile')) return;
        if (!doctor.is_active) return res.status(400).json({ success: false, message: 'Doctor is inactive' });

        const finalName = doctor.name;
        const finalId = doctor.doctor_id;

        const updated = await SlotAvailability.findOneAndUpdate(
            { slot_id, slot_date: queryDate, doctor_name: finalName },
            {
                doctor_id: finalId,
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
            actor_type: req.user ? req.user.role : 'ADMIN',
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
        const { slot_label, start_time, end_time, session, sort_order } = req.body || {};
        if (!slot_label || !start_time || !end_time || !session) {
            return res.status(400).json({ success: false, message: 'slot_label, start_time, end_time and session are required' });
        }
        // Auto-generate a unique slot_id from start_time e.g. "10:30" → "SLOT_1030"
        const base = `SLOT_${start_time.replace(':', '')}`;
        let slot_id = base;
        let i = 2;
        while (await Slot.findOne({ slot_id })) { slot_id = `${base}_${i++}`; }

        // Automatically connect all active doctors to this new slot
        const Doctor = require('../../models/Doctor');
        const activeDoctors = await Doctor.find({ is_active: true });
        const daysByDoctor = {};
        activeDoctors.forEach(d => {
            const safeName = d.name.replace(/\./g, '');
            daysByDoctor[safeName] = [1, 2, 3, 4, 5, 6]; // Default Mon-Sat
        });

        const slot = await Slot.create({
            slot_id, slot_label, display_label: slot_label,
            start_time, end_time, session, is_active: true,
            sort_order: sort_order ?? 99,
            days_by_doctor: daysByDoctor
        });
        const actor = req.user?.username || 'ADMIN';
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

        // If slot has live/future bookings → soft-delete (deactivate) only
        const used = await SlotAvailability.exists({
            slot_id,
            is_booked: true,
            slot_date: { $gte: toMidnight(new Date()) }
        });
        if (used) {
            await Slot.findOneAndUpdate({ slot_id }, { is_active: false });
            return res.json({ success: true, message: 'Slot deactivated (existing bookings preserved)', soft: true });
        }
        await Slot.deleteOne({ slot_id });
        await SlotAvailability.deleteMany({ slot_id });
        const actor = req.user?.username || 'ADMIN';
        await audit({ event_type: 'SLOT_DELETED', entity_type: 'time_slots', entity_id: slot_id, actor });
        res.json({ success: true, message: 'Slot permanently deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @route   GET /api/slots/doctor-slots/:doctor_id
exports.getDoctorSlots = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const requestedDoctorId = req.params.doctor_id;
        const effectiveDoctorId = getDoctorIdFromSession(req) || requestedDoctorId;
        if (!ensureDoctorMatches(req, res, effectiveDoctorId, 'You can only view your own doctor slots')) return;

        const doctor = await Doctor.findOne({ doctor_id: effectiveDoctorId });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const safeName = doctor.name.replace(/\./g, '');
        const slots = await Slot.find({
            is_active: true,
            $or: [
                { [`days_by_doctor.${safeName}`]: { $exists: true } },
                { [`days_by_doctor.${doctor.name}`]: { $exists: true } }
            ]
        }).sort({ sort_order: 1, start_time: 1 });

        res.json({ success: true, doctor_id: doctor.doctor_id, data: slots });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
