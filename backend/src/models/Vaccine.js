const mongoose = require('mongoose');

const VaccineSchema = new mongoose.Schema({
    vaccine_id: {
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
    days_from_birth: {
        type: Number, // When this vaccine should ideally be given
        default: 0
    },
    is_active: {
        type: Boolean,
        default: true
    },
    created_at: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: false
});

module.exports = mongoose.model('Vaccine', VaccineSchema);
