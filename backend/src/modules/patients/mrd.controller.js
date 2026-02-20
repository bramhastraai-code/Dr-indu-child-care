const MRD = require('../../models/MRD');
const Appointment = require('../../models/Appointment');
const Patient = require('../../models/Patient');
const audit = require('../../utils/audit');

// @desc    Get full MRD
// @route   GET /api/mrd/:patient_id
exports.getMRDByPatientId = async (req, res) => {
    try {
        const mrd = await MRD.findOne({ patient_id: req.params.patient_id }).lean();
        if (!mrd) return res.status(404).json({ success: false, message: 'MRD not found' });

        // Derive vaccination history
        const vaccination_history = mrd.entries
            .filter(e => e.visit_type === 'VACCINATION')
            .map(e => ({
                vaccine_name: e.vaccine_given,
                batch: e.vaccine_batch,
                date: e.visit_date,
                appointment_id: e.appointment_id
            }));

        res.json({
            success: true,
            data: {
                ...mrd,
                entries: mrd.entries.sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date)),
                vaccination_history
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Add clinical entry
// @route   POST /api/mrd/entry
exports.addMRDEntry = async (req, res) => {
    try {
        const {
            patient_id,
            appointment_id,
            visit_date,
            visit_type,
            attending_doctor,
            chief_complaint,
            clinical_notes,
            diagnosis,
            prescription,
            investigations,
            next_visit_due,
            vaccine_given,
            vaccine_batch,
            recorded_by
        } = req.body;

        if (!patient_id || !recorded_by) {
            return res.status(400).json({ success: false, message: 'patient_id and recorded_by are required' });
        }

        let mrd = await MRD.findOne({ patient_id });
        if (!mrd) mrd = await MRD.create({ patient_id, entries: [] });

        const newEntry = {
            appointment_id: appointment_id || null,
            visit_date: visit_date ? new Date(visit_date) : new Date(),
            visit_type: visit_type || 'CONSULTATION',
            attending_doctor,
            chief_complaint,
            clinical_notes,
            diagnosis,
            prescription,
            investigations,
            next_visit_due: next_visit_due ? new Date(next_visit_due) : null,
            vaccine_given,
            vaccine_batch,
            recorded_by,
            recorded_at: new Date()
        };

        mrd.entries.unshift(newEntry);
        await mrd.save();

        if (appointment_id) {
            await Appointment.findOneAndUpdate(
                { appointment_id },
                { status: 'COMPLETED', last_updated_by: recorded_by, last_updated_at: new Date() }
            );
        }

        await audit({
            event_type: 'MRD_ENTRY_CREATED',
            entity_type: 'mrd',
            entity_id: patient_id,
            actor: recorded_by,
            actor_type: req.admin ? req.admin.role : 'DOCTOR'
        });

        res.json({ success: true, data: mrd });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Update entry
// @route   PATCH /api/mrd/entry/:id
exports.updateMRDEntry = async (req, res) => {
    try {
        const { id } = req.params;
        const mrd = await MRD.findOne({ 'entries._id': id });
        if (!mrd) return res.status(404).json({ success: false, message: 'Entry not found' });

        const entry = mrd.entries.id(id);
        if (entry.is_locked) return res.status(403).json({ success: false, message: 'Entry is locked' });

        const actor = req.admin ? req.admin.username : (req.body.recorded_by || 'DOCTOR');

        // Update fields if present
        const updateable = [
            'diagnosis', 'prescription', 'clinical_notes',
            'chief_complaint', 'investigations', 'next_visit_due',
            'vaccine_given', 'vaccine_batch'
        ];

        updateable.forEach(f => {
            if (req.body[f] !== undefined) entry[f] = req.body[f];
        });

        entry.last_edited_by = actor;
        entry.last_edited_at = new Date();

        await mrd.save();

        await audit({
            event_type: 'MRD_ENTRY_EDITED',
            entity_type: 'mrd',
            entity_id: mrd.patient_id,
            actor,
            actor_type: req.admin ? req.admin.role : 'DOCTOR'
        });

        res.json({ success: true, data: entry });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Export structured data
// @route   GET /api/mrd/:patient_id/export
exports.exportMRD = async (req, res) => {
    try {
        const { patient_id } = req.params;
        const [mrd, patient] = await Promise.all([
            MRD.findOne({ patient_id }).lean(),
            Patient.findOne({ patient_id }).lean()
        ]);

        if (!mrd || !patient) return res.status(404).json({ success: false, message: 'Not found' });

        const vaccination_history = mrd.entries
            .filter(e => e.visit_type === 'VACCINATION')
            .map(e => ({ vaccine: e.vaccine_given, date: e.visit_date }));

        res.json({
            success: true,
            data: {
                patient: {
                    patient_id: patient.patient_id,
                    child_name: patient.child_name,
                    parent_name: patient.parent_name,
                    parent_mobile: patient.parent_mobile,
                    dob: patient.dob
                },
                mrd_entries: mrd.entries.sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date)),
                vaccination_history
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
