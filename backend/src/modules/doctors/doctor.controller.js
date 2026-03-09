const Doctor = require('../../models/Doctor');
const DoctorAvailability = require('../../models/DoctorAvailability');
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

        // 1. Update DoctorAvailability
        await DoctorAvailability.updateMany(
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


// GET /api/doctors
exports.getDoctors = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { all } = req.query;
        const isAll = all === 'true' || all === true;
        const sessionDoctorId = getDoctorIdFromSession(req);

        // If 'all=true' is passed, we mostly want a full list (e.g. for selection dropdowns)
        // We only restrict to sessionDoctorId if the user IS a doctor AND they are NOT asking for 'all'
        const query = (sessionDoctorId && !isAll)
            ? { doctor_id: sessionDoctorId, ...(isAll ? {} : { is_active: true }) }
            : (isAll ? {} : { is_active: true });

        console.log(`[DEBUG] getDoctors: all=${all}, sessionDoctorId=${sessionDoctorId}, query=${JSON.stringify(query)}`);

        const doctors = await Doctor.find(query)
            .select('name doctor_id speciality is_active -_id')
            .sort({ name: 1 });

        console.log(`[DEBUG] getDoctors results: found ${doctors.length} doctors`);

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

// GET /api/doctors/:doctor_id/history
exports.getDoctorHistory = async (req, res) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { doctor_id } = req.params;
        const { days = 60 } = req.query;

        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const since = new Date();
        since.setDate(since.getDate() - parseInt(days));
        since.setHours(0, 0, 0, 0);

        const pipeline = [
            {
                $match: {
                    doctor_id,
                    appointment_date: { $gte: since },
                    is_deleted: { $ne: true }
                }
            },
            {
                $group: {
                    _id: '$appointment_date',
                    total_tokens: { $sum: 1 },
                    completed: { $sum: { $cond: [{ $in: ['$status', ['COMPLETED', 'completed']] }, 1, 0] } },
                    attended: { $sum: { $cond: [{ $in: ['$status', ['COMPLETED', 'completed', 'CONFIRMED', 'booked', 'BOOKED']] }, 1, 0] } },
                    no_show: { $sum: { $cond: [{ $eq: ['$token_status', 'NO_SHOW'] }, 1, 0] } },
                    cancelled: { $sum: { $cond: [{ $in: ['$status', ['CANCELLED', 'cancelled']] }, 1, 0] } },
                    online_tokens: { $sum: { $cond: [{ $eq: ['$token_pool', 'ONLINE'] }, 1, 0] } },
                    walkin_tokens: { $sum: { $cond: [{ $eq: ['$token_pool', 'WALK_IN'] }, 1, 0] } },
                    start_time: { $min: '$appointment_time' },
                    max_token: { $max: '$token_number' }
                }
            },
            { $sort: { _id: -1 } }
        ];

        const rows = await Appointment.aggregate(pipeline);

        const history = rows.map(r => {
            const completion_rate = r.total_tokens > 0
                ? Math.round((r.attended / r.total_tokens) * 100)
                : 0;
            return {
                date: r._id,
                day: new Date(r._id).toLocaleDateString('en-US', { weekday: 'long' }),
                total_tokens: r.total_tokens,
                completed: r.completed,
                attended: r.attended,
                no_show: r.no_show,
                cancelled: r.cancelled,
                online_tokens: r.online_tokens,
                walkin_tokens: r.walkin_tokens,
                start_time: r.start_time || '--',
                max_token: r.max_token,
                completion_rate
            };
        });

        const totalDays = history.length;
        const avgPatients = totalDays > 0
            ? Math.round(history.reduce((s, d) => s + d.total_tokens, 0) / totalDays)
            : 0;
        const bestDay = history.reduce((b, d) => (!b || d.total_tokens > b.total_tokens) ? d : b, null);

        res.json({
            success: true,
            doctor_name: doctor.name,
            summary: {
                total_days: totalDays,
                avg_patients_per_day: avgPatients,
                best_day: bestDay ? { date: bestDay.date, total_tokens: bestDay.total_tokens } : null
            },
            history
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
