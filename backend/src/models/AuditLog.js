const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    event_type: {
        type: String,
        required: true,
        index: true
    },
    entity_type: {
        type: String,
        required: true,
        index: true
    },
    entity_id: {
        type: String,
        required: true
    },
    actor: {
        type: String,   // username or 'BOT'
        required: true
    },
    actor_type: {
        type: String,   // 'BOT' | 'SECRETARY' | 'ADMIN' | 'SYSTEM' | 'API'
        enum: ['BOT', 'SECRETARY', 'ADMIN', 'SYSTEM', 'API', 'SUPER_ADMIN', 'DOCTOR'],
        required: true
    },
    old_value: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    new_value: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    ip_address: {
        type: String,
        default: null
    },
    user_agent: {
        type: String,
        default: null
    },
    occurred_at: {
        type: Date,
        default: Date.now,
        index: true
    }
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);
