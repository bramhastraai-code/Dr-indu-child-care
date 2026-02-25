const Doctor = require('../../models/Doctor');
const Slot = require('../../models/Slot');
const SlotAvailability = require('../../models/SlotAvailability');
const Appointment = require('../../models/Appointment');
const MRD = require('../../models/MRD');
const audit = require('../../utils/audit');

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
        const doctors = await Doctor.find({}).sort({ name: 1 });
        res.json({ success: true, data: doctors });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// GET /api/doctors/:doctor_id
exports.getDoctorById = async (req, res) => {
    try {
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
        const doctor_id = await generateDoctorId();
        const doctor = await Doctor.create({
            ...req.body,
            doctor_id
        });

        // Automatically connect doctor to slots so they show up in the slots sheet
        if (doctor.is_active !== false) {
            await connectDoctorToSlots(doctor.name, req.body.working_days);
        }

        await audit({
            event_type: 'DOCTOR_CREATED',
            entity_type: 'doctor',
            entity_id: doctor_id,
            actor: req.user?.username || 'ADMIN',
            actor_type: 'ADMIN',
            new_value: doctor
        });

        res.status(201).json({ success: true, data: doctor });
    } catch (err) {
        console.error('[ERROR] createDoctor:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// PATCH /api/doctors/:doctor_id
exports.updateDoctor = async (req, res) => {
    try {
        const oldDoctor = await Doctor.findOne({ doctor_id: req.params.doctor_id });
        if (!oldDoctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const oldName = oldDoctor.name;
        const newName = req.body.name;
        const wasActive = oldDoctor.is_active;
        const nowActive = req.body.is_active;

        const doctor = await Doctor.findOneAndUpdate(
            { doctor_id: req.params.doctor_id },
            { $set: req.body },
            { new: true }
        );

        // If name changed, propagate to all related records
        if (newName && newName !== oldName) {
            await propagateDoctorNameChange(oldName, newName, req.params.doctor_id);
        }

        // If reactivated, ensure they are in the slots sheet
        if (!wasActive && nowActive) {
            await connectDoctorToSlots(doctor.name);
        }

        // If deactivated, remove from slot templates to keep UI clean
        if (wasActive && nowActive === false) {
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

        await audit({
            event_type: 'DOCTOR_UPDATED',
            entity_type: 'doctor',
            entity_id: req.params.doctor_id,
            actor: req.user?.username || 'ADMIN',
            actor_type: 'ADMIN',
            new_value: req.body
        });

        res.json({ success: true, data: doctor });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// DELETE /api/doctors/:doctor_id
exports.deleteDoctor = async (req, res) => {
    try {
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

        res.json({ success: true, message: 'Doctor deleted and removed from slots' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
