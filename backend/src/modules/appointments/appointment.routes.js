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
    deleteAppointment
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
    clearQueue
} = require('./token.controller');

const validate = require('../../middleware/validate');
const { create, bookWhatsapp, bookForm, update } = require('./appointment.validator');
const auth = require('../../middleware/auth');

// ── Public / Bot routes (No Dashboard Auth Required) ─────────────────
router.post('/form', validate(bookForm), bookByForm);
router.post('/whatsapp', auth, validate(bookWhatsapp), bookByWhatsapp);
router.get('/by-wa/:wa_id', auth, getAppointmentsByWaId);

// ── Static routes (must come BEFORE /:appointment_id) ─────────────────
// Reminder endpoints
router.get('/reminders/pending-24h', auth, getPending24hReminders);
router.get('/reminders/pending-2h', auth, getPending2hReminders);
router.patch('/reminders/:appointment_id/mark-sent', auth, markReminderSent);

// Stats & summary
router.get('/stats', auth, getAppointmentStats);
router.get('/today', auth, getTodayAppointments);

// ── Token / Queue System ─────────────────────────────────────────────
router.post('/book-with-token', auth, bookWithToken);
router.get('/daily-tokens', auth, getDailyTokens);
router.get('/clinic-display', getClinicDisplay); // Public
router.post('/auto-reschedule', auth, autoReschedule);
router.delete('/queue/:doctor_id', auth, clearQueue);

// Token param routes (before /:appointment_id)
router.get('/next-token/:doctor_id', auth, getNextToken);
router.post('/token/:token/check-in', auth, checkIn);
router.patch('/token/:token/status', auth, updateTokenStatus);
router.get('/token-status/:token', getTokenStatus); // Public patient self-check

// ── Core CRUD ────────────────────────────────────────────────────────
router.get('/', auth, getAppointments);
router.post('/', auth, validate(create), createAppointment);

// ── Appointment-specific routes ──────────────────────────────────────
router.get('/:appointment_id', auth, getAppointmentById);
router.patch('/:appointment_id', auth, validate(update), updateAppointment);
router.patch('/:appointment_id/cancel', auth, cancelAppointment);
router.patch('/:appointment_id/complete', auth, completeAppointment);
router.patch('/:appointment_id/no-show', auth, markNoShow);
router.delete('/:appointment_id', auth, deleteAppointment);

module.exports = router;
