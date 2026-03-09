const mongoose = require('mongoose');

const referringDoctorSchema = new mongoose.Schema({
    doctor_id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    clinic_name: {
        type: String,
        trim: true
    },
    speciality: {
        type: String,
        trim: true
    },
    mobile: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    address: {
        type: String,
        trim: true
    },
    notes: {
        type: String,
        trim: true
    },
    is_active: {
        type: Boolean,
        default: true
    },
    total_referrals: {
        type: Number,
        default: 0
    },
    last_referral_date: {
        type: Date
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('ReferringDoctor', referringDoctorSchema);
