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
    allergies: { type: [String], default: [] },
    provisional_diagnoses: [{
        code: { type: String, default: null },
        diagnosis: { type: String, default: null },
        stage: { type: String, default: null },
        type: { type: String, default: null },
        notes: { type: String, default: null }
    }],
    prescriptions_list: [{
        medicine: { type: String, default: null },
        generic_name: { type: String, default: null },
        dosage: { type: String, default: null },
        schedule: { type: String, default: null },
        route: { type: String, default: null },
        instruction: { type: String, default: null },
        days: { type: Number, default: null }
    }],
    investigations_list: [{
        test_name: { type: String, default: null },
        priority: { type: String, default: null },
        notes: { type: String, default: null }
    }],
    medication_history: [{
        medicine: { type: String, default: null },
        dosage: { type: String, default: null },
        is_to_be_continued: { type: Boolean, default: false },
        notes: { type: String, default: null }
    }],
    family_diseases: [{
        disease: { type: String, default: null },
        relationship: { type: String, default: null },
        notes: { type: String, default: null }
    }],
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
        uploaded_at: { type: Date, default: Date.now },
        size: { type: Number, default: null }
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
