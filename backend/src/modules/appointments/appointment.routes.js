const express = require('express');
const router = express.Router();

const {
    getAppointments,
    createAppointment,
    getAppointmentStats,
    getAppointmentsByWaId,
    getAppointmentById,
    updateAppointment,
    cancelAppointment,
    completeAppointment,
    markNoShow,
    getTodayAppointments,
    bookByWhatsapp,
    bookByForm,
    getPending24hReminders,
    getPending2hReminders,
    markReminderSent,
    deleteAppointment,
    getAvailableTokens,
    checkInAppointment,
    checkOutAppointment
} = require('./appointment.controller');

const {
    bookWithToken,
    checkIn,
    getDailyTokens,
    getClinicDisplay,
    getNextToken,
    updateTokenStatus,
    getTokenStatus,
    autoReschedule,
    clearQueue,
    notifyDelay,
    getWaitTime
} = require('./token.controller');

const validate = require('../../middleware/validate');
const { create, bookWhatsapp, bookForm, update } = require('./appointment.validator');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');

const APPOINTMENT_ROLES = ['superadmin', 'admin', 'staff', 'secretary', 'doctor', 'nurse', 'receptionist'];
const ADMIN_ONLY = ['superadmin', 'admin'];

// ── Public / Bot routes (No Dashboard Auth Required) ─────────────────
router.post('/form', validate(bookForm), bookByForm);
router.post('/whatsapp', validate(bookWhatsapp), bookByWhatsapp);
router.get('/by-wa/:wa_id', getAppointmentsByWaId);
router.get('/tokens/available', getAvailableTokens);

// ── Static routes (must come BEFORE /:appointment_id) ─────────────────
// Reminder endpoints
router.get('/reminders/pending-24h', getPending24hReminders);
router.get('/reminders/pending-2h', getPending2hReminders);
router.patch('/reminders/:appointment_id/mark-sent', markReminderSent);

// Stats & summary
router.get('/stats', getAppointmentStats);
router.get('/today', getTodayAppointments);
router.get('/wait-time/:doctor_id', getWaitTime);

// ── Token / Queue System ─────────────────────────────────────────────
router.post('/book-with-token', bookWithToken);
router.get('/daily-tokens', getDailyTokens);
router.get('/clinic-display', getClinicDisplay); // Public
router.post('/auto-reschedule', autoReschedule);
router.post('/notify-delay', notifyDelay);
router.delete('/queue/:doctor_id', clearQueue);

// Token param routes (before /:appointment_id)
router.get('/next-token/:doctor_id', getNextToken);
router.post('/token/:token/check-in', checkIn);
router.patch('/token/:token/status', updateTokenStatus);
router.get('/token-status/:token', getTokenStatus); // Public patient self-check

// ── Core CRUD ────────────────────────────────────────────────────────
router.get('/', getAppointments);
router.post('/', validate(create), createAppointment);

// ── Appointment-specific routes ──────────────────────────────────────
router.get('/:appointment_id', getAppointmentById);
router.patch('/:appointment_id', validate(update), updateAppointment);
router.patch('/:appointment_id/cancel', cancelAppointment);
router.patch('/:appointment_id/complete', completeAppointment);
router.patch('/:appointment_id/checkin', checkInAppointment);
router.patch('/:appointment_id/checkout', checkOutAppointment);
router.patch('/:appointment_id/no-show', markNoShow);
router.delete('/:appointment_id', deleteAppointment);

module.exports = router;
