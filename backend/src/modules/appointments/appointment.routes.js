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
router.post('/form', validate(create.keys({ wa_id: Joi.string().regex(/^\d{10}$/).required(), patient_id: Joi.optional(), mobile: Joi.optional() })), bookByForm);
router.get('/by-wa/:wa_id', getAppointmentsByWaId);
router.get('/by-mobile/:wa_id', getAppointmentsByWaId); // Alias
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patient_id
 *               - doctor_name
 *               - visit_type
 *               - appointment_date
 *               - slot_id
 *             properties:
 *               patient_id:
 *                 type: string
 *               doctor_id:
 *                 type: string
 *               doctor_name:
 *                 type: string
 *               doctor_speciality:
 *                 type: string
 *               visit_type:
 *                 type: string
 *                 enum: [VACCINATION, CONSULTATION, PULMONARY, FOLLOWUP]
 *               appointment_date:
 *                 type: string
 *                 format: date
 *               slot_id:
 *                 type: string
 *               appointment_mode:
 *                 type: string
 *                 enum: [ONLINE, OFFLINE]
 *               reason:
 *                 type: string
 *               booking_source:
 *                 type: string
 *                 enum: [dashboard, whatsapp, form, api]
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
