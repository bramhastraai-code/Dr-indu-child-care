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
const authorize = require('../../middleware/rbac');

/**
 * @openapi
 * tags:
 *   - name: Appointments
 *     description: Appointment booking, cancellation, rescheduling and lookup
 */

/**
 * @openapi
 * /api/appointments/stats:
 *   get:
 *     summary: Appointment stats for a given date (defaults to today)
 *     tags: [Appointments]
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: "Date to fetch stats for (YYYY-MM-DD, defaults to today)"
 *     responses:
 *       200:
 *         description: Stats object with totals by status and booking source
 */
router.get('/stats', authorize(['superadmin', 'admin', 'staff']), getAppointmentStats);

/**
 * @openapi
 * /api/appointments/today:
 *   get:
 *     summary: All appointments for today (shortcut)
 *     tags: [Appointments]
 */
router.get('/today', authorize(['superadmin', 'admin', 'staff']), getTodayAppointments);

/**
 * @openapi
 * /api/appointments/by-mobile/{mobile}:
 *   get:
 *     summary: Get upcoming appointments by patient mobile number
 *     tags: [Appointments]
 *     parameters:
 *       - in: path
 *         name: mobile
 *         required: true
 *         schema:
 *           type: string
 *         description: Patient mobile number or wa_id
 *     responses:
 *       200:
 *         description: List of upcoming appointments for this patient
 *       404:
 *         description: No patient found for this mobile
 */
router.get('/by-mobile/:mobile', getAppointmentsByMobile);

/**
 * @openapi
 * /api/appointments/by-wa/{wa_id}:
 *   get:
 *     summary: Get upcoming appointments by WhatsApp ID (bot shortcut)
 *     description: Accepts raw wa_id formats like '919876543210@c.us'. Normalizes internally.
 *     tags: [Appointments]
 *     parameters:
 *       - in: path
 *         name: wa_id
 *         required: true
 *         schema: { type: string }
 *         example: "919876543210@c.us"
 */
router.get('/by-wa/:wa_id', authorize(['bot_service', 'superadmin', 'admin', 'staff']), getAppointmentsByWaId);

/**
 * @openapi
 * /api/appointments:
 *   get:
 *     summary: List appointments with filters
 *     tags: [Appointments]
 *     parameters:
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: patient_id
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [BOOKED, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW] }
 *       - in: query
 *         name: source
 *         schema: { type: string, enum: [dashboard, whatsapp, form, api] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Paginated list of appointments
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
 *             required: [appointment_date, slot_id, doctor_type, booking_source]
 *             properties:
 *               patient_id:
 *                 type: string
 *                 description: Required for dashboard / form / api sources
 *                 example: "DICC-2026-0016"
 *               mobile:
 *                 type: string
 *                 description: Required for whatsapp source (alternative to patient_id)
 *                 example: "9876543210"
 *               wa_id:
 *                 type: string
 *                 description: WhatsApp ID (alternative to mobile for whatsapp source)
 *               doctor_type:
 *                 type: string
 *                 enum: [PULMONARY, NON_PULMONARY, VACCINATION]
 *               visit_type:
 *                 type: string
 *                 enum: [CONSULTATION, VACCINATION, PULMONARY, FOLLOWUP]
 *               appointment_mode:
 *                 type: string
 *                 enum: [OFFLINE, ONLINE]
 *               appointment_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-06-15"
 *               slot_id:
 *                 type: string
 *                 example: "S1"
 *               reason:
 *                 type: string
 *                 example: "Fever follow-up"
 *               booking_source:
 *                 type: string
 *                 enum: [dashboard, whatsapp, form, api]
 *                 example: "dashboard"
 *     responses:
 *       201:
 *         description: Appointment confirmed
 *       400:
 *         description: Missing or invalid fields
 *       404:
 *         description: Patient not found
 *       409:
 *         description: Slot already booked or patient already has appointment today
 */
router.post('/', validate(create), createAppointment);

/**
 * @openapi
 * /api/appointments/whatsapp:
 *   post:
 *     summary: Book via WhatsApp bot (identified by wa_id)
 *     tags: [Appointments]
 *     description: |
 *       Dedicated WhatsApp bot endpoint. wa_id is normalized (strips @c.us suffix,
 *       extracts 10-digit mobile from country code). Patient MUST be pre-registered.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [wa_id, appointment_date, slot_id, doctor_type]
 *             properties:
 *               wa_id:
 *                 type: string
 *                 example: "919876543210@c.us"
 *               doctor_type:
 *                 type: string
 *                 enum: [PULMONARY, NON_PULMONARY, VACCINATION]
 *               visit_type:
 *                 type: string
 *                 enum: [CONSULTATION, VACCINATION, PULMONARY, FOLLOWUP]
 *               appointment_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-06-15"
 *               slot_id:
 *                 type: string
 *                 example: "S1"
 *               reason:
 *                 type: string
 *     responses:
 *       201:
 *         description: Appointment confirmed
 *       409:
 *         description: Not registered / slot taken / already booked today
 */
router.post('/whatsapp', authorize(['bot_service', 'superadmin']), validate(bookWhatsapp), bookByWhatsapp);

/**
 * @openapi
 * /api/appointments/form:
 *   post:
 *     summary: Book via public web form (identified by mobile number)
 *     tags: [Appointments]
 *     description: Public endpoint, no auth. Patient MUST be pre-registered.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mobile, appointment_date, slot_id, doctor_type]
 *             properties:
 *               mobile:
 *                 type: string
 *                 example: "9876543210"
 *               doctor_type:
 *                 type: string
 *                 enum: [PULMONARY, NON_PULMONARY, VACCINATION]
 *               visit_type:
 *                 type: string
 *                 enum: [CONSULTATION, VACCINATION, PULMONARY, FOLLOWUP]
 *               appointment_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-06-15"
 *               slot_id:
 *                 type: string
 *                 example: "S1"
 *               reason:
 *                 type: string
 *     responses:
 *       201:
 *         description: Appointment confirmed
 *       409:
 *         description: Not registered / slot taken / already booked today
 */
router.post('/form', validate(create.keys({ mobile: Joi.string().regex(/^\d{10}$/).required(), patient_id: Joi.optional() })), bookByForm);

/**
 * @openapi
 * /api/appointments/{appointment_id}:
 *   get:
 *     summary: Get a single appointment by ID
 *     tags: [Appointments]
 *     parameters:
 *       - in: path
 *         name: appointment_id
 *         required: true
 *         schema: { type: string }
 *         example: "APT-2026-00001"
 *     responses:
 *       200:
 *         description: Appointment details with enriched patient and slot info
 *       404:
 *         description: Appointment not found
 */
router.get('/:appointment_id', getAppointmentById);

/**
 * @openapi
 * /api/appointments/{appointment_id}:
 *   patch:
 *     summary: Update / reschedule an appointment
 *     tags: [Appointments]
 *     parameters:
 *       - in: path
 *         name: appointment_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               appointment_date: { type: string, format: date }
 *               slot_id:          { type: string }
 *               doctor_type:      { type: string }
 *               visit_type:       { type: string }
 *               appointment_mode: { type: string }
 *               reason:           { type: string }
 *     responses:
 *       200:
 *         description: Appointment updated
 *       409:
 *         description: Target slot already booked
 */
router.patch('/:appointment_id', authorize(['superadmin', 'admin', 'staff']), validate(update), updateAppointment);

/**
 * @openapi
 * /api/appointments/{appointment_id}/cancel:
 *   patch:
 *     summary: Cancel an appointment (dashboard or WhatsApp bot)
 *     tags: [Appointments]
 *     parameters:
 *       - in: path
 *         name: appointment_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cancellation_reason: { type: string, example: "Parent unavailable" }
 *               cancelled_by:
 *                 type: string
 *                 enum: [whatsapp, dashboard, system]
 *                 default: dashboard
 *     responses:
 *       200:
 *         description: Appointment cancelled, slot freed
 *       404:
 *         description: Appointment not found
 *       409:
 *         description: Already cancelled
 */
router.patch('/:appointment_id/cancel', cancelAppointment);

// Reminder Management
router.get('/reminders/pending-24h', authorize(['bot_service', 'superadmin', 'admin']), getPending24hReminders);
router.patch('/reminders/:appointment_id/mark-sent', authorize(['bot_service', 'superadmin', 'admin']), markReminderSent);

module.exports = router;
