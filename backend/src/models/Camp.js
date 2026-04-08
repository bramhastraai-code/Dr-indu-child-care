const mongoose = require('mongoose');

const CampSchema = new mongoose.Schema({
    camp_name: { type: String, required: true, trim: true },
    camp_type: {
        type: String,
        enum: ['vaccination', 'health_checkup', 'awareness', 'nutrition', 'dental', 'eye_care', 'other'],
        default: 'health_checkup'
    },
    description: { type: String, trim: true },
    location: {
        venue: { type: String, required: true },
        address: { type: String },
        city: { type: String, default: 'Mumbai' },
        state: { type: String, default: 'Maharashtra' },
        pincode: { type: String }
    },
    scheduled_date: { type: Date, required: true },
    end_date: { type: Date },
    start_time: { type: String }, // e.g. "09:00 AM"
    end_time: { type: String },
    organizer: { type: String, default: 'Dr. Indu' },
    doctors_assigned: [{ type: String }],
    target_beneficiaries: { type: String },  // e.g. "Children 0-5 years"
    expected_attendance: { type: Number, default: 0 },
    actual_attendance: { type: Number, default: 0 },
    registration_required: { type: Boolean, default: false },
    registration_link: { type: String },
    status: {
        type: String,
        enum: ['scheduled', 'ongoing', 'completed', 'cancelled', 'postponed'],
        default: 'scheduled'
    },
    notes: { type: String },
    tags: [{ type: String }],
    created_by: { type: String },
    is_deleted: { type: Boolean, default: false }
}, { timestamps: true });

CampSchema.index({ scheduled_date: 1 });
CampSchema.index({ status: 1 });

module.exports = mongoose.model('Camp', CampSchema);
