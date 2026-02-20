const mongoose = require('mongoose');

const MessageLogSchema = new mongoose.Schema({
    to_number: {
        type: String,
        required: true,
        index: true
    },
    template_name: {
        type: String,
        required: true
    },
    template_params: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    status: {
        type: String,
        enum: ['SENT', 'FAILED', 'PENDING'],
        default: 'PENDING'
    },
    provider_response: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    sent_at: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('MessageLog', MessageLogSchema);
