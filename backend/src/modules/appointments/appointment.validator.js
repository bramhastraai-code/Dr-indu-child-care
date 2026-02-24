const Joi = require('joi');

const appointmentSchemas = {
    // POST /api/appointments
    create: Joi.object({
        patient_id: Joi.string().trim().required(),
        doctor_name: Joi.string().trim().min(2).required(),
        doctor_id: Joi.string().trim(),
        doctor_speciality: Joi.string().trim().allow('', null),
        visit_type: Joi.string().valid('VACCINATION', 'CONSULTATION', 'PULMONARY', 'FOLLOWUP').required(),
        appointment_date: Joi.date().iso().min('now').message('Appointment date must be in the future').required(),
        slot_id: Joi.string().trim().required(),
        appointment_mode: Joi.string().valid('ONLINE', 'OFFLINE').default('OFFLINE'),
        reason: Joi.string().trim().max(500).allow('', null),
        booking_source: Joi.string().valid('dashboard', 'whatsapp', 'form', 'api').default('dashboard')
    }),

    // POST /api/appointments/whatsapp
    bookWhatsapp: Joi.object({
        wa_id: Joi.string().trim().required(),
        doctor_name: Joi.string().trim().min(2).required(),
        doctor_id: Joi.string().trim(),
        doctor_speciality: Joi.string().trim().allow('', null),
        visit_type: Joi.string().valid('VACCINATION', 'CONSULTATION', 'PULMONARY', 'FOLLOWUP').required(),
        appointment_date: Joi.date().iso().min('now').required(),
        slot_id: Joi.string().trim().required(),
        reason: Joi.string().trim().max(500).allow('', null)
    }),

    // PATCH /api/appointments/:id
    update: Joi.object({
        appointment_date: Joi.date().iso().min('now'),
        slot_id: Joi.string().trim(),
        doctor_name: Joi.string().trim().min(2),
        doctor_id: Joi.string().trim(),
        doctor_speciality: Joi.string().trim().allow('', null),
        visit_type: Joi.string().valid('VACCINATION', 'CONSULTATION', 'PULMONARY', 'FOLLOWUP'),
        appointment_mode: Joi.string().valid('ONLINE', 'OFFLINE'),
        reason: Joi.string().trim().max(500).allow('', null)
    }).min(1)
};

module.exports = appointmentSchemas;
