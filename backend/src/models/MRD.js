const mongoose = require('mongoose');

const MRDEntrySchema = new mongoose.Schema({
    appointment_id: {
        type: String,
        ref: 'Appointment',
        default: null
    },
    visit_date: {
        type: Date,
        required: true
    },
    visit_type: {
        type: String,
        enum: ['VACCINATION', 'CONSULTATION', 'PULMONARY', 'FOLLOWUP'],
        required: true
    },
    attending_doctor: {
        type: String,
        default: null
    },
    attending_doctor_id: {
        type: String,
        ref: 'Doctor',
        default: null,
        index: true
    },
    chief_complaint: {
        type: String,
        default: null
    },
    clinical_notes: {
        type: String,
        default: null
    },
    diagnosis: {
        type: String,
        default: null
    },
    prescription: {
        type: String,
        default: null
    },
    investigations: {
        type: String,
        default: null
    },
    advice: {
        type: String,
        default: null
    },
    weight: { type: String, default: null },
    height: { type: String, default: null },
    temperature: { type: String, default: null },
    spo2: { type: String, default: null },
    pulse: { type: String, default: null },
    head_circumference: { type: String, default: null },
    symptoms: { type: [String], default: [] },
    next_visit_due: {
        type: Date,
        default: null
    },
    vaccine_given: {
        type: String,
        default: null
    },
    vaccine_batch: {
        type: String,
        default: null
    },
    recorded_by: {
        type: String,
        required: true
    },
    recorded_at: {
        type: Date,
        default: Date.now
    },
    last_edited_by: {
        type: String,
        default: null
    },
    last_edited_at: {
        type: Date,
        default: null
    },
    is_locked: {
        type: Boolean,
        default: false
    },
    attachments: [{
        url: { type: String, required: true },
        name: { type: String, default: 'attachment' },
        file_type: { type: String, default: 'image/jpeg' },
        uploaded_at: { type: Date, default: Date.now }
    }]
});

const MRDSchema = new mongoose.Schema({
    patient_id: {
        type: String,
        ref: 'Patient',
        unique: true,
        required: true
    },
    entries: [MRDEntrySchema],
}, {
    timestamps: false,
    autoIndex: false, // Disable auto-index creation to prevent buffering timeouts
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Deep Connections: Virtual Population
MRDSchema.virtual('patient', {
    ref: 'Patient',
    localField: 'patient_id',
    foreignField: 'patient_id',
    justOne: true
});

module.exports = mongoose.model('MRD', MRDSchema);
