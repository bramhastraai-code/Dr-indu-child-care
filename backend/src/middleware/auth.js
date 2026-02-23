const jwt = require('jsonwebtoken');

/**
 * Combined Authentication Middleware
 * Supports both JWT (for Dashboard/Admin) and API Key (for n8n)
 */
module.exports = (req, res, next) => {
    // 1. Check for API Key first (x-api-key) - primarily for n8n/bot automation
    const apiKey = req.header('x-api-key') || req.header('X-API-KEY');

    if (apiKey && apiKey === process.env.N8N_API_KEY) {
        req.user = {
            id: 'n8n_system',
            username: 'n8n_bot',
            role: 'superadmin' // n8n gets full access to patients/appointments
        };
        req.authMethod = 'apikey';
        return next();
    }

    // 2. Fallback to JWT Authentication (for Admin Dashboard)
    const authHeader = req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : req.header('x-auth-token');

    if (!token) {
        return res.status(401).json({
            success: false,
            error_code: 'UNAUTHORIZED',
            message: 'Authentication required. Please provide a valid JWT or API Key.'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = {
            id: decoded.id,
            username: decoded.username,
            role: decoded.role
        };
        req.authMethod = 'jwt';

        next();
    } catch (err) {
        let error_code = 'INVALID_TOKEN';
        let message = 'Access token is invalid';

        if (err.name === 'TokenExpiredError') {
            error_code = 'TOKEN_EXPIRED';
            message = 'Access token has expired';
        }

        res.status(401).json({ success: false, error_code, message });
    }
};
