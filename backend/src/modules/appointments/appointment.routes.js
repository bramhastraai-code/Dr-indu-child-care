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
const authorize = require('../../middleware/rbac');

const APPOINTMENT_ROLES = ['superadmin', 'admin', 'staff', 'secretary', 'doctor'];
const ADMIN_ONLY = ['superadmin', 'admin'];

// ── Public / Bot routes (No Dashboard Auth Required) ─────────────────
router.post('/form', validate(bookForm), bookByForm);
router.post('/whatsapp', validate(bookWhatsapp), bookByWhatsapp);
router.get('/by-wa/:wa_id', getAppointmentsByWaId);

// ── Static routes (must come BEFORE /:appointment_id) ─────────────────
// Reminder endpoints
router.get('/reminders/pending-24h', auth, authorize(APPOINTMENT_ROLES), getPending24hReminders);
router.get('/reminders/pending-2h', auth, authorize(APPOINTMENT_ROLES), getPending2hReminders);
router.patch('/reminders/:appointment_id/mark-sent', auth, authorize(APPOINTMENT_ROLES), markReminderSent);

// Stats & summary
router.get('/stats', auth, authorize(APPOINTMENT_ROLES), getAppointmentStats);
router.get('/today', auth, authorize(APPOINTMENT_ROLES), getTodayAppointments);

// ── Token / Queue System ─────────────────────────────────────────────
router.post('/book-with-token', auth, authorize(APPOINTMENT_ROLES), bookWithToken);
router.get('/daily-tokens', auth, authorize(APPOINTMENT_ROLES), getDailyTokens);
router.get('/clinic-display', getClinicDisplay); // Public
router.post('/auto-reschedule', auth, authorize(APPOINTMENT_ROLES), autoReschedule);
router.delete('/queue/:doctor_id', auth, authorize(APPOINTMENT_ROLES), clearQueue);

// Token param routes (before /:appointment_id)
router.get('/next-token/:doctor_id', auth, authorize(APPOINTMENT_ROLES), getNextToken);
router.post('/token/:token/check-in', auth, authorize(APPOINTMENT_ROLES), checkIn);
router.patch('/token/:token/status', auth, authorize(APPOINTMENT_ROLES), updateTokenStatus);
router.get('/token-status/:token', getTokenStatus); // Public patient self-check

// ── Core CRUD ────────────────────────────────────────────────────────
router.get('/', auth, authorize(APPOINTMENT_ROLES), getAppointments);
router.post('/', auth, authorize(APPOINTMENT_ROLES), validate(create), createAppointment);

// ── Appointment-specific routes ──────────────────────────────────────
router.get('/:appointment_id', auth, authorize(APPOINTMENT_ROLES), getAppointmentById);
router.patch('/:appointment_id', auth, authorize(APPOINTMENT_ROLES), validate(update), updateAppointment);
router.patch('/:appointment_id/cancel', auth, authorize(APPOINTMENT_ROLES), cancelAppointment);
router.patch('/:appointment_id/complete', auth, authorize(APPOINTMENT_ROLES), completeAppointment);
router.patch('/:appointment_id/no-show', auth, authorize(APPOINTMENT_ROLES), markNoShow);
router.delete('/:appointment_id', auth, authorize(ADMIN_ONLY), deleteAppointment);

module.exports = router;
