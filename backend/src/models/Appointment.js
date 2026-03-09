const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
    appointment_id: {
        type: String,
        unique: true,
        required: true,
        index: true
    },
    patient_id: {
        type: String,
        ref: 'Patient',
        required: true,
        index: true
    },
    appointment_mode: {
        type: String,
        enum: ['ONLINE', 'OFFLINE'],
        default: 'OFFLINE'
    },
    doctor_name: {
        type: String,
        required: true,
        index: true
    },
    doctor_id: {
        type: String,
        ref: 'Doctor',
        default: null,
        index: true
    },
    doctor_speciality: {
        type: String,
        default: null
    },
    // Legacy/internal alias retained for backward compatibility
    assigned_doctor_name: {
        type: String,
        default: null
    },
    // Deprecated: use visit_category instead
    visit_type: {
        type: String,
        default: null
    },
    visit_category: {
        type: String,
        enum: ['First visit', 'Follow-up', 'Vaccination', 'Other'],
        default: 'First visit',
        required: true
    },
    token_pool: {
        type: String,
        enum: ['ONLINE', 'WALK_IN'],
        default: 'ONLINE'
    },
    registration_type: {
        type: String,
        enum: ['online', 'walkin'],
        required: true
    },
    appointment_date: {
        type: Date,
        required: true,
        index: true
    },
    // Human-readable time label stored for quick display (e.g. "11:00")
    appointment_time: {
        type: String,
        default: null
    },
    reason: {
        type: String,
        default: null
    },
    // wa_id: raw WhatsApp ID stored for traceability (only set on whatsapp-source bookings)
    wa_id: {
        type: String,
        default: null,
        index: true
    },
    // appointment_status: the lifecycle state of this appointment
    status: {
        type: String,
        enum: ['PENDING', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'BOOKED', 'CONFIRMED', 'NO_SHOW'], // Standardized to UPPERCASE
        default: 'PENDING'
    },
    // booking_source: which channel created this appointment
    booking_source: {
        type: String,
        enum: ['dashboard', 'whatsapp', 'form', 'api'],
        default: 'dashboard',
        index: true
    },
    confirmation_sent: { type: Boolean, default: false },
    reminder_24h_sent: { type: Boolean, default: false },
    reminder_24h_sent_at: { type: Date, default: null },
    reminder_2h_sent: { type: Boolean, default: false },
    reminder_2h_sent_at: { type: Date, default: null },
    cancelled_at: { type: Date, default: null },
    cancelled_by: { type: String, default: null },  // 'whatsapp' | 'dashboard' | 'system'
    cancellation_reason: { type: String, default: null },
    secretary_notes: { type: String, default: null },
    // ── Token / Queue System ──────────────────────────────────────────
    // Daily sequential token number per pool (e.g. ONL-1, WLK-1)
    token_number: { type: Number, default: null, index: true },
    token_display: { type: String, default: null }, // e.g. "O-1", "W-1"

    // Status Transitions: 
    // PENDING -> WAITING (Token Assigned) -> CHECKED_IN (At Clinic) -> IN_PROGRESS (With Doctor) -> COMPLETED (Checked Out)
    token_status: {
        type: String,
        enum: ['PENDING', 'WAITING', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'NO_SHOW', null],
        default: 'PENDING'
    },
    // When the patient physically checked in at clinic
    check_in_time: { type: Date, default: null },
    checked_in_at: { type: Date, default: null },
    checked_out_at: { type: Date, default: null },
    // When this token was called to see the doctor
    called_at: { type: Date, default: null },
    is_deleted: {
        type: Boolean,
        default: false,
        index: true
    },
    created_at: { type: Date, default: Date.now },
    last_updated_at: { type: Date, default: Date.now },
    last_updated_by: { type: String, default: null }
}, {
    timestamps: false,
    autoIndex: false, // Disable auto-index creation to prevent buffering timeouts
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Deep Connections: Virtual Population
AppointmentSchema.virtual('patient', {
    ref: 'Patient',
    localField: 'patient_id',
    foreignField: 'patient_id',
    justOne: true
});

AppointmentSchema.virtual('mrd_entry', {
    ref: 'MRD',
    localField: 'appointment_id',
    foreignField: 'entries.appointment_id',
    justOne: true
});

// Compound index for the one-appointment-per-patient-per-day rule
AppointmentSchema.index({ patient_id: 1, appointment_date: 1 });

// Unique index to prevent duplicate tokens per doctor per pool per day
// Note: Partial index ensures we only enforce this when token_number is set
AppointmentSchema.index(
    { doctor_id: 1, appointment_date: 1, token_number: 1, token_pool: 1 },
    { unique: true, partialFilterExpression: { token_number: { $type: "number" }, is_deleted: false } }
);

module.exports = mongoose.model('Appointment', AppointmentSchema);
