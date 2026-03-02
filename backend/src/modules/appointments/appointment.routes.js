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
const { create, bookWhatsapp, update } = require('./appointment.validator');
const Joi = require('joi');
const auth = require('../../middleware/auth');

router.use(auth);

// ── Public / Bot routes ──────────────────────────────────────────────
router.post('/form', validate(create.keys({
    wa_id: Joi.string().optional(),
    patient_id: Joi.optional(),
    mobile: Joi.optional(),
    visit_type: Joi.string().optional()
})), bookByForm);
router.post('/whatsapp', validate(bookWhatsapp), bookByWhatsapp);
router.get('/by-wa/:wa_id', getAppointmentsByWaId);

// ── Static routes (must come BEFORE /:appointment_id) ───────────────
// Reminder endpoints
router.get('/reminders/pending-24h', getPending24hReminders);
router.get('/reminders/pending-2h', getPending2hReminders);
router.patch('/reminders/:appointment_id/mark-sent', markReminderSent);

// Stats & summary
router.get('/stats', getAppointmentStats);
router.get('/today', getTodayAppointments);

// ── Token / Queue System ─────────────────────────────────────────────
router.post('/book-with-token', bookWithToken);
router.get('/daily-tokens', getDailyTokens);
router.get('/clinic-display', getClinicDisplay);
router.post('/auto-reschedule', autoReschedule);
router.delete('/queue/:doctor_id', clearQueue);

// Token param routes (before /:appointment_id)
router.get('/next-token/:doctor_id', getNextToken);
router.post('/token/:token/check-in', checkIn);
router.patch('/token/:token/status', updateTokenStatus);
router.get('/token-status/:token', getTokenStatus);

// ── Core CRUD ────────────────────────────────────────────────────────
router.get('/', getAppointments);
router.post('/', validate(create), createAppointment);

// ── Appointment-specific routes ──────────────────────────────────────
router.get('/:appointment_id', getAppointmentById);
router.patch('/:appointment_id', validate(update), updateAppointment);
router.patch('/:appointment_id/cancel', cancelAppointment);
router.patch('/:appointment_id/complete', completeAppointment);
router.patch('/:appointment_id/no-show', markNoShow);
router.delete('/:appointment_id', deleteAppointment);

module.exports = router;
