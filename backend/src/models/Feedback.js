const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
    name: {
        type: String,
        default: null
    },
    mobile: {
        type: String,
        default: null
    },
    email: {
        type: String,
        default: null
    },
    doctor_rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    frontdesk_rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    hospital_rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    appointment_id: {
        type: String,
        ref: 'Appointment',
        default: null,
        index: true
    },
    submitted_at: {
        type: Date,
        default: Date.now,
        index: true
    },
    ip_address: {
        type: String,
        required: true
    }
}, {
    timestamps: false
});

module.exports = mongoose.model('Feedback', FeedbackSchema);
