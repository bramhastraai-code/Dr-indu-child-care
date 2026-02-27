const mongoose = require('mongoose');

/**
 * Notification Model
 * Persists system notifications for admin users.
 * Auto-generates notifications from appointment events, escalations, etc.
 */
const NotificationSchema = new mongoose.Schema({
    notification_id: {
        type: String,
        unique: true,
        required: true,
        index: true
    },
    // Who this notification is for (admin user _id, or 'ALL' for broadcast)
    recipient_id: {
        type: String,
        default: 'ALL',
        index: true
    },
    type: {
        type: String,
        enum: [
            'APPOINTMENT_REMINDER',
            'APPOINTMENT_BOOKED',
            'APPOINTMENT_CANCELLED',
            'APPOINTMENT_NO_SHOW',
            'PATIENT_REGISTERED',
            'ESCALATION_RECEIVED',
            'ESCALATION_RESOLVED',
            'SYSTEM_ALERT',
            'REMINDER_SENT'
        ],
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    // The entity this notification is linked to (appointment_id, patient_id, etc.)
    related_entity_id: {
        type: String,
        default: null,
        index: true
    },
    related_entity_type: {
        type: String,
        enum: ['appointment', 'patient', 'escalation', 'system', null],
        default: null
    },
    is_read: {
        type: Boolean,
        default: false,
        index: true
    },
    read_at: {
        type: Date,
        default: null
    },
    // Auto-expire read notifications after 30 days
    created_at: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: false,
    autoIndex: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Compound index for efficient per-user unread queries
NotificationSchema.index({ recipient_id: 1, is_read: 1, created_at: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
