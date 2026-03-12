const Joi = require('joi');

const optionalStr = () => Joi.string().trim().allow('', null);
const optionalEmail = () => Joi.string().email().lowercase().trim().allow('', null);
const optionalInt = () => Joi.number().integer().min(0).allow(null);

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
    mothers_name: optionalStr().max(100),
    mother_name: optionalStr().max(100),
    father_name: optionalStr().max(100),
    father_email: optionalEmail(),
    father_occupation: optionalStr().max(100),
    mother_email: optionalEmail(),
    mother_occupation: optionalStr().max(100),
    wa_id: Joi.alternatives().try(
        Joi.string().trim().min(8).max(50),
        Joi.string().allow('', null)
    ).label('WhatsApp ID / Mobile'),
    mobile: Joi.string().trim().allow('', null),
    parent_mobile: Joi.string().trim().allow('', null),
    email: optionalEmail(),
    communication_preference: Joi.alternatives().try(
        Joi.boolean(),
        Joi.string().valid('Father', 'Mother', 'Both', 'WhatsApp', 'Email', 'SMS').insensitive().allow('', null)
    ),
    dob_unknown: Joi.boolean().allow(null),
    dob: optionalStr().label('Date of Birth'),
    age_years: optionalInt(),
    age_months: optionalInt().max(11),
    age_days: optionalInt().max(30),
    registration_date: Joi.date().allow(null),
    photo: optionalStr().max(5 * 1024 * 1024),
    patient_photo: optionalStr(),
    source: optionalStr().max(200),
    referred_by: optionalStr().max(500),
    home_branch: optionalStr().max(200),
    doctor: optionalStr().max(200),
    religion: optionalStr().max(100),
    language: optionalStr().max(100),
    account_type: optionalStr().max(100),
    rating: optionalStr().max(50),
    remarks: optionalStr().max(1000),
    remark: optionalStr().max(1000),
    enrollment_option: Joi.string()
        .valid('just_enroll', 'send_to_specific', 'book_appointment')
        .insensitive()
        .allow(null),
    send_to_specific: Joi.boolean(),
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
    address: optionalStr().max(500), // Added alias for residential_address
};

const registerSchema = Joi.object({
    ...basePatientFields,
    // Overwrite required fields for registration
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
    email: Joi.string().email().lowercase().trim().required().messages({
        'any.required': 'Email Address is required',
        'string.email': 'Invalid email format'
    }),
}).or('wa_id', 'mobile', 'parent_mobile');

const updateSchema = Joi.object({
    ...basePatientFields,
    // In updates, everything is optional
    child_name: Joi.string().trim().min(2).max(100),
    is_deleted: Joi.boolean(),
}).min(1);

module.exports = {
    register: registerSchema,
    update: updateSchema
};



