/**
 * Role-Based Access Control (RBAC) middleware
 * @param {string|string[]} roles - Allowed roles for this route
 */
const authorize = (roles = []) => {
    if (typeof roles === 'string') {
        roles = [roles];
    }

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error_code: 'UNAUTHORIZED',
                message: 'Authentication required'
            });
        }

        // superadmin bypasses all role checks
        if (req.user.role === 'superadmin') {
            return next();
        }

        if (roles.length && !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error_code: 'FORBIDDEN',
                message: 'Access denied: insufficient permissions'
            });
        }

        next();
    };
};

module.exports = authorize;
