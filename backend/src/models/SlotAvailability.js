const mongoose = require('mongoose');

const SlotAvailabilitySchema = new mongoose.Schema({
    slot_id: {
        type: String,
        ref: 'Slot',
        required: true
    },
    slot_date: {
        type: Date,
        required: true
    },
    // Legacy field alias
    date: {
        type: Date
    },
    doctor_type: {
        type: String,
        required: true
    },
    is_booked: {
        type: Boolean,
        default: false
    },
    blocked_by_admin: {
        type: Boolean,
        default: false
    },
    blocked_reason: {
        type: String,
        default: null
    },
    blocked_by: {
        type: String,
        default: null
    },
    blocked_at: {
        type: Date,
        default: null
    },
    appointment_id: {
        type: String,
        ref: 'Appointment',
        default: null
    },
    // Daily Overrides
    custom_label: {
        type: String,
        default: null
    },
    custom_start_time: {
        type: String,
        default: null
    },
    custom_end_time: {
        type: String,
        default: null
    }
});

// Compound unique index
SlotAvailabilitySchema.index({ slot_id: 1, slot_date: 1, doctor_type: 1 }, { unique: true });

// Pre-save: keep 'date' and 'slot_date' in sync (Mongoose 9 async style)
SlotAvailabilitySchema.pre('save', function () {
    if (this.slot_date && !this.date) this.date = this.slot_date;
    if (this.date && !this.slot_date) this.slot_date = this.date;
});

module.exports = mongoose.model('SlotAvailability', SlotAvailabilitySchema);
