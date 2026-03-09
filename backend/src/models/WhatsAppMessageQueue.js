const mongoose = require('mongoose');

/**
 * WhatsAppMessageQueue — persistent outbound message queue.
 * Messages are written here and processed every 30 seconds by the cron worker.
 */
const WhatsAppMessageQueueSchema = new mongoose.Schema({
    queue_id: {
        type: String,
        unique: true,
        required: true,
        default: () => `MQ-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
    },
    // Batch groups related messages (e.g. all patients for one doctor-late event)
    batch_id: { type: String, default: null, index: true },

    // Recipient
    wa_id: { type: String, required: true, index: true },

    message_type: {
        type: String,
        enum: [
            'DOCTOR_RUNNING_LATE',
            'APPOINTMENT_RESCHEDULED',
            'DOCTOR_ARRIVED',
            'TOKEN_CALL_REMINDER',
            'APPOINTMENT_COMPLETED',
            'NO_SHOW_NOTICE',
            'APPOINTMENT_CONFIRMED',
            'PRESCRIPTION_DELIVERY',
            'APPOINTMENT_REMINDER_24H',
            'APPOINTMENT_REMINDER_2H',
            'APPOINTMENT_REMINDER_1H',
            'APPOINTMENT_TIME_UPDATED'
        ],
        required: true
    },

    // Pre-built message text (ready to send)
    message_text: { type: String, required: true },

    // Original template variables (kept for audit/debug)
    variables: { type: mongoose.Schema.Types.Mixed, default: {} },

    status: {
        type: String,
        enum: ['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'RETRY'],
        default: 'PENDING',
        index: true
    },

    // WATI/provider message ID (filled after send)
    message_id: { type: String, default: null, index: true },

    retry_count: { type: Number, default: 0, max: 3 },
    scheduled_for: { type: Date, default: Date.now, index: true },
    sent_at: { type: Date, default: null },
    delivered_at: { type: Date, default: null },
    read_at: { type: Date, default: null },
    failed_reason: { type: String, default: null },

    // Link back to the entity that triggered this message
    related_entity: {
        entity_type: { type: String, default: null },   // 'appointment' | 'token' | 'doctor'
        entity_id: { type: String, default: null }
    },

    created_at: { type: Date, default: Date.now }
}, {
    timestamps: false,
    autoIndex: false
});

WhatsAppMessageQueueSchema.index({ status: 1, scheduled_for: 1 });
WhatsAppMessageQueueSchema.index({ batch_id: 1, status: 1 });

module.exports = mongoose.model('WhatsAppMessageQueue', WhatsAppMessageQueueSchema);
