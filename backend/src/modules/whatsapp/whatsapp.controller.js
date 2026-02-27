/**
 * WhatsApp Controller
 * No WATI integration — builds messages, stores in queue, returns output.
 * n8n or any external service can poll /api/whatsapp/messages/pending to send them.
 */
const WhatsAppMessageQueue = require('../../models/WhatsAppMessageQueue');
const Appointment = require('../../models/Appointment');
const Patient = require('../../models/Patient');
const { queueMessage, newBatchId, TEMPLATES } = require('../../services/messageQueueService');
const { to12h, friendlyDate, addMinutesToTime } = require('../../services/doctorLateWorkflow');
const { decrypt } = require('../../utils/encryption');

// Helper: resolve wa_id from patient
const getWaId = (patient) => {
    try { return decrypt(patient.wa_id); } catch { return patient.wa_id; }
};

// ── POST /api/whatsapp/doctor/late-alert ─────────────────────────────
exports.doctorLateAlert = async (req, res) => {
    try {
        const {
            doctor_id, doctor_name, status,
            minutes_late, expected_arrival_time,
            affected_appointments = [],
            clinic_address, clinic_name
        } = req.body || {};

        if (!doctor_name || !minutes_late) {
            return res.status(400).json({ success: false, message: 'doctor_name and minutes_late are required' });
        }

        const batchId = newBatchId();
        const messages = [];

        // If affected_appointments provided in body, use them directly
        const apptList = affected_appointments.length > 0
            ? affected_appointments
            : [];

        for (const appt of apptList) {
            const vars = {
                parent_name: appt.parent_name || 'Parent',
                child_name: appt.child_name || 'Your child',
                doctor_name: doctor_name,
                minutes: minutes_late,
                date: appt.date || new Date().toLocaleDateString('en-IN'),
                original_time: appt.original_time || '—',
                new_time: appt.new_time || expected_arrival_time || '—',
                token: appt.new_token || appt.token || appt.appointment_id,
                clinic_name: clinic_name || process.env.CLINIC_NAME || 'Dr. Indu Child Care Clinic',
                clinic_address: clinic_address || process.env.CLINIC_ADDRESS || 'Dr. Indu Child Care Clinic'
            };

            const waId = String(appt.parent_wa_id || '').replace(/\D/g, '');
            if (!waId) continue;

            const qEntry = await queueMessage(waId, 'DOCTOR_RUNNING_LATE', vars, {
                batchId,
                relatedEntity: { entity_type: 'appointment', entity_id: appt.appointment_id }
            });

            messages.push({
                wa_id: waId,
                parent_name: appt.parent_name,
                message_id: qEntry.queue_id,
                message_text: qEntry.message_text,
                status: 'queued',
                timestamp: new Date()
            });
        }

        res.json({
            success: true,
            data: {
                batch_id: batchId,
                doctor_name,
                total_messages: messages.length,
                queued: messages.length,
                sent_at: new Date(),
                messages
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── POST /api/whatsapp/doctor/arrived-alert ──────────────────────────
exports.doctorArrivedAlert = async (req, res) => {
    try {
        const {
            doctor_id, doctor_name,
            rescheduled_appointments = [],
            clinic_address, clinic_name
        } = req.body || {};

        if (!doctor_name) {
            return res.status(400).json({ success: false, message: 'doctor_name is required' });
        }

        const batchId = newBatchId();
        const messages = [];

        for (const appt of rescheduled_appointments) {
            const waId = String(appt.parent_wa_id || '').replace(/\D/g, '');
            if (!waId) continue;

            const vars = {
                parent_name: appt.parent_name || 'Parent',
                doctor_name,
                token: appt.token || appt.appointment_id,
                appointment_time: appt.appointment_time || '—',
                clinic_name: clinic_name || process.env.CLINIC_NAME || 'Dr. Indu Child Care Clinic',
                clinic_address: clinic_address || process.env.CLINIC_ADDRESS || 'Dr. Indu Child Care Clinic'
            };

            const qEntry = await queueMessage(waId, 'DOCTOR_ARRIVED', vars, {
                batchId,
                relatedEntity: { entity_type: 'appointment', entity_id: appt.appointment_id }
            });

            messages.push({
                wa_id: waId,
                parent_name: appt.parent_name,
                message_id: qEntry.queue_id,
                message_text: qEntry.message_text,
                status: 'queued',
                timestamp: new Date()
            });
        }

        res.json({
            success: true,
            data: {
                batch_id: batchId,
                doctor_name,
                total_messages: messages.length,
                queued: messages.length,
                sent_at: new Date(),
                messages
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── POST /api/whatsapp/appointment/reschedule-notification ───────────
exports.rescheduleNotification = async (req, res) => {
    try {
        const {
            appointment_id, patient_id, parent_wa_id,
            parent_name, child_name, doctor_name,
            original_date, original_time, new_date, new_time, new_token,
            clinic_address, reason
        } = req.body || {};

        if (!parent_wa_id || !doctor_name) {
            return res.status(400).json({ success: false, message: 'parent_wa_id and doctor_name are required' });
        }

        const waId = String(parent_wa_id).replace(/\D/g, '');
        const vars = {
            parent_name: parent_name || 'Parent',
            child_name: child_name || 'Your child',
            doctor_name,
            date: new_date || original_date || new Date().toLocaleDateString('en-IN'),
            original_time: original_time || '—',
            new_time: new_time || '—',
            token: new_token || appointment_id,
            clinic_address: clinic_address || process.env.CLINIC_ADDRESS || 'Dr. Indu Child Care Clinic'
        };

        const qEntry = await queueMessage(waId, 'APPOINTMENT_RESCHEDULED', vars, {
            relatedEntity: { entity_type: 'appointment', entity_id: appointment_id }
        });

        res.status(201).json({
            success: true,
            data: {
                message_id: qEntry.queue_id,
                wa_id: waId,
                status: 'queued',
                message_text: qEntry.message_text,
                timestamp: new Date()
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── POST /api/whatsapp/token/call-reminder ───────────────────────────
exports.tokenCallReminder = async (req, res) => {
    try {
        const {
            token_number, appointment_id, patient_id,
            parent_wa_id, parent_name, child_name,
            appointment_time, clinic_name, queue_position
        } = req.body || {};

        if (!parent_wa_id) {
            return res.status(400).json({ success: false, message: 'parent_wa_id is required' });
        }

        const waId = String(parent_wa_id).replace(/\D/g, '');
        const vars = {
            parent_name: parent_name || 'Parent',
            child_name: child_name || 'Your child',
            token: token_number || appointment_id,
            appointment_time: appointment_time || '—',
            clinic_name: clinic_name || process.env.CLINIC_NAME || 'Dr. Indu Child Care Clinic'
        };

        const qEntry = await queueMessage(waId, 'TOKEN_CALL_REMINDER', vars, {
            relatedEntity: { entity_type: 'appointment', entity_id: appointment_id }
        });

        res.status(201).json({
            success: true,
            data: {
                message_id: qEntry.queue_id,
                wa_id: waId,
                token: token_number,
                status: 'queued',
                message_text: qEntry.message_text,
                timestamp: new Date()
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── POST /api/whatsapp/appointment/completion-notice ─────────────────
exports.completionNotice = async (req, res) => {
    try {
        const {
            appointment_id, patient_id, parent_wa_id,
            parent_name, child_name, doctor_name,
            date, duration_minutes, token,
            notes_from_doctor, next_appointment, next_token
        } = req.body || {};

        if (!parent_wa_id || !doctor_name) {
            return res.status(400).json({ success: false, message: 'parent_wa_id and doctor_name are required' });
        }

        const waId = String(parent_wa_id).replace(/\D/g, '');
        const vars = {
            parent_name: parent_name || 'Parent',
            child_name: child_name || 'Your child',
            doctor_name,
            date: date || new Date().toLocaleDateString('en-IN'),
            duration: duration_minutes || '—',
            token: token || appointment_id,
            notes_from_doctor: notes_from_doctor || 'Follow doctor\'s instructions.',
            next_appointment_date: next_appointment || null,
            next_token: next_token || null
        };

        const qEntry = await queueMessage(waId, 'APPOINTMENT_COMPLETED', vars, {
            relatedEntity: { entity_type: 'appointment', entity_id: appointment_id }
        });

        res.status(201).json({
            success: true,
            data: {
                message_id: qEntry.queue_id,
                wa_id: waId,
                status: 'queued',
                message_text: qEntry.message_text,
                timestamp: new Date()
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── GET /api/whatsapp/messages/status/:message_id ────────────────────
exports.getMessageStatus = async (req, res) => {
    try {
        const { message_id } = req.params;
        const msg = await WhatsAppMessageQueue.findOne({
            $or: [{ queue_id: message_id }, { message_id }]
        }).lean();

        if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

        res.json({
            success: true,
            data: {
                message_id: msg.queue_id,
                wa_id: msg.wa_id,
                status: msg.status,
                message_type: msg.message_type,
                message_text: msg.message_text,
                status_updated_at: msg.sent_at || msg.created_at,
                delivered_at: msg.delivered_at || null,
                read_at: msg.read_at || null,
                retry_count: msg.retry_count,
                failed_reason: msg.failed_reason || null
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── GET /api/whatsapp/messages/batch/:batch_id ───────────────────────
exports.getBatchStatus = async (req, res) => {
    try {
        const { batch_id } = req.params;
        const messages = await WhatsAppMessageQueue.find({ batch_id }).lean();

        if (messages.length === 0) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }

        const counts = { queued: 0, sent: 0, delivered: 0, failed: 0, retry: 0 };
        messages.forEach(m => {
            const s = (m.status || 'queued').toLowerCase();
            if (counts[s] !== undefined) counts[s]++;
            else counts.queued++;
        });

        res.json({
            success: true,
            data: {
                batch_id,
                created_at: messages[0].created_at,
                total_messages: messages.length,
                ...counts,
                messages: messages.map(m => ({
                    queue_id: m.queue_id,
                    wa_id: m.wa_id,
                    message_type: m.message_type,
                    message_text: m.message_text,
                    status: m.status,
                    sent_at: m.sent_at,
                    delivered_at: m.delivered_at
                }))
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── GET /api/whatsapp/messages/pending ───────────────────────────────
// n8n polls this to get messages ready to send
exports.getPendingMessages = async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        const messages = await WhatsAppMessageQueue.find({
            status: { $in: ['PENDING', 'RETRY'] },
            scheduled_for: { $lte: new Date() }
        }).sort({ scheduled_for: 1 }).limit(parseInt(limit)).lean();

        res.json({
            success: true,
            total: messages.length,
            data: messages.map(m => ({
                queue_id: m.queue_id,
                wa_id: m.wa_id,
                message_type: m.message_type,
                message_text: m.message_text,
                batch_id: m.batch_id,
                retry_count: m.retry_count,
                scheduled_for: m.scheduled_for
            }))
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── PATCH /api/whatsapp/messages/:queue_id/status ────────────────────
// n8n calls this after it successfully sends the message
exports.updateMessageStatus = async (req, res) => {
    try {
        const { queue_id } = req.params;
        const { status, message_id, error } = req.body || {};

        const update = { status: status || 'SENT', sent_at: new Date() };
        if (message_id) update.message_id = message_id;
        if (status === 'DELIVERED') update.delivered_at = new Date();
        if (status === 'FAILED') { update.failed_reason = error; update.retry_count = 99; }

        const msg = await WhatsAppMessageQueue.findOneAndUpdate(
            { queue_id },
            { $set: update },
            { new: true }
        );

        if (!msg) return res.status(404).json({ success: false, message: 'Queue entry not found' });
        res.json({ success: true, data: msg });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
