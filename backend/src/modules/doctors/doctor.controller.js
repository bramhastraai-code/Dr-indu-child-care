const Doctor = require('../../models/Doctor');
const Slot = require('../../models/Slot');
const SlotAvailability = require('../../models/SlotAvailability');
const Appointment = require('../../models/Appointment');
const MRD = require('../../models/MRD');
const audit = require('../../utils/audit');
const {
    getDoctorIdFromSession,
    ensureDoctorSessionHasProfile,
    ensureDoctorMatches
} = require('../../utils/doctorScope');

const generateDoctorId = async () => {
    try {
        const prefix = 'DOC-';
        const last = await Doctor.findOne({ doctor_id: { $regex: `^${prefix}` } })
            .sort({ doctor_id: -1 });
        const seq = last ? parseInt(last.doctor_id.replace(prefix, ''), 10) + 1 : 1;
        return `${prefix}${seq.toString().padStart(5, '0')}`;
    } catch (err) {
        console.error('[ERROR] generateDoctorId:', err.message);
        throw err;
    }
};

/**
 * Propagates doctor name changes across all related models
 */
const propagateDoctorNameChange = async (oldName, newName, doctorId) => {
    try {
        if (!oldName || !newName || oldName === newName) return;

        console.log(`[INFO] Propagating doctor name change: "${oldName}" -> "${newName}" (${doctorId})`);

        // 1. Update Slot templates (days_by_doctor map)
        const safeOld = oldName.replace(/\./g, '');
        const safeNew = newName.replace(/\./g, '');
        const slots = await Slot.find({
            $or: [
                { [`days_by_doctor.${safeOld}`]: { $exists: true } },
                { [`days_by_doctor.${oldName}`]: { $exists: true } }
            ]
        });
        for (const slot of slots) {
            const days = slot.days_by_doctor.get(safeOld) || slot.days_by_doctor.get(oldName);
            slot.days_by_doctor.set(safeNew, days);
            slot.days_by_doctor.delete(safeOld);
            slot.days_by_doctor.delete(oldName);
            await slot.save();
        }

        // 2. Update SlotAvailability
        await SlotAvailability.updateMany(
            { $or: [{ doctor_id: doctorId }, { doctor_name: oldName }] },
            { doctor_name: newName, doctor_id: doctorId }
        );

        // 3. Update Appointments
        await Appointment.updateMany(
            { $or: [{ doctor_id: doctorId }, { doctor_name: oldName }] },
            {
                doctor_name: newName,
                doctor_id: doctorId,
                assigned_doctor_name: newName // legacy field sync
            }
        );

        // 4. Update MRD Entries
        const mrds = await MRD.find({
            $or: [
                { "entries.attending_doctor": oldName },
                { "entries.attending_doctor_id": doctorId }
            ]
        });
        for (const mrd of mrds) {
            let changed = false;
            mrd.entries.forEach(entry => {
                if (entry.attending_doctor === oldName || entry.attending_doctor_id === doctorId) {
                    entry.attending_doctor = newName;
                    entry.attending_doctor_id = doctorId;
                    changed = true;
                }
            });
            if (changed) await mrd.save();
        }

    } catch (err) {
        console.error('[ERROR] propagateDoctorNameChange:', err.message);
    }
};

/**
 * Connects a new doctor to all existing slots with default availability
 * @param {string} doctorName 
 * @param {number[]} [days] - Specific days of week doctor is available
 */
const connectDoctorToSlots = async (doctorName, days) => {
    try {
        const slots = await Slot.find({ is_active: true });
        const safeName = doctorName.replace(/\./g, '');
        const targetDays = (days && Array.isArray(days) && days.length > 0)
            ? days
            : [1, 2, 3, 4, 5, 6]; // Default: Mon-Sat

        for (const slot of slots) {
            // Only add if not already present or needs update
            if (!slot.days_by_doctor.has(safeName)) {
                // Use intersection of doctor's working days and slot's available days
                const slotDays = slot.days_of_week || [0, 1, 2, 3, 4, 5, 6];
                const intersection = targetDays.filter(d => slotDays.includes(d));

                if (intersection.length > 0) {
                    slot.days_by_doctor.set(safeName, intersection);
                    await slot.save();
                }
            }
        }
    } catch (err) {
        console.error('[ERROR] connectDoctorToSlots:', err.message);
    }
};

// GET /api/doctors
exports.getDoctors = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { all } = req.query;
        const sessionDoctorId = getDoctorIdFromSession(req);
        const query = sessionDoctorId
            ? { doctor_id: sessionDoctorId, ...(all === 'true' ? {} : { is_active: true }) }
            : (all === 'true' ? {} : { is_active: true });

        const doctors = await Doctor.find(query)
            .select('name doctor_id speciality -_id')
            .sort({ name: 1 });

        res.json({
            success: true,
            count: doctors.length,
            data: doctors
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// GET /api/doctors/:doctor_id
exports.getDoctorById = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;
        if (!ensureDoctorMatches(req, res, req.params.doctor_id, 'You can only view your own doctor profile')) return;

        const doctor = await Doctor.findOne({ doctor_id: req.params.doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });
        res.json({ success: true, data: doctor });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// POST /api/doctors
exports.createDoctor = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;
        if (getDoctorIdFromSession(req)) {
            return res.status(403).json({ success: false, message: 'Doctor profile cannot create additional doctor accounts' });
        }

        const doctor_id = await generateDoctorId();
        const { password, ...doctorPayload } = req.body || {};
        const doctor = await Doctor.create({
            ...doctorPayload,
            ...(password ? { password_hash: password } : {}),
            doctor_id
        });

        // Automatically connect doctor to slots so they show up in the slots sheet
        if (doctor.is_active !== false) {
            await connectDoctorToSlots(doctor.name, req.body.working_days);
        }

        const auditDoctor = doctor.toObject();
        delete auditDoctor.password_hash;

        await audit({
            event_type: 'DOCTOR_CREATED',
            entity_type: 'doctor',
            entity_id: doctor_id,
            actor: req.user?.username || 'ADMIN',
            actor_type: 'ADMIN',
            new_value: auditDoctor
        });

        res.status(201).json({ success: true, data: doctor });
    } catch (err) {
        console.error('[ERROR] createDoctor:', err.message);
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Doctor login username/email already exists' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
};

// PATCH /api/doctors/:doctor_id
exports.updateDoctor = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;
        if (!ensureDoctorMatches(req, res, req.params.doctor_id, 'You can only update your own doctor profile')) return;

        const oldDoctor = await Doctor.findOne({ doctor_id: req.params.doctor_id });
        if (!oldDoctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const oldName = oldDoctor.name;
        const updatePayload = { ...(req.body || {}) };
        const newName = updatePayload.name;
        const wasActive = oldDoctor.is_active;
        const hasPasswordUpdate = Object.prototype.hasOwnProperty.call(updatePayload, 'password');
        if (hasPasswordUpdate) {
            if (!updatePayload.password) {
                return res.status(400).json({ success: false, message: 'password cannot be empty' });
            }

            const nextLoginUsername = updatePayload.login_username !== undefined ? updatePayload.login_username : oldDoctor.login_username;
            const nextLoginEmail = updatePayload.login_email !== undefined ? updatePayload.login_email : oldDoctor.login_email;
            if (!nextLoginUsername && !nextLoginEmail) {
                return res.status(400).json({ success: false, message: 'Set login_username or login_email before setting password' });
            }

            updatePayload.password_hash = updatePayload.password;
            delete updatePayload.password;
        }

        Object.assign(oldDoctor, updatePayload);
        const doctor = await oldDoctor.save();

        // If name changed, propagate to all related records
        if (newName && newName !== oldName) {
            await propagateDoctorNameChange(oldName, newName, req.params.doctor_id);
        }

        // If reactivated, ensure they are in the slots sheet
        if (!wasActive && doctor.is_active) {
            await connectDoctorToSlots(doctor.name);
        }

        // If deactivated, remove from slot templates to keep UI clean
        if (wasActive && doctor.is_active === false) {
            const safeOld = oldName.replace(/\./g, '');
            const slots = await Slot.find({
                $or: [
                    { [`days_by_doctor.${safeOld}`]: { $exists: true } },
                    { [`days_by_doctor.${oldName}`]: { $exists: true } }
                ]
            });
            for (const slot of slots) {
                slot.days_by_doctor.delete(safeOld);
                slot.days_by_doctor.delete(oldName);
                await slot.save();
            }
        }

        const auditValue = { ...updatePayload };
        if (Object.prototype.hasOwnProperty.call(auditValue, 'password_hash')) {
            delete auditValue.password_hash;
            auditValue.password_changed = true;
        }

        await audit({
            event_type: 'DOCTOR_UPDATED',
            entity_type: 'doctor',
            entity_id: req.params.doctor_id,
            actor: req.user?.username || 'ADMIN',
            actor_type: 'ADMIN',
            new_value: auditValue
        });

        res.json({ success: true, data: doctor });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Doctor login username/email already exists' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
};

// DELETE /api/doctors/:doctor_id
exports.deleteDoctor = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;
        if (!ensureDoctorMatches(req, res, req.params.doctor_id, 'You can only delete your own doctor profile')) return;

        const doctor = await Doctor.findOne({ doctor_id: req.params.doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const doctorName = doctor.name;
        await Doctor.deleteOne({ doctor_id: req.params.doctor_id });

        // Cleanup: Remove from slot templates
        const safeName = doctorName.replace(/\./g, '');
        const slots = await Slot.find({
            $or: [
                { [`days_by_doctor.${safeName}`]: { $exists: true } },
                { [`days_by_doctor.${doctorName}`]: { $exists: true } }
            ]
        });
        for (const slot of slots) {
            slot.days_by_doctor.delete(safeName);
            slot.days_by_doctor.delete(doctorName);
            await slot.save();
        }

        await audit({
            event_type: 'DOCTOR_DELETED',
            entity_type: 'doctor',
            entity_id: req.params.doctor_id,
            actor: req.user?.username || 'ADMIN',
            actor_type: 'ADMIN',
            new_value: { deleted: true, name: doctorName }
        });

        res.json({ success: true, message: 'Doctor deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// GET /api/doctors/:doctor_id/schedule
exports.getDoctorSchedule = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;
        if (!ensureDoctorMatches(req, res, req.params.doctor_id, 'You can only view your own schedule')) return;

        const doctor = await Doctor.findOne({ doctor_id: req.params.doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        // Build schedule from slot templates (days_by_doctor map)
        const safeName = doctor.name.replace(/\./g, '');
        const allSlots = await Slot.find({ is_active: true }).sort({ sort_order: 1, start_time: 1 });

        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const schedule = {};
        days.forEach(d => schedule[d] = []);

        for (const slot of allSlots) {
            const doctorDays = slot.days_by_doctor?.get(safeName) || slot.days_by_doctor?.get(doctor.name) || [];
            doctorDays.forEach(dayIndex => {
                if (dayIndex >= 0 && dayIndex <= 6) {
                    schedule[days[dayIndex]].push({
                        slot_id: slot.slot_id,
                        label: slot.slot_label,
                        start: slot.start_time,
                        end: slot.end_time,
                        session: slot.session
                    });
                }
            });
        }

        res.json({
            success: true,
            data: {
                doctor_id: doctor.doctor_id,
                name: doctor.name,
                availability: doctor.availability || schedule
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// PATCH /api/doctors/:doctor_id/schedule
exports.updateDoctorSchedule = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;
        if (!ensureDoctorMatches(req, res, req.params.doctor_id, 'You can only update your own schedule')) return;

        const { availability } = req.body || {};
        if (!availability) {
            return res.status(400).json({ success: false, message: 'availability is required' });
        }

        const doctor = await Doctor.findOne({ doctor_id: req.params.doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        await Doctor.updateOne({ doctor_id: req.params.doctor_id }, { $set: { availability } });

        await audit({
            event_type: 'DOCTOR_SCHEDULE_UPDATED',
            entity_type: 'doctor',
            entity_id: req.params.doctor_id,
            actor: req.user?.username || 'ADMIN',
            actor_type: 'ADMIN',
            new_value: { availability }
        });

        res.json({ success: true, message: 'Schedule updated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
