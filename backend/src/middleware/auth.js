const jwt = require('jsonwebtoken');

/**
 * Combined Authentication Middleware
 * Supports both JWT (for Dashboard/Admin) and API Key (for n8n)
 * Also supports Public Access when ALLOW_PUBLIC_API is enabled
 */
module.exports = (req, res, next) => {
    const authHeader = req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : req.header('x-auth-token');

    // 1. Try JWT Authentication first
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userData = decoded.admin || decoded;

            req.user = {
                id: userData.id || userData._id,
                username: userData.username,
                role: userData.role,
                user_type: userData.user_type || (userData.role === 'doctor' ? 'doctor' : 'admin'),
                doctor_id: userData.doctor_id,
                permissions: userData.permissions || []
            };
            req.authMethod = 'jwt';
            return next();
        } catch (err) {
            // Token is expired/invalid. 
            // If Public API is NOT allowed, we reject here.
            if (String(process.env.ALLOW_PUBLIC_API || '').toLowerCase() !== 'true') {
                let error_code = 'INVALID_TOKEN';
                let message = 'Access token is invalid';
                if (err.name === 'TokenExpiredError') {
                    error_code = 'TOKEN_EXPIRED';
                    message = 'Access token has expired';
                }
                return res.status(401).json({ success: false, error_code, message });
            }
            // If Public API is allowed, we fall through to treat this as an unauthenticated request
        }
    }

    // 2. Fallback to API Key Check (x-api-key)
    const apiKey = req.header('x-api-key') || req.header('X-API-KEY');
    if (apiKey && apiKey === process.env.N8N_API_KEY) {
        req.user = {
            id: 'n8n_system',
            username: 'n8n_bot',
            role: 'superadmin',
            user_type: 'system',
            permissions: []
        };
        req.authMethod = 'apikey';
        return next();
    }

    // 3. Optional fallback for public access
    if (String(process.env.ALLOW_PUBLIC_API || '').toLowerCase() === 'true') {
        req.user = {
            id: 'public_system',
            username: 'public_user',
            role: 'superadmin',
            user_type: 'system',
            permissions: []
        };
        req.authMethod = 'public';
        return next();
    }

    return res.status(401).json({
        success: false,
        error_code: 'UNAUTHORIZED',
        message: 'Authentication required'
    });
};
