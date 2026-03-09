const mongoose = require('mongoose');

const DayConfigSchema = new mongoose.Schema({
    total_tokens: { type: Number, default: 40 },
    online_limit: { type: Number, default: 20 },
    walkin_limit: { type: Number, default: 20 },
    start_time: { type: String, default: '10:00' }, // HH:mm
    is_active: { type: Boolean, default: true }
}, { _id: false });

const DoctorTokenConfigSchema = new mongoose.Schema({
    doctor_id: {
        type: String,
        ref: 'Doctor',
        required: true,
        unique: true,
        index: true
    },
    weekly_config: {
        monday: { type: DayConfigSchema, default: () => ({}) },
        tuesday: { type: DayConfigSchema, default: () => ({}) },
        wednesday: { type: DayConfigSchema, default: () => ({}) },
        thursday: { type: DayConfigSchema, default: () => ({}) },
        friday: { type: DayConfigSchema, default: () => ({}) },
        saturday: { type: DayConfigSchema, default: () => ({}) },
        sunday: { type: DayConfigSchema, default: () => ({}) }
    },
    date_overrides: [{
        date: { type: Date, required: true },
        total_tokens: Number,
        online_limit: Number,
        walkin_limit: Number,
        start_time: String,
        is_holiday: { type: Boolean, default: false }
    }],
    updated_at: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: false
});

module.exports = mongoose.model('DoctorTokenConfig', DoctorTokenConfigSchema);
