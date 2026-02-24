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
    doctor_type: {
        type: String,
        enum: ['PULMONARY', 'NON_PULMONARY', 'VACCINATION', 'ANY', 'CONSULTATION'],
        required: true
    },
    // doctor: field alias for doctor_type (backward compatibility)
    doctor: {
        type: String
    },
    doctor_id: {
        type: String,
        ref: 'Doctor',
        default: null,
        index: true
    },
    // New canonical API field (user-facing)
    doctor_name: {
        type: String,
        default: null
    },
    // Legacy/internal alias retained for backward compatibility
    assigned_doctor_name: {
        type: String,
        default: null
    },
    visit_type: {
        type: String,
        enum: ['VACCINATION', 'CONSULTATION', 'PULMONARY', 'FOLLOWUP'],
        default: 'CONSULTATION'
    },
    appointment_date: {
        type: Date,
        required: true,
        index: true
    },
    slot_id: {
        type: String,
        ref: 'Slot',
        required: true
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
        enum: ['BOOKED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
        default: 'CONFIRMED'
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
    is_deleted: {
        type: Boolean,
        default: false,
        index: true
    },
    created_at: { type: Date, default: Date.now },
    last_updated_at: { type: Date, default: Date.now },
    last_updated_by: { type: String, default: null }
}, { timestamps: false });

// Compound index for the one-appointment-per-patient-per-day rule
AppointmentSchema.index({ patient_id: 1, appointment_date: 1 });

module.exports = mongoose.model('Appointment', AppointmentSchema);
