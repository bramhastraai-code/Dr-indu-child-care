const Joi = require('joi');

const patientSchemas = {
    // POST /api/patients
    register: Joi.object({
        child_name: Joi.string().trim().min(2).max(100).required(),
        parent_name: Joi.string().trim().min(2).max(100).required(),
        wa_id: Joi.string().trim().min(8).max(50).required().label('WhatsApp ID / Mobile'),
        email: Joi.string().email().lowercase().trim().allow('', null),
        dob: Joi.string().allow('', null).label('Date of Birth'),
        gender: Joi.string().valid('Male', 'Female', 'Other').allow(null),
        address: Joi.string().trim().max(500).allow('', null),
        registration_source: Joi.string().valid('whatsapp', 'form', 'dashboard', 'api').default('dashboard')
    }),

    // PATCH /api/patients/:id
    update: Joi.object({
        child_name: Joi.string().trim().min(2).max(100),
        parent_name: Joi.string().trim().min(2).max(100),
        wa_id: Joi.string().trim().min(8).max(50).label('WhatsApp ID / Mobile'),
        email: Joi.string().email().lowercase().trim().allow('', null),
        dob: Joi.string().allow('', null),
        gender: Joi.string().valid('Male', 'Female', 'Other').allow(null),
        address: Joi.string().trim().max(500).allow('', null),
        is_deleted: Joi.boolean()
    }).min(1) // At least one field required for update
};

module.exports = patientSchemas;
