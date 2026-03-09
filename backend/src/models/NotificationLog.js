const mongoose = require('mongoose');

const NotificationLogSchema = new mongoose.Schema({
    patient_id: {
        type: String,
        ref: 'Patient',
        required: true,
        index: true
    },
    notification_type: {
        type: String,
        enum: ['confirmation', 'reminder_24h', 'reminder_1h', 'delay', 'prescription'],
        required: true,
        index: true
    },
    whatsapp_number: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['sent', 'failed', 'pending'],
        default: 'pending',
        index: true
    },
    sent_at: {
        type: Date,
        default: null
    },
    created_by: {
        type: String,
        ref: 'Admin',
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('NotificationLog', NotificationLogSchema);
