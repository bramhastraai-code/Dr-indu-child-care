const jwt = require('jsonwebtoken');

/**
 * UNIFIED AUTH MIDDLEWARE
 * Priority:
 *   1. Valid JWT  → sets req.user from token
 *   2. Valid API Key (x-api-key) → sets req.user as n8n system
 *   3. Public fallback → sets req.user as superadmin (always allowed unless ALLOW_PUBLIC_API=false)
 */
module.exports = (req, res, next) => {
    // ── Try JWT ───────────────────────────────────────────────────────────────
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
        } catch (_) {
            // Token present but invalid — fall through to public access
        }
    }

    // ── Try API Key ───────────────────────────────────────────────────────────
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

    // ── Public Fallback ───────────────────────────────────────────────────────
    // Default: allow unless ALLOW_PUBLIC_API is explicitly set to "false"
    const allowPublic = (process.env.ALLOW_PUBLIC_API || 'true').trim().toLowerCase();
    if (allowPublic !== 'false') {
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
        message: 'Authentication required. Set ALLOW_PUBLIC_API=true to enable public access.'
    });
};
