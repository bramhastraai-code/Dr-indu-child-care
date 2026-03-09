const Joi = require('joi');

const createDoctor = Joi.object({
    name: Joi.string().required().trim(),
    qualification: Joi.string().allow('', null).trim(),
    experience: Joi.string().allow('', null).trim(),
    speciality: Joi.string().allow('', null).trim(),
    login_username: Joi.string().trim().lowercase().pattern(/^[a-z0-9._-]{3,40}$/).optional(),
    login_email: Joi.string().trim().lowercase().email().optional(),
    password: Joi.string().min(6).max(128).optional(),
    is_active: Joi.boolean().default(true),
}).custom((value, helpers) => {
    const hasUsername = !!value.login_username;
    const hasEmail = !!value.login_email;
    const hasPassword = !!value.password;
    const hasAnyLoginField = hasUsername || hasEmail || hasPassword;

    if (hasAnyLoginField) {
        if (!hasPassword) {
            return helpers.message('password is required when doctor login is configured');
        }
        if (!hasUsername && !hasEmail) {
            return helpers.message('login_username or login_email is required when doctor login is configured');
        }
    }

    return value;
}, 'doctor login configuration');

const updateDoctor = Joi.object({
    name: Joi.string().trim(),
    qualification: Joi.string().allow('', null).trim(),
    experience: Joi.string().allow('', null).trim(),
    speciality: Joi.string().allow('', null).trim(),
    login_username: Joi.string().trim().lowercase().pattern(/^[a-z0-9._-]{3,40}$/).optional(),
    login_email: Joi.string().trim().lowercase().email().optional(),
    password: Joi.string().min(6).max(128).optional(),
    is_active: Joi.boolean(),
});

module.exports = {
    createDoctor,
    updateDoctor
};
