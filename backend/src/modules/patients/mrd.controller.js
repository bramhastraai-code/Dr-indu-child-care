const MRD = require('../../models/MRD');
const Appointment = require('../../models/Appointment');
const Patient = require('../../models/Patient');
const PrescriptionDeliveryLog = require('../../models/PrescriptionDeliveryLog');
const audit = require('../../utils/audit');
const {
    getDoctorIdFromSession,
    ensureDoctorSessionHasProfile,
    ensureDoctorMatches
} = require('../../utils/doctorScope');

const { triggerWebhook } = require('../../services/webhookService');

const ensureDoctorCanAccessPatient = async (req, res, patientId, message = 'Access denied for this patient profile') => {
    // Doctors can now access any patient MRD. Scoping is removed for viewing.
    return true;
};

const isRecordedBySessionDoctor = (req, entry) => {
    const username = String(req?.user?.username || '').trim().toLowerCase();
    const recordedBy = String(entry?.recorded_by || '').trim().toLowerCase();
    return Boolean(username && recordedBy && username === recordedBy);
};

const getEntryDoctorId = async (entry) => {
    if (entry?.attending_doctor_id) return String(entry.attending_doctor_id);

    if (entry?.appointment_id) {
        const appt = await Appointment.findOne({ appointment_id: entry.appointment_id }).select('doctor_id').lean();
        if (appt?.doctor_id) return String(appt.doctor_id);
    }

    return null;
};

const ensureDoctorCanAccessEntry = async (req, res, entry, message = 'You can only access MRD entries linked to your profile') => {
    const doctorId = getDoctorIdFromSession(req);
    if (!doctorId) return true;

    const entryDoctorId = await getEntryDoctorId(entry);
    if (entryDoctorId) {
        return ensureDoctorMatches(req, res, entryDoctorId, message);
    }

    if (isRecordedBySessionDoctor(req, entry)) return true;

    res.status(403).json({
        success: false,
        error_code: 'DOCTOR_SCOPE_FORBIDDEN',
        message
    });
    return false;
};

const scopeEntriesForDoctor = async (req, entries = []) => {
    // Doctors can now see all entries in the MRD. Scoping is removed for viewing.
    return entries;
};

// @desc    Get full MRD
// @route   GET /api/mrd/:patient_id
exports.getMRDByPatientId = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;
        if (!await ensureDoctorCanAccessPatient(req, res, req.params.patient_id, 'You can only view MRD for patients linked to your profile')) return;

        const [mrd, appointments] = await Promise.all([
            MRD.findOne({ patient_id: req.params.patient_id }).lean(),
            Appointment.find({ patient_id: req.params.patient_id, is_deleted: false }).sort({ appointment_date: -1 }).lean()
        ]);

        if (!mrd) return res.status(404).json({ success: false, message: 'MRD not found' });

        const scopedEntries = await scopeEntriesForDoctor(req, mrd.entries || []);

        // Create a 'datewise' unified timeline
        const groupedByDate = {};
        const getDateKey = (date) => {
            try { return new Date(date).toISOString().split('T')[0]; }
            catch (e) { return 'unknown'; }
        };

        scopedEntries.forEach(e => {
            const key = getDateKey(e.visit_date);
            if (!groupedByDate[key]) groupedByDate[key] = { date: key, appointments: [], mrd_entries: [] };
            groupedByDate[key].mrd_entries.push(e);
        });

        appointments.forEach(a => {
            const key = getDateKey(a.appointment_date);
            if (!groupedByDate[key]) groupedByDate[key] = { date: key, appointments: [], mrd_entries: [] };
            groupedByDate[key].appointments.push(a);
        });

        const timeline = Object.keys(groupedByDate)
            .sort((a, b) => new Date(b) - new Date(a))
            .map(date => groupedByDate[date]);

        // Derive vaccination history
        const vaccination_history = scopedEntries
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
                entries: scopedEntries.sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date)),
                vaccination_history,
                appointments,
                timeline // Unified datewise view
            }
        });
    } catch (err) {
        next(err);
    }
};

// @desc    Add clinical entry
// @route   POST /api/mrd/entry
exports.addMRDEntry = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

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
            advice,
            investigations,
            next_visit_due,
            vaccine_given,
            vaccine_batch,
            recorded_by,
            weight,
            height,
            temperature,
            spo2,
            pulse,
            head_circumference,
            symptoms,
            attachments
        } = req.body || {};

        if (!patient_id) {
            return res.status(400).json({ success: false, message: 'patient_id is required' });
        }

        const finalRecordedBy = recorded_by || req.user?.username || 'DOCTOR';
        const sessionDoctorId = getDoctorIdFromSession(req);

        // 1. Validate Appointment if provided
        let appointment = null;
        if (appointment_id) {
            appointment = await Appointment.findOne({ appointment_id });
            if (!appointment) {
                return res.status(404).json({ success: false, message: 'Appointment not found' });
            }
            if (!ensureDoctorMatches(req, res, appointment.doctor_id, 'You can only add MRD entries for your own appointments')) return;
            if (appointment.patient_id !== patient_id) {
                return res.status(400).json({ success: false, message: 'Appointment does not belong to this patient' });
            }

            // 2. Check if entry already exists for this appointment
            const existingEntry = await MRD.findOne({
                patient_id,
                'entries.appointment_id': appointment_id
            });
            if (existingEntry) {
                return res.status(409).json({ success: false, message: 'MRD entry already exists for this appointment' });
            }
        } else if (!await ensureDoctorCanAccessPatient(req, res, patient_id, 'You can only add MRD entries for patients linked to your profile')) {
            return;
        }

        let mrd = await MRD.findOne({ patient_id });
        if (!mrd) mrd = await MRD.create({ patient_id, entries: [] });

        const newEntry = {
            appointment_id: appointment_id || null,
            visit_date: visit_date ? new Date(visit_date) : (appointment ? appointment.appointment_date : new Date()),
            visit_type: visit_type || (appointment ? appointment.visit_type : 'CONSULTATION'),
            attending_doctor: attending_doctor || (appointment ? (appointment.doctor_name || appointment.assigned_doctor_name) : null),
            attending_doctor_id: appointment?.doctor_id || sessionDoctorId || null,
            chief_complaint,
            clinical_notes,
            diagnosis,
            prescription,
            advice,
            investigations,
            next_visit_due: next_visit_due ? new Date(next_visit_due) : null,
            vaccine_given,
            vaccine_batch,
            recorded_by: finalRecordedBy,
            recorded_at: new Date(),
            weight,
            height,
            temperature,
            spo2,
            pulse,
            head_circumference,
            symptoms: Array.isArray(symptoms) ? symptoms : [],
            attachments: Array.isArray(attachments) ? attachments : []
        };

        mrd.entries.unshift(newEntry);
        await mrd.save();

        if (appointment_id) {
            await Appointment.findOneAndUpdate(
                { appointment_id },
                { status: 'COMPLETED', last_updated_by: finalRecordedBy, last_updated_at: new Date() }
            );
        }

        await audit({
            event_type: 'MRD_ENTRY_CREATED',
            entity_type: 'mrd',
            entity_id: patient_id,
            actor: finalRecordedBy,
            actor_type: req.user ? req.user.role : 'DOCTOR'
        });

        res.json({ success: true, data: mrd });
    } catch (err) {
        next(err);
    }
};

// @desc    Get MRD entry by appointment ID
// @route   GET /api/mrd/appointment/:appointment_id
exports.getEntryByAppointment = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { appointment_id } = req.params;
        const appointment = await Appointment.findOne({ appointment_id }).select('doctor_id');
        if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });
        if (!ensureDoctorMatches(req, res, appointment.doctor_id, 'You can only view MRD entries for your own appointments')) return;

        const mrd = await MRD.findOne({ 'entries.appointment_id': appointment_id });

        if (!mrd) {
            return res.status(404).json({ success: false, message: 'No MRD entry found for this appointment' });
        }

        const entry = mrd.entries.find(e => e.appointment_id === appointment_id);
        res.json({ success: true, data: entry, patient_id: mrd.patient_id });
    } catch (err) {
        next(err);
    }
};

// @desc    Update entry
// @route   PATCH /api/mrd/entry/:id
exports.updateMRDEntry = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { id } = req.params;
        const mrd = await MRD.findOne({ 'entries._id': id });
        if (!mrd) return res.status(404).json({ success: false, message: 'Entry not found' });
        if (!await ensureDoctorCanAccessPatient(req, res, mrd.patient_id, 'You can only edit MRD entries for patients linked to your profile')) return;

        const entry = mrd.entries.id(id);
        if (entry.is_locked) return res.status(403).json({ success: false, message: 'Entry is locked' });
        if (!await ensureDoctorCanAccessEntry(req, res, entry, 'You can only edit MRD entries linked to your profile')) return;

        const body = req.body || {};
        const actor = req.user ? req.user.username : (body.recorded_by || 'DOCTOR');

        // Update fields if present
        const updateable = [
            'diagnosis', 'prescription', 'advice', 'clinical_notes',
            'chief_complaint', 'investigations', 'next_visit_due',
            'vaccine_given', 'vaccine_batch',
            'weight', 'height', 'temperature', 'spo2', 'pulse', 'head_circumference', 'symptoms', 'attachments'
        ];

        updateable.forEach(f => {
            if (body[f] !== undefined) entry[f] = body[f];
        });

        entry.last_edited_by = actor;
        entry.last_edited_at = new Date();

        await mrd.save();

        await audit({
            event_type: 'MRD_ENTRY_EDITED',
            entity_type: 'mrd',
            entity_id: mrd.patient_id,
            actor,
            actor_type: req.user ? req.user.role : 'DOCTOR'
        });

        res.json({ success: true, data: entry });
    } catch (err) {
        next(err);
    }
};

// @desc    Export structured data
// @route   GET /api/mrd/:patient_id/export
exports.exportMRD = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { patient_id } = req.params;
        if (!await ensureDoctorCanAccessPatient(req, res, patient_id, 'You can only export MRD for patients linked to your profile')) return;

        const [mrd, patient, appointments] = await Promise.all([
            MRD.findOne({ patient_id }).lean(),
            Patient.findOne({ patient_id }).lean(),
            Appointment.find({ patient_id, is_deleted: false }).sort({ appointment_date: -1 }).lean()
        ]);

        if (!mrd || !patient) return res.status(404).json({ success: false, message: 'Not found' });

        const scopedEntries = await scopeEntriesForDoctor(req, mrd.entries || []);

        const vaccination_history = scopedEntries
            .filter(e => e.visit_type === 'VACCINATION')
            .map(e => ({ vaccine: e.vaccine_given, date: e.visit_date }));

        res.json({
            success: true,
            data: {
                patient: {
                    patient_id: patient.patient_id,
                    child_name: patient.child_name || (patient.first_name ? [patient.first_name, patient.last_name].filter(Boolean).join(' ') : 'Unknown'),
                    full_name: patient.full_name,
                    parent_name: patient.parent_name || patient.father_name || patient.mother_name,
                    mobile: patient.wa_id,
                    parent_mobile: patient.wa_id,
                    dob: patient.dob,
                    age: patient.age_years ? `${patient.age_years}y ${patient.age_months}m` : null
                },
                mrd_entries: scopedEntries.sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date)),
                vaccination_history,
                appointment_history: appointments
            }
        });
    } catch (err) {
        next(err);
    }
};

// @desc    Update MRD entry by MRD document id
// @route   PUT /api/mrd/:mrd_id
exports.updateMRDById = async (req, res) => {
    // Alias: delegate to updateMRDEntry by treating mrd_id as entry._id
    req.params.id = req.params.mrd_id;
    return exports.updateMRDEntry(req, res);
};

// @desc    Add vaccination record
// @route   POST /api/mrd/vaccination
exports.addVaccinationRecord = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const {
            patient_id,
            vaccine_name,
            vaccine_date,
            dose_number,
            administered_by,
            batch_number,
            next_due_date,
            site
        } = req.body || {};

        if (!patient_id || !vaccine_name) {
            return res.status(400).json({ success: false, message: 'patient_id and vaccine_name are required' });
        }
        if (!await ensureDoctorCanAccessPatient(req, res, patient_id, 'You can only add vaccination records for patients linked to your profile')) return;

        let mrd = await MRD.findOne({ patient_id });
        if (!mrd) mrd = await MRD.create({ patient_id, entries: [] });

        const vaccinationEntry = {
            visit_type: 'VACCINATION',
            visit_date: vaccine_date ? new Date(vaccine_date) : new Date(),
            vaccine_given: vaccine_name,
            vaccine_batch: batch_number || null,
            attending_doctor: administered_by || null,
            attending_doctor_id: getDoctorIdFromSession(req) || null,
            recorded_by: req.user?.username || administered_by || 'DOCTOR',
            recorded_at: new Date(),
            // Store extra vaccination details in clinical_notes
            clinical_notes: JSON.stringify({
                dose_number: dose_number || 1,
                next_due_date: next_due_date || null,
                site: site || null
            })
        };

        mrd.entries.unshift(vaccinationEntry);
        await mrd.save();

        await audit({
            event_type: 'VACCINATION_RECORDED',
            entity_type: 'mrd',
            entity_id: patient_id,
            actor: req.user?.username || 'DOCTOR',
            actor_type: req.user ? req.user.role : 'DOCTOR',
            new_value: { vaccine_name, vaccine_date, dose_number }
        });

        res.status(201).json({ success: true, message: 'Vaccination record added' });
    } catch (err) {
        next(err);
    }
};

// @desc    Lock MRD entry
// @route   PATCH /api/mrd/entry/:id/lock
exports.lockMRDEntry = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { id } = req.params;
        const mrd = await MRD.findOne({ 'entries._id': id });
        if (!mrd) return res.status(404).json({ success: false, message: 'Entry not found' });
        if (!await ensureDoctorCanAccessPatient(req, res, mrd.patient_id, 'You can only lock MRD entries for patients linked to your profile')) return;

        const entry = mrd.entries.id(id);
        if (!await ensureDoctorCanAccessEntry(req, res, entry, 'You can only lock MRD entries linked to your profile')) return;
        entry.is_locked = true;
        await mrd.save();

        await audit({
            event_type: 'MRD_ENTRY_LOCKED',
            entity_type: 'mrd',
            entity_id: mrd.patient_id,
            actor: req.user ? req.user.username : 'DOCTOR'
        });

        res.json({ success: true, message: 'Entry locked successfully' });
    } catch (err) {
        next(err);
    }
};

// @desc    Upload attachment to MRD entry
// @route   POST /api/mrd/entry/:id/attachment
exports.uploadMRDAttachment = async (req, res, next) => {
    try {
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const { id } = req.params;
        const { url, name, file_type, attachments } = req.body || {};

        const mrd = await MRD.findOne({ 'entries._id': id });
        if (!mrd) return res.status(404).json({ success: false, message: 'Entry not found' });
        if (!await ensureDoctorCanAccessPatient(req, res, mrd.patient_id, 'You can only upload attachments for patients linked to your profile')) return;

        const entry = mrd.entries.id(id);
        if (!await ensureDoctorCanAccessEntry(req, res, entry, 'You can only upload attachments for MRD entries linked to your profile')) return;
        if (entry.is_locked) return res.status(403).json({ success: false, message: 'Entry is locked' });

        // Handle multiple attachments
        if (Array.isArray(attachments) && attachments.length > 0) {
            attachments.forEach(att => {
                if (att.url) {
                    entry.attachments.push({
                        url: att.url,
                        name: att.name || 'attachment',
                        file_type: att.file_type || 'image/jpeg',
                        uploaded_at: new Date()
                    });
                }
            });
        }
        // Handle single attachment
        else if (url) {
            entry.attachments.push({
                url,
                name: name || 'attachment',
                file_type: file_type || 'image/jpeg',
                uploaded_at: new Date()
            });
        } else {
            return res.status(400).json({ success: false, message: 'No attachments provided. Use url or attachments array.' });
        }

        await mrd.save();
        res.json({ success: true, message: 'Attachments uploaded successfully', data: entry.attachments });
    } catch (err) {
        next(err);
    }
};

// @desc    Send prescription via WhatsApp
// @route   POST /api/mrd/entry/:id/send-whatsapp
exports.sendPrescriptionViaWhatsApp = async (req, res, next) => {
    try {
        const { id } = req.params;
        const mrd = await MRD.findOne({ 'entries._id': id });
        if (!mrd) return res.status(404).json({ success: false, message: 'Entry not found' });

        const entry = mrd.entries.id(id);
        const patient = await Patient.findOne({ patient_id: mrd.patient_id }).lean();

        if (!patient || !patient.wa_id) {
            return res.status(400).json({ success: false, message: 'Patient or WhatsApp ID not found' });
        }

        if (!entry.prescription && !entry.advice) {
            return res.status(400).json({ success: false, message: 'No prescription or advice found to send' });
        }

        // Format prescription for message
        const prescriptionText = entry.prescription ? `*Prescription:*\n${entry.prescription}` : '';
        const adviceText = entry.advice ? `*Advice:*\n${entry.advice}` : '';
        const visitDate = new Date(entry.visit_date).toLocaleDateString();

        const fullMessage = `Hi ${patient.parent_name || 'Parent'},\nPrescription for *${patient.child_name}* (Visit: ${visitDate}):\n\n${prescriptionText}\n\n${adviceText}\n\nRegards,\nDr. Indu's Child Care`;

        // Send prescription via n8n webhook
        await triggerWebhook('appointment', {
            event_type: 'PRESCRIPTION_DELIVERY',
            patient_id: mrd.patient_id,
            parent_name: patient.parent_name || 'Parent',
            child_name: patient.child_name,
            date: visitDate,
            wa_id: patient.wa_id,
            message: fullMessage
        });

        await audit({
            event_type: 'PRESCRIPTION_SENT_WA',
            entity_type: 'mrd',
            entity_id: mrd.patient_id,
            actor: req.user?.username || 'SYSTEM',
            actor_type: req.user ? req.user.role : 'SYSTEM'
        });

        await PrescriptionDeliveryLog.create({
            prescription_id: entry._id,
            patient_id: mrd.patient_id,
            sent_by: req.user?.username || 'SYSTEM',
            sent_at: new Date(),
            delivery_status: 'sent',
            whatsapp_number: patient.wa_id
        });

        res.json({ success: true, message: 'Prescription sent via n8n webhook' });
    } catch (err) {
        next(err);
    }
};
