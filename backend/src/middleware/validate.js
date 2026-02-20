const validate = (schema, property = 'body') => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req[property], {
            abortEarly: false,
            stripUnknown: true,
            allowUnknown: false
        });

        if (error) {
            const details = error.details.map(d => ({
                field: d.path[0],
                message: d.message.replace(/['"]/g, '')
            }));

            return res.status(400).json({
                success: false,
                error_code: 'VALIDATION_ERROR',
                message: 'Input validation failed',
                details
            });
        }

        // Replace request property with validated/stripped values
        if (property === 'query' && req.query) {
            // In Express 5, req.query is a getter. We modify the object it returns.
            Object.keys(req.query).forEach(key => delete req.query[key]);
            Object.assign(req.query, value);
        } else {
            req[property] = value;
        }
        next();
    };
};

module.exports = validate;
