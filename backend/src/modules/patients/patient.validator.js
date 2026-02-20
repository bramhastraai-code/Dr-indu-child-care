const Joi = require('joi');

const patientSchemas = {
    // POST /api/patients
    register: Joi.object({
        child_name: Joi.string().trim().min(2).max(100).required(),
        parent_name: Joi.string().trim().min(2).max(100).required(),
        mobile: Joi.string().regex(/^\d{10}$/).message('Mobile must be a 10-digit Indian number').required(),
        email: Joi.string().email().lowercase().trim().allow('', null),
        dob: Joi.date().iso().max('now').message('DOB must be a valid past date in ISO format').allow(null),
        gender: Joi.string().valid('Male', 'Female', 'Other').allow(null),
        address: Joi.string().trim().max(500).allow('', null),
        registration_source: Joi.string().valid('whatsapp', 'form', 'dashboard', 'api').default('dashboard')
    }),

    // PATCH /api/patients/:id
    update: Joi.object({
        child_name: Joi.string().trim().min(2).max(100),
        parent_name: Joi.string().trim().min(2).max(100),
        mobile: Joi.string().regex(/^\d{10}$/).message('Mobile must be a 10-digit Indian number'),
        email: Joi.string().email().lowercase().trim().allow('', null),
        dob: Joi.date().iso().max('now').message('DOB must be a valid past date in ISO format').allow(null),
        gender: Joi.string().valid('Male', 'Female', 'Other').allow(null),
        address: Joi.string().trim().max(500).allow('', null),
        is_active: Joi.boolean()
    }).min(1) // At least one field required for update
};

module.exports = patientSchemas;
