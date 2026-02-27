const Joi = require('joi');

// ── Reusable fragments ────────────────────────────────────────
const optionalStr = () => Joi.string().trim().allow('', null);
const optionalEmail = () => Joi.string().email().lowercase().trim().allow('', null);
const optionalInt = () => Joi.number().integer().min(0).allow(null);

// ── Personal block (shared between register & update) ─────────
const personalFields = {
    salutation: Joi.string().valid('Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Master', 'Miss').insensitive().allow('', null),
    first_name: optionalStr().max(100),
    middle_name: optionalStr().max(100),
    last_name: optionalStr().max(100),
    gender: Joi.string().valid('Male', 'Female', 'Other').insensitive().allow(null),
    mothers_name: optionalStr().max(100),

    // Birth details
    dob_unknown: Joi.boolean().default(false),
    dob: optionalStr().label('Date of Birth'),          // parsed in controller
    age_years: optionalInt(),
    age_months: optionalInt().max(11),
    age_days: optionalInt().max(30),
    birth_time_hours: Joi.number().integer().min(1).max(12).allow(null),
    birth_time_minutes: Joi.number().integer().min(0).max(59).allow(null),
    birth_time_ampm: Joi.string().valid('AM', 'PM').allow(null),
};

// ── Photo block ───────────────────────────────────────────────
const photoFields = {
    registration_date: Joi.date().allow(null),
    photo: optionalStr().max(5 * 1024 * 1024),          // Base64 up to ~5 MB string
    patient_photo: optionalStr(),                       // URL or Base64
};

// ── Parent / Guardian block ───────────────────────────────────
const guardianFields = {
    father_name: optionalStr().max(100),
    father_mobile: optionalStr().max(20),
    father_email: optionalEmail(),
    father_occupation: optionalStr().max(100),

    mother_name: optionalStr().max(100),
    mother_mobile: optionalStr().max(20),
    mother_email: optionalEmail(),
    mother_occupation: optionalStr().max(100),

    communication_preference: Joi.alternatives().try(
        Joi.boolean(),
        Joi.string().valid('Father', 'Mother', 'Both', 'WhatsApp', 'Email', 'SMS').insensitive().allow('', null)
    ),
};

// ── Contact block ─────────────────────────────────────────────
const contactFields = {
    area: optionalStr().max(200),
    city: optionalStr().max(100),
    state: optionalStr().max(100),
    country: optionalStr().max(100),
    pin_code: optionalStr().max(20),
    phone_residence: optionalStr().max(20),
    primary_address: optionalStr().max(500),
    address: optionalStr().max(500),           // legacy
    email: optionalEmail(),
};

// ── Additional details block ──────────────────────────────────
const additionalFields = {
    source: optionalStr().max(200),
    reference_details: optionalStr().max(500),
    ref_details: optionalStr().max(500),
    home_branch: optionalStr().max(200),
    doctor: optionalStr().max(200),
    religion: optionalStr().max(100),
    language: optionalStr().max(100),
    account_type: optionalStr().max(100),
    rating: optionalStr().max(50),
    remarks: optionalStr().max(1000),
    remark: optionalStr().max(1000),
};

// ── Enrollment / Status block ─────────────────────────────────
const enrollmentFields = {
    enrollment_option: Joi.string()
        .valid('just_enroll', 'send_to_specific')
        .insensitive()
        .allow(null)
        .default('just_enroll'),
    send_to_specific: Joi.boolean().default(false),
    is_active: Joi.boolean().default(true),
};

// ─────────────────────────────────────────────────────────────
const patientSchemas = {
    // POST /api/patients
    register: Joi.object({
        // Required
        // Required (either child_name OR names must be present, handled in logic)
        child_name: Joi.string().trim().max(100).allow('', null),
        parent_name: Joi.string().trim().max(100).allow('', null),
        wa_id: Joi.alternatives().try(
            Joi.string().trim().min(8).max(50),
            Joi.string().allow('', null)
        ).required().label('WhatsApp ID / Mobile'),
        mobile: Joi.string().trim().allow('', null),      // fallback alias
        parent_mobile: Joi.string().trim().allow('', null), // user request
        registration_source: Joi.string()
            .valid('whatsapp', 'form', 'dashboard', 'api')
            .default('dashboard'),

        ...personalFields,
        ...photoFields,
        ...guardianFields,
        ...contactFields,
        ...additionalFields,
        ...enrollmentFields,
    }),

    // PUT /api/patients/:id
    update: Joi.object({
        child_name: Joi.string().trim().min(2).max(100),
        parent_name: optionalStr().max(100),
        wa_id: Joi.string().trim().min(8).max(50).label('WhatsApp ID / Mobile'),
        is_deleted: Joi.boolean(),

        ...personalFields,
        ...photoFields,
        ...guardianFields,
        ...contactFields,
        ...additionalFields,
        ...enrollmentFields,
    }).min(1), // At least one field required for update
};

module.exports = patientSchemas;
