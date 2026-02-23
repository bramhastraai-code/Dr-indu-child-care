/**
 * Middleware to restrict access to JWT-authenticated users only.
 * Bypasses API Key authentication even if valid.
 */
module.exports = (req, res, next) => {
    if (req.authMethod !== 'jwt') {
        return res.status(403).json({
            success: false,
            error_code: 'FORBIDDEN',
            message: 'This route requires a valid JWT. API Key access is not allowed for this endpoint.'
        });
    }
    next();
};
