const mongoose = require('mongoose');

/**
 * DoctorAvailability — weekly arrival schedule for each doctor.
 * One document per doctor. Stores what time the doctor arrives each day of the week.
 */
const DayScheduleSchema = new mongoose.Schema({
    arrival_time: {
        type: String,      // e.g. "10:00", "12:30" (24h format HH:MM)
        default: null
    },
    is_working: {
        type: Boolean,
        default: true      // false = day off for this doctor
    }
}, { _id: false });

const DoctorAvailabilitySchema = new mongoose.Schema({
    doctor_id: {
        type: String,
        required: true,
        index: true
    },
    date: {
        type: Date,
        default: null,
        index: true
    },
    current_token: {
        type: Number,
        default: 0
    },
    doctor_name: {
        type: String,
        required: true
    },
    schedule: {
        monday: { type: DayScheduleSchema, default: () => ({ arrival_time: '10:00', is_working: true }) },
        tuesday: { type: DayScheduleSchema, default: () => ({ arrival_time: '10:00', is_working: true }) },
        wednesday: { type: DayScheduleSchema, default: () => ({ arrival_time: '10:00', is_working: true }) },
        thursday: { type: DayScheduleSchema, default: () => ({ arrival_time: '10:00', is_working: true }) },
        friday: { type: DayScheduleSchema, default: () => ({ arrival_time: '10:00', is_working: true }) },
        saturday: { type: DayScheduleSchema, default: () => ({ arrival_time: '10:00', is_working: true }) },
        sunday: { type: DayScheduleSchema, default: () => ({ arrival_time: null, is_working: false }) }
    },
    updated_at: {
        type: Date,
        default: Date.now
    },
    updated_by: {
        type: String,
        default: null
    },
    // Full history of every schedule change
    change_history: [{
        changed_at: { type: Date, default: Date.now },
        changed_by: { type: String, default: null },
        snapshot: { type: mongoose.Schema.Types.Mixed }   // full schedule at time of change
    }],
    // Live availability status (used by dashboard)
    status: {
        type: String,
        enum: ['PRESENT', 'LATE', 'ABSENT', 'ON_LEAVE', 'UNKNOWN'],
        default: 'PRESENT'
    },
    eta_minutes: {
        type: Number,
        default: null
    },
    eta_time: {
        type: String,
        default: null
    },
    notes: {
        type: String,
        default: null
    },
    // Today's actual start time — set by the doctor when they arrive or update
    today_start_time: {
        type: String,      // HH:MM — actual start for today, overrides weekly schedule
        default: null
    },
    today_start_notified_at: {
        type: Date,        // Timestamp of last patient notification for today's start
        default: null
    }
}, {
    timestamps: false,
    autoIndex: false
});

DoctorAvailabilitySchema.index({ doctor_id: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DoctorAvailability', DoctorAvailabilitySchema);
