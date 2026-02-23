const mongoose = require('mongoose');

const DoctorSchema = new mongoose.Schema({
    doctor_id: {
        type: String,
        unique: true,
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    qualification: {
        type: String,
        trim: true
    },
    experience: {
        type: String,
        trim: true
    },
    type: {
        type: String,
        enum: ['PULMONARY', 'NON_PULMONARY', 'VACCINATION', 'ANY'],
        required: true
    },
    is_active: {
        type: Boolean,
        default: true
    },
    // Weekly availability template for this specific doctor
    // { "0": ["S1", "S2"], "1": ["S1"] } where "0" is Sunday and "S1" is slot_id
    available_slots: {
        type: Map,
        of: [String],
        default: {}
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
});

// Update updated_at on save
DoctorSchema.pre('save', function (next) {
    this.updated_at = Date.now();
    next();
});

module.exports = mongoose.model('Doctor', DoctorSchema);
