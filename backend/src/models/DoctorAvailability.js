const mongoose = require('mongoose');

/**
 * DoctorAvailability — real-time per-day availability status for each doctor.
 * One document per (doctor_id + date). Updated by the secretary/admin as day progresses.
 */
const DoctorAvailabilitySchema = new mongoose.Schema({
    doctor_id: {
        type: String,
        required: true,
        index: true
    },
    doctor_name: {
        type: String,
        required: true
    },
    // Date only (midnight UTC) — one record per doctor per day
    date: {
        type: Date,
        required: true,
        index: true
    },
    // Real-time status
    status: {
        type: String,
        enum: ['PRESENT', 'ABSENT', 'LATE', 'ON_BREAK', 'DONE'],
        default: 'PRESENT',
        index: true
    },
    // When late: estimated arrival time in minutes from now
    eta_minutes: {
        type: Number,
        default: null
    },
    // Human-readable ETA time string e.g. "11:30 AM"
    eta_time: {
        type: String,
        default: null
    },
    // Timestamps
    check_in_time: {
        type: Date,
        default: null
    },
    check_out_time: {
        type: Date,
        default: null
    },
    // Token serving state  
    current_token: {
        type: Number,
        default: 0   // 0 = not started
    },
    // Late check-in history (array of late arrival records)
    late_checkins: [{
        recorded_at: { type: Date, default: Date.now },
        eta_minutes: { type: Number, default: null },
        eta_time: { type: String, default: null },
        reason: { type: String, default: null },
        recorded_by: { type: String, default: null }
    }],
    notes: {
        type: String,
        default: null
    },
    updated_at: {
        type: Date,
        default: Date.now
    },
    updated_by: {
        type: String,
        default: null
    }
}, {
    timestamps: false,
    autoIndex: false
});

// Unique per doctor per day
DoctorAvailabilitySchema.index({ doctor_id: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DoctorAvailability', DoctorAvailabilitySchema);
