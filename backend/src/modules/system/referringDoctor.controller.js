const ReferringDoctor = require('../../models/ReferringDoctor');
const Patient = require('../../models/Patient');
const audit = require('../../utils/audit');

const generateReferringDoctorId = async () => {
    const prefix = 'REF-';
    const last = await ReferringDoctor.findOne({ doctor_id: { $regex: `^${prefix}` } })
        .sort({ doctor_id: -1 });
    const seq = last ? parseInt(last.doctor_id.replace(prefix, ''), 10) + 1 : 1;
    return `${prefix}${seq.toString().padStart(5, '0')}`;
};

// GET /api/referring-doctors
exports.getReferringDoctors = async (req, res) => {
    try {
        const { all } = req.query;
        const query = all === 'true' ? {} : { is_active: true };
        const doctors = await ReferringDoctor.find(query).sort({ name: 1 });
        res.json({ success: true, count: doctors.length, data: doctors });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// GET /api/referring-doctors/:id
exports.getReferringDoctorById = async (req, res) => {
    try {
        const doctor = await ReferringDoctor.findOne({ doctor_id: req.params.id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Referring doctor not found' });
        res.json({ success: true, data: doctor });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// POST /api/referring-doctors
exports.createReferringDoctor = async (req, res) => {
    try {
        const doctor_id = await generateReferringDoctorId();
        const doctor = await ReferringDoctor.create({ ...req.body, doctor_id });

        await audit({
            event_type: 'REFERRING_DOCTOR_CREATED',
            entity_type: 'referring_doctor',
            entity_id: doctor_id,
            actor: req.user?.username || 'ADMIN',
            actor_type: 'ADMIN',
            new_value: doctor
        });

        res.status(201).json({ success: true, data: doctor });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Doctor ID already exists' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
};

// PATCH /api/referring-doctors/:id
exports.updateReferringDoctor = async (req, res) => {
    try {
        const doctor = await ReferringDoctor.findOneAndUpdate(
            { doctor_id: req.params.id },
            req.body,
            { new: true, runValidators: true }
        );
        if (!doctor) return res.status(404).json({ success: false, message: 'Referring doctor not found' });

        await audit({
            event_type: 'REFERRING_DOCTOR_UPDATED',
            entity_type: 'referring_doctor',
            entity_id: req.params.id,
            actor: req.user?.username || 'ADMIN',
            actor_type: 'ADMIN',
            new_value: req.body
        });

        res.json({ success: true, data: doctor });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// DELETE /api/referring-doctors/:id
exports.deleteReferringDoctor = async (req, res) => {
    try {
        const doctor = await ReferringDoctor.findOneAndDelete({ doctor_id: req.params.id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Referring doctor not found' });

        await audit({
            event_type: 'REFERRING_DOCTOR_DELETED',
            entity_type: 'referring_doctor',
            entity_id: req.params.id,
            actor: req.user?.username || 'ADMIN',
            actor_type: 'ADMIN',
            new_value: { deleted: true }
        });

        res.json({ success: true, message: 'Referring doctor deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// GET /api/referring-doctors/:id/report
exports.getReferralReport = async (req, res) => {
    try {
        const doctor = await ReferringDoctor.findOne({ doctor_id: req.params.id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Referring doctor not found' });

        // Find all patients referred by this doctor
        // We look for name or doctor_id in the referred_by field
        const patients = await Patient.find({
            $or: [
                { referred_by: doctor.name },
                { referred_by: doctor.doctor_id }
            ]
        }).select('first_name last_name child_name patient_id registration_date registration_source');

        res.json({
            success: true,
            data: {
                doctor,
                referral_count: patients.length,
                patients
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
