const Joi = require('joi');

const appointmentSchemas = {
    // POST /api/appointments
    create: Joi.object({
        patient_id: Joi.string().trim().required(),
        doctor_name: Joi.string().trim().min(2).required(),
        doctor_id: Joi.string().trim(),
        doctor_speciality: Joi.string().trim().allow('', null),
        visit_type: Joi.string().valid('VACCINATION', 'CONSULTATION', 'PULMONARY', 'FOLLOWUP').insensitive().optional(),
        appointment_date: Joi.string().required().label('Appointment Date'),
        slot_id: Joi.string().trim().required(),
        appointment_mode: Joi.string().valid('ONLINE', 'OFFLINE').insensitive().default('OFFLINE'),
        reason: Joi.string().trim().max(500).allow('', null),
        booking_source: Joi.string().valid('dashboard', 'whatsapp', 'form', 'api').insensitive().default('dashboard')
    }),

    // POST /api/appointments/whatsapp
    bookWhatsapp: Joi.object({
        wa_id: Joi.string().trim().required(),
        doctor_name: Joi.string().trim().min(2).required(),
        doctor_id: Joi.string().trim(),
        doctor_speciality: Joi.string().trim().allow('', null),
        visit_type: Joi.string().valid('VACCINATION', 'CONSULTATION', 'PULMONARY', 'FOLLOWUP').insensitive().optional(),
        appointment_date: Joi.string().required(),
        slot_id: Joi.string().trim().required(),
        reason: Joi.string().trim().max(500).allow('', null)
    }),

    // PATCH /api/appointments/:id
    update: Joi.object({
        appointment_date: Joi.string(),
        slot_id: Joi.string().trim(),
        doctor_name: Joi.string().trim().min(2),
        doctor_id: Joi.string().trim(),
        doctor_speciality: Joi.string().trim().allow('', null),
        visit_type: Joi.string().valid('VACCINATION', 'CONSULTATION', 'PULMONARY', 'FOLLOWUP').insensitive(),
        appointment_mode: Joi.string().valid('ONLINE', 'OFFLINE').insensitive(),
        reason: Joi.string().trim().max(500).allow('', null)
    }).min(1)
};

module.exports = appointmentSchemas;
