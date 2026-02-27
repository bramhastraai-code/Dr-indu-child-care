const DoctorAvailability = require('../../models/DoctorAvailability');
const Doctor = require('../../models/Doctor');
const Appointment = require('../../models/Appointment');
const audit = require('../../utils/audit');
const { toMidnight } = require('../../utils/helpers');
const { handleDoctorLate, handleDoctorArrived } = require('../../services/doctorLateWorkflow');

// Helper: get or create today's availability record for a doctor
const getOrCreateAvailability = async (doctor_id, date) => {
    const queryDate = toMidnight(date || new Date());
    let doc = await Doctor.findOne({ doctor_id });
    if (!doc) return null;

    let avail = await DoctorAvailability.findOne({ doctor_id, date: queryDate });
    if (!avail) {
        avail = await DoctorAvailability.create({
            doctor_id,
            doctor_name: doc.name,
            date: queryDate,
            status: 'PRESENT',
            current_token: 0
        });
    }
    return avail;
};

// ── POST /api/doctor/availability/update ────────────────────────────
exports.updateAvailability = async (req, res) => {
    try {
        const {
            doctor_id, date, status,
            eta_minutes, eta_time, notes,
            check_in_time, check_out_time
        } = req.body || {};

        if (!doctor_id) return res.status(400).json({ success: false, message: 'doctor_id is required' });

        const queryDate = toMidnight(date || new Date());
        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        // Capture previous status for workflow decisions
        const prevRecord = await DoctorAvailability.findOne({ doctor_id, date: queryDate });
        const prevStatus = prevRecord?.status;

        const updateFields = {
            updated_at: new Date(),
            updated_by: req.user?.username || 'SECRETARY'
        };
        if (status) updateFields.status = status;
        if (eta_minutes !== undefined) updateFields.eta_minutes = eta_minutes;
        if (eta_time !== undefined) updateFields.eta_time = eta_time;
        if (notes !== undefined) updateFields.notes = notes;
        if (check_in_time !== undefined) updateFields.check_in_time = check_in_time ? new Date(check_in_time) : null;
        if (check_out_time !== undefined) updateFields.check_out_time = check_out_time ? new Date(check_out_time) : null;

        // Auto-set check_in_time when marking PRESENT
        if (status === 'PRESENT' && !check_in_time) updateFields.check_in_time = new Date();
        if (status === 'DONE' && !check_out_time) updateFields.check_out_time = new Date();
        // Record late arrival in late_checkins array
        const pushFields = {};
        if (status === 'LATE') {
            pushFields.late_checkins = {
                recorded_at: new Date(),
                eta_minutes: eta_minutes || null,
                eta_time: eta_time || null,
                reason: notes || null,
                recorded_by: req.user?.username || 'SECRETARY'
            };
        }

        const avail = await DoctorAvailability.findOneAndUpdate(
            { doctor_id, date: queryDate },
            {
                $set: updateFields,
                $setOnInsert: { doctor_name: doctor.name },
                ...(Object.keys(pushFields).length > 0 ? { $push: pushFields } : {})
            },
            { upsert: true, new: true }
        );

        await audit({
            event_type: 'DOCTOR_AVAILABILITY_UPDATED',
            entity_type: 'doctor_availability',
            entity_id: doctor_id,
            actor: req.user?.username || 'SECRETARY',
            actor_type: 'SECRETARY',
            new_value: updateFields
        });

        // ── WORKFLOW TRIGGERS ──────────────────────────────────────────
        let workflowResult = null;

        // LATE → shift appointments + queue running-late messages
        if (status === 'LATE' && eta_minutes) {
            try {
                workflowResult = await handleDoctorLate(
                    doctor_id, doctor.name,
                    parseInt(eta_minutes), eta_time
                );
            } catch (wErr) {
                console.error('[Workflow] handleDoctorLate error:', wErr.message);
            }
        }

        // PRESENT after LATE → queue "Doctor Arrived" messages
        if (status === 'PRESENT' && prevStatus === 'LATE') {
            try {
                workflowResult = await handleDoctorArrived(doctor_id, doctor.name);
            } catch (wErr) {
                console.error('[Workflow] handleDoctorArrived error:', wErr.message);
            }
        }

        res.json({
            success: true,
            data: avail,
            ...(workflowResult ? { workflow: workflowResult } : {})
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── GET /api/doctor/availability/:doctor_id ─────────────────────────
exports.getAvailability = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        const { date } = req.query;
        const queryDate = toMidnight(date || new Date());

        const avail = await getOrCreateAvailability(doctor_id, queryDate);
        if (!avail) return res.status(404).json({ success: false, message: 'Doctor not found' });

        // Count today's appointments for this doctor
        const [total, waiting, inProgress, completed] = await Promise.all([
            Appointment.countDocuments({ doctor_id, appointment_date: queryDate, is_deleted: false }),
            Appointment.countDocuments({ doctor_id, appointment_date: queryDate, token_status: 'WAITING' }),
            Appointment.countDocuments({ doctor_id, appointment_date: queryDate, token_status: 'IN_PROGRESS' }),
            Appointment.countDocuments({ doctor_id, appointment_date: queryDate, token_status: 'COMPLETED' })
        ]);

        res.json({
            success: true,
            data: {
                ...avail.toObject(),
                queue: { total, waiting, in_progress: inProgress, completed, skipped: total - waiting - inProgress - completed }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── PATCH /api/doctor/availability/:doctor_id/status ────────────────
exports.updateStatus = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        const { status, notes } = req.body || {};

        if (!status) return res.status(400).json({ success: false, message: 'status is required' });

        const queryDate = toMidnight(new Date());
        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const updateFields = {
            status,
            notes: notes || null,
            updated_at: new Date(),
            updated_by: req.user?.username || 'SECRETARY'
        };

        // Auto set check_in_time when status changes to PRESENT
        if (status === 'PRESENT') updateFields.check_in_time = new Date();
        if (status === 'DONE') updateFields.check_out_time = new Date();

        const avail = await DoctorAvailability.findOneAndUpdate(
            { doctor_id, date: queryDate },
            { $set: updateFields, $setOnInsert: { doctor_name: doctor.name } },
            { upsert: true, new: true }
        );

        res.json({ success: true, data: avail });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── PATCH /api/doctor/availability/:doctor_id/eta ───────────────────
exports.updateEta = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        const { eta_minutes, eta_time, reason } = req.body || {};

        const queryDate = toMidnight(new Date());
        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const avail = await DoctorAvailability.findOneAndUpdate(
            { doctor_id, date: queryDate },
            {
                $set: {
                    status: 'LATE',
                    eta_minutes: eta_minutes || null,
                    eta_time: eta_time || null,
                    updated_at: new Date(),
                    updated_by: req.user?.username || 'SECRETARY'
                },
                $setOnInsert: { doctor_name: doctor.name },
                $push: {
                    late_checkins: {
                        recorded_at: new Date(),
                        eta_minutes: eta_minutes || null,
                        eta_time: eta_time || null,
                        reason: reason || null,
                        recorded_by: req.user?.username || 'SECRETARY'
                    }
                }
            },
            { upsert: true, new: true }
        );

        res.json({ success: true, data: avail });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── POST /api/doctor/late-checkin ───────────────────────────────────
exports.recordLateCheckin = async (req, res) => {
    try {
        const { doctor_id, eta_minutes, eta_time, reason, date } = req.body || {};

        if (!doctor_id) return res.status(400).json({ success: false, message: 'doctor_id is required' });

        const queryDate = toMidnight(date || new Date());
        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const avail = await DoctorAvailability.findOneAndUpdate(
            { doctor_id, date: queryDate },
            {
                $set: {
                    status: 'LATE',
                    eta_minutes: eta_minutes || null,
                    eta_time: eta_time || null,
                    updated_at: new Date(),
                    updated_by: req.user?.username || 'SECRETARY'
                },
                $setOnInsert: { doctor_name: doctor.name },
                $push: {
                    late_checkins: {
                        recorded_at: new Date(),
                        eta_minutes: eta_minutes || null,
                        eta_time: eta_time || null,
                        reason: reason || null,
                        recorded_by: req.user?.username || 'SECRETARY'
                    }
                }
            },
            { upsert: true, new: true }
        );

        await audit({
            event_type: 'DOCTOR_LATE_CHECKIN',
            entity_type: 'doctor_availability',
            entity_id: doctor_id,
            actor: req.user?.username || 'SECRETARY',
            actor_type: 'SECRETARY',
            new_value: { eta_minutes, eta_time, reason }
        });

        res.status(201).json({ success: true, data: avail });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── GET /api/doctor/late-checkins/:doctor_id ────────────────────────
exports.getLateCheckins = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        const { date, days = 7 } = req.query;

        const endDate = toMidnight(date || new Date());
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - parseInt(days));

        const records = await DoctorAvailability.find({
            doctor_id,
            date: { $gte: startDate, $lte: endDate },
            'late_checkins.0': { $exists: true }   // has at least one late checkin
        }).select('date status eta_time late_checkins doctor_name').sort({ date: -1 });

        res.json({
            success: true,
            doctor_id,
            total: records.length,
            data: records
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── GET /api/doctor/availability-dashboard/:doctor_id ───────────────
exports.getAvailabilityDashboard = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        const { date } = req.query;
        const queryDate = toMidnight(date || new Date());

        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const avail = await getOrCreateAvailability(doctor_id, queryDate);

        // Get full token list for today
        const tokens = await Appointment.find({
            doctor_id,
            appointment_date: queryDate,
            token_number: { $ne: null },
            is_deleted: false
        }).sort({ token_number: 1 }).select('token_number token_status patient_id appointment_time check_in_time called_at').lean();

        const waiting = tokens.filter(t => t.token_status === 'WAITING');
        const inProgress = tokens.filter(t => t.token_status === 'IN_PROGRESS');
        const completed = tokens.filter(t => t.token_status === 'COMPLETED');
        const skipped = tokens.filter(t => t.token_status === 'SKIPPED');

        res.json({
            success: true,
            data: {
                doctor: {
                    doctor_id: doctor.doctor_id,
                    name: doctor.name,
                    speciality: doctor.speciality
                },
                availability: avail,
                queue_summary: {
                    total: tokens.length,
                    waiting: waiting.length,
                    in_progress: inProgress.length,
                    completed: completed.length,
                    skipped: skipped.length,
                    current_token: avail.current_token
                },
                tokens
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
