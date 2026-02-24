const express = require('express');
const router = express.Router();
const {
    getAppointments,
    createAppointment,
    getAppointmentStats,
    getAppointmentsByMobile,
    getAppointmentsByWaId,
    getAppointmentById,
    updateAppointment,
    cancelAppointment,
    getTodayAppointments,
    bookByWhatsapp,
    bookByForm,
    getPending24hReminders,
    markReminderSent
} = require('./appointment.controller');

const validate = require('../../middleware/validate');
const { create, bookWhatsapp, update } = require('./appointment.validator');
const Joi = require('joi');




/**
 * @openapi
 * tags:
 *   - name: Appointments
 *     description: Appointment booking, cancellation, rescheduling and lookup
 */

// All routes are now public for external integrations like n8n
router.post('/form', validate(create.keys({ mobile: Joi.string().regex(/^\d{10}$/).required(), patient_id: Joi.optional() })), bookByForm);
router.get('/by-mobile/:mobile', getAppointmentsByMobile);
router.get('/by-wa/:wa_id', getAppointmentsByWaId);
router.post('/whatsapp', validate(bookWhatsapp), bookByWhatsapp);
router.get('/reminders/pending-24h', getPending24hReminders);
router.patch('/reminders/:appointment_id/mark-sent', markReminderSent);

/**
 * @openapi
 * /api/appointments/stats:
 *   get:
 *     summary: Appointment stats for a given date (defaults to today)
 *     tags: [Appointments]
 */
router.get('/stats', getAppointmentStats);

/**
 * @openapi
 * /api/appointments/today:
 *   get:
 *     summary: All appointments for today (shortcut)
 *     tags: [Appointments]
 */
router.get('/today', getTodayAppointments);

/**
 * @openapi
 * /api/appointments:
 *   get:
 *     summary: List appointments with filters
 *     tags: [Appointments]
 */
router.get('/', getAppointments);

/**
 * @openapi
 * /api/appointments:
 *   post:
 *     summary: Book a new appointment (all channels)
 *     tags: [Appointments]
 */
router.post('/', validate(create), createAppointment);

/**
 * @openapi
 * /api/appointments/{appointment_id}:
 *   get:
 *     summary: Get a single appointment by ID
 *     tags: [Appointments]
 */
router.get('/:appointment_id', getAppointmentById);

/**
 * @openapi
 * /api/appointments/{appointment_id}:
 *   patch:
 *     summary: Update / reschedule an appointment
 *     tags: [Appointments]
 */
router.patch('/:appointment_id', validate(update), updateAppointment);

/**
 * @openapi
 * /api/appointments/{appointment_id}/cancel:
 *   patch:
 *     summary: Cancel an appointment (dashboard or WhatsApp bot)
 *     tags: [Appointments]
 */
router.patch('/:appointment_id/cancel', cancelAppointment);

module.exports = router;
