const mongoose = require('mongoose');

const SystemConfigSchema = new mongoose.Schema({
    config_key: {
        type: String,
        unique: true,
        required: true
    },
    config_value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    description: String,
    updated_at: {
        type: Date,
        default: Date.now
    },
    updated_by: {
        type: String,
        default: 'SYSTEM'
    }
});

module.exports = mongoose.model('SystemConfig', SystemConfigSchema);
