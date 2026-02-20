const mongoose = require('mongoose');

// New models required by API spec
const EscalationSchema = new mongoose.Schema({
    wa_number: {
        type: String,
        required: true,
        index: true
    },
    session_id: {
        type: String,
        default: null
    },
    reason: {
        type: String,
        required: true
    },
    failed_state: {
        type: String,
        default: null
    },
    retry_count: {
        type: Number,
        default: 0
    },
    escalated_at: {
        type: Date,
        default: Date.now
    },
    resolved: {
        type: Boolean,
        default: false
    },
    resolved_at: {
        type: Date,
        default: null
    },
    resolved_by: {
        type: String,
        default: null
    }
});

module.exports = mongoose.model('Escalation', EscalationSchema);
