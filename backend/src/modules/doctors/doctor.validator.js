const Joi = require('joi');

const createDoctor = Joi.object({
    name: Joi.string().required().trim(),
    qualification: Joi.string().allow('', null).trim(),
    experience: Joi.string().allow('', null).trim(),
    type: Joi.string().valid('PULMONARY', 'NON_PULMONARY', 'VACCINATION', 'ANY').required(),
    is_active: Joi.boolean().default(true),
    available_slots: Joi.object().pattern(
        Joi.string().regex(/^[0-6]$/), // 0-6 for days of week
        Joi.array().items(Joi.string()) // array of slot_ids
    ).optional()
});

const updateDoctor = Joi.object({
    name: Joi.string().trim(),
    qualification: Joi.string().allow('', null).trim(),
    experience: Joi.string().allow('', null).trim(),
    type: Joi.string().valid('PULMONARY', 'NON_PULMONARY', 'VACCINATION', 'ANY'),
    is_active: Joi.boolean(),
    available_slots: Joi.object().pattern(
        Joi.string().regex(/^[0-6]$/),
        Joi.array().items(Joi.string())
    ).optional()
});

module.exports = {
    createDoctor,
    updateDoctor
};
