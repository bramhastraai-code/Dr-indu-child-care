const mongoose = require('mongoose');

const BotSessionSchema = new mongoose.Schema({
    session_id: {
        type: String,
        required: true,
        unique: true
    },
    wa_number: {
        type: String,
        required: true,
        index: true
    },
    patient_id: {
        type: String,
        ref: 'Patient',
        default: null
    },
    current_state: {
        type: String,
        default: 'S00_WELCOME'
    },
    session_data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    retry_count: {
        type: Number,
        default: 0
    },
    is_active: {
        type: Boolean,
        default: true
    },
    last_activity_at: {
        type: Date,
        default: Date.now
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    expires_at: {
        type: Date,
        required: true
    }
});

module.exports = mongoose.model('BotSession', BotSessionSchema);
