const Doctor = require('../../models/Doctor');
const audit = require('../../utils/audit');

const generateDoctorId = async () => {
    const prefix = 'DOC-';
    const last = await Doctor.findOne({ doctor_id: { $regex: `^${prefix}` } })
        .sort({ doctor_id: -1 });
    const seq = last ? parseInt(last.doctor_id.replace(prefix, ''), 10) + 1 : 1;
    return `${prefix}${seq.toString().padStart(5, '0')}`;
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
exports.createDoctor = async (req, res) => {
    try {
        const doctor_id = await generateDoctorId();
        const doctor = await Doctor.create({
            ...req.body,
            doctor_id
        });

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
        res.status(500).json({ success: false, error: err.message });
    }
};

// PATCH /api/doctors/:doctor_id
exports.updateDoctor = async (req, res) => {
    try {
        const doctor = await Doctor.findOneAndUpdate(
            { doctor_id: req.params.doctor_id },
            { $set: req.body },
            { new: true }
        );
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

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
        const doctor = await Doctor.findOneAndDelete({ doctor_id: req.params.doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        await audit({
            event_type: 'DOCTOR_DELETED',
            entity_type: 'doctor',
            entity_id: req.params.doctor_id,
            actor: req.user?.username || 'ADMIN',
            actor_type: 'ADMIN',
            new_value: { deleted: true }
        });

        res.json({ success: true, message: 'Doctor deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
