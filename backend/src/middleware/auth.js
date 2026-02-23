const jwt = require('jsonwebtoken');

/**
 * Combined Authentication Middleware
 * Supports both JWT (for Dashboard/Admin) and API Key (for n8n)
 */
module.exports = (req, res, next) => {
    // 1. Try JWT Authentication first (for Admin Dashboard users)
    const authHeader = req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : req.header('x-auth-token');

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userData = decoded.admin || decoded;

            req.user = {
                id: userData.id || userData._id,
                username: userData.username,
                role: userData.role
            };
            req.authMethod = 'jwt';
            return next();
        } catch (err) {
            // If token is expired/invalid but an API key is present, 
            // we will fall through and check the API key before rejecting.
            if (!req.header('x-api-key') && !req.header('X-API-KEY')) {
                let error_code = 'INVALID_TOKEN';
                let message = 'Access token is invalid';
                if (err.name === 'TokenExpiredError') {
                    error_code = 'TOKEN_EXPIRED';
                    message = 'Access token has expired';
                }
                return res.status(401).json({ success: false, error_code, message });
            }
        }
    }

    // 2. Fallback to API Key Check (x-api-key) - for n8n/bot automation
    const apiKey = req.header('x-api-key') || req.header('X-API-KEY');

    if (apiKey && apiKey === process.env.N8N_API_KEY) {
        req.user = {
            id: 'n8n_system',
            username: 'n8n_bot',
            role: 'superadmin'
        };
        req.authMethod = 'apikey';
        return next();
    }

    // 3. Reject if neither is valid
    return res.status(401).json({
        success: false,
        error_code: 'UNAUTHORIZED',
        message: 'Authentication required. Please provide a valid JWT or API Key.'
    });
};
