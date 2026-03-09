const Joi = require('joi');

const VISIT_CATEGORIES = ['First visit', 'Follow-up', 'Vaccination', 'Other'];

const appointmentSchemas = {
    // POST /api/appointments
    create: Joi.object({
        patient_id: Joi.string().trim().required(),
        doctor_name: Joi.string().trim().min(2),
        doctor_id: Joi.string().trim(),
        doctor_speciality: Joi.string().trim().allow('', null),
        visit_category: Joi.string().valid(...VISIT_CATEGORIES).insensitive().optional(),
        appointment_date: Joi.string().required().label('Appointment Date'),
        appointment_mode: Joi.string().valid('ONLINE', 'OFFLINE').insensitive().default('OFFLINE'),
        registration_type: Joi.string().valid('online', 'walkin').insensitive().optional(),
        reason: Joi.string().trim().max(500).allow('', null),
        booking_source: Joi.string().valid('dashboard', 'whatsapp', 'form', 'api').insensitive().default('dashboard')
    }).or('doctor_name', 'doctor_id'),

    // POST /api/appointments/whatsapp
    bookWhatsapp: Joi.object({
        wa_id: Joi.string().trim().required(),
        patient_id: Joi.string().trim().allow('', null),
        child_name: Joi.string().trim().allow('', null),
        doctor_name: Joi.string().trim().min(2),
        doctor_id: Joi.string().trim(),
        doctor_speciality: Joi.string().trim().allow('', null),
        visit_type: Joi.string().valid(...VISIT_CATEGORIES).insensitive().optional(),
        visit_category: Joi.string().valid(...VISIT_CATEGORIES).insensitive().optional(),
        appointment_date: Joi.string().required(),
        reason: Joi.string().trim().max(500).allow('', null)
    }).or('doctor_name', 'doctor_id'),

    // POST /api/appointments/form
    bookForm: Joi.object({
        wa_id: Joi.string().trim().allow('', null),
        mobile: Joi.string().trim().allow('', null),
        doctor_name: Joi.string().trim().min(2),
        doctor_id: Joi.string().trim(),
        doctor_speciality: Joi.string().trim().allow('', null),
        visit_type: Joi.string().valid(...VISIT_CATEGORIES).insensitive().optional(),
        visit_category: Joi.string().valid(...VISIT_CATEGORIES).insensitive().optional(),
        appointment_date: Joi.string().required(),
        appointment_mode: Joi.string().valid('ONLINE', 'OFFLINE').insensitive().default('OFFLINE'),
        registration_type: Joi.string().valid('online', 'walkin').insensitive().optional(),
        reason: Joi.string().trim().max(500).allow('', null)
    }).or('wa_id', 'mobile').or('doctor_name', 'doctor_id'),

    // PATCH /api/appointments/:id
    update: Joi.object({
        appointment_date: Joi.string(),
        doctor_name: Joi.string().trim().min(2),
        doctor_id: Joi.string().trim(),
        doctor_speciality: Joi.string().trim().allow('', null),
        visit_category: Joi.string().valid(...VISIT_CATEGORIES).insensitive(),
        appointment_mode: Joi.string().valid('ONLINE', 'OFFLINE').insensitive(),
        registration_type: Joi.string().valid('online', 'walkin').insensitive().optional(),
        reason: Joi.string().trim().max(500).allow('', null)
    }).min(1)
};

module.exports = appointmentSchemas;
