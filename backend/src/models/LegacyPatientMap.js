const mongoose = require('mongoose');

const LegacyPatientMapSchema = new mongoose.Schema({
    pid: {
        type: Number,
        required: true,
        unique: true,
        index: true
    },
    mrd_id: {
        type: String,
        required: true,
        index: true
    }
}, { timestamps: true });

module.exports = mongoose.model('LegacyPatientMap', LegacyPatientMapSchema);
