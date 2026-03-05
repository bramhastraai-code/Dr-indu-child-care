const jwt = require('jsonwebtoken');

/**
 * AUTH MIDDLEWARE — Public Mode
 * Always allows the request through.
 * If a valid JWT is provided, populates req.user from the token.
 * Otherwise, treats the user as superadmin (public access).
 */
module.exports = (req, res, next) => {
    // Try to decode JWT if present (optional — never blocks the request)
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
                role: userData.role || 'superadmin',
                user_type: userData.user_type || (userData.role === 'doctor' ? 'doctor' : 'admin'),
                doctor_id: userData.doctor_id,
                permissions: userData.permissions || []
            };
            req.authMethod = 'jwt';
            return next();
        } catch (_) { /* invalid token — fall through to public access */ }
    }

    // API Key check (for n8n / bot integrations)
    const apiKey = req.header('x-api-key') || req.header('X-API-KEY');
    if (apiKey && apiKey === process.env.N8N_API_KEY) {
        req.user = { id: 'n8n_system', username: 'n8n_bot', role: 'superadmin', user_type: 'system', permissions: [] };
        req.authMethod = 'apikey';
        return next();
    }

    // PUBLIC FALLBACK — always allow, set superadmin role
    req.user = { id: 'public', username: 'public', role: 'superadmin', user_type: 'public', permissions: [] };
    req.authMethod = 'public';
    return next();
};
