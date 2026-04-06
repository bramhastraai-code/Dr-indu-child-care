const Joi = require('joi');

const optionalStr = () => Joi.string().trim().allow('', null);

const genderField = Joi.string()
    .trim()
    .valid('boy', 'girl', 'male', 'female', 'm', 'f')
    .insensitive()
    .allow('', null)
    .messages({
        'any.only': 'Gender must be one of boy or girl'
    });

const basePatientFields = {
    salutation: Joi.string().valid('Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Master', 'Miss', 'Baby', 'Baby of').insensitive().allow('', null),
    first_name: optionalStr().regex(/^[a-zA-Z\s]+$/).max(50).messages({
        'string.pattern.base': 'First name must contain only letters'
    }),
    middle_name: optionalStr().max(100),
    last_name: optionalStr().regex(/^[a-zA-Z\s]+$/).max(50).messages({
        'string.pattern.base': 'Last name must contain only letters'
    }),
    gender: genderField,
    father_name: optionalStr().max(100),
    mother_name: optionalStr().max(100),
    wa_id: Joi.alternatives().try(
        Joi.string().trim().min(8).max(50),
        Joi.string().allow('', null)
    ).label('WhatsApp ID / Mobile'),
    mobile: Joi.string().trim().allow('', null),
    parent_mobile: Joi.string().trim().allow('', null),
    communication_preference: Joi.alternatives().try(
        Joi.boolean(),
        Joi.string().valid('Father', 'Mother', 'Both', 'WhatsApp', 'Email', 'SMS').insensitive().allow('', null)
    ),
    dob: optionalStr().label('Date of Birth'),
    registration_date: Joi.date().allow(null),
    doctor: optionalStr().max(200),
    is_active: Joi.boolean(),
    registration_source: Joi.string()
        .valid('whatsapp', 'form', 'dashboard', 'api')
        .lowercase(),
    child_name: Joi.string().trim().max(100).allow('', null),
    parent_name: Joi.string().trim().max(100).allow('', null),
    state: optionalStr().max(100),
    city: optionalStr().max(100),
    pincode: optionalStr().max(20),
    residential_address: optionalStr().max(500),
    address: optionalStr().max(500),
};

const registerSchema = Joi.object({
    ...basePatientFields,
    first_name: Joi.string().trim().required().messages({ 'any.required': 'First name is required' }),
    last_name: Joi.string().trim().required().messages({ 'any.required': 'Last name is required' }),
    gender: Joi.string().required().messages({ 'any.required': 'Gender is required' }),
    dob: Joi.alternatives().try(
        Joi.date().iso(),
        Joi.string().pattern(/^\d{2}\/\d{2}\/\d{4}$/)
    ).required().messages({
        'any.required': 'Date of Birth is required',
        'alternatives.match': 'Date of Birth must be in YYYY-MM-DD or DD/MM/YYYY format'
    }),
}).or('wa_id', 'mobile', 'parent_mobile');

const updateSchema = Joi.object({
    ...basePatientFields,
    child_name: Joi.string().trim().min(2).max(100),
    is_deleted: Joi.boolean(),
}).min(1);

module.exports = {
    register: registerSchema,
    update: updateSchema
};
