const mongoose = require('mongoose');

// Master slot definitions (the "template" for all slots the clinic offers)
const SlotSchema = new mongoose.Schema({
    slot_id: {
        type: String,
        unique: true,
        required: true
    },
    slot_label: {
        type: String,
        required: true
    },
    // Legacy field alias
    display_label: {
        type: String
    },
    start_time: {
        type: String, // HH:MM
        required: true
    },
    end_time: {
        type: String, // HH:MM
        required: true
    },
    session: {
        type: String,
        enum: ['MORNING', 'EVENING', 'AFTERNOON'],
        required: true
    },
    is_active: {
        type: Boolean,
        default: true
    },
    // Which days of the week this slot is active (0=Sun,1=Mon,...,6=Sat)
    // Template that auto-carries forward each week unless overridden per-date
    days_of_week: {
        type: [Number],
        default: [0, 1, 2, 3, 4, 5, 6]  // All days by default
    },
    // Per-doctor-type override: { PULMONARY: [1,2,3,4,5,6], VACCINATION: [0,6] }
    // If empty for a doctor_type, falls back to days_of_week
    days_by_doctor: {
        type: Map,
        of: [Number],
        default: {}
    },
    sort_order: {
        type: Number,
        default: 0
    }
});

module.exports = mongoose.model('Slot', SlotSchema);
