/**
 * Role-Based and Permission-Based Access Control (RBAC) middleware
 * @param {string|string[]} roles - Allowed roles for this route
 * @param {string} [requiredPermission] - Optional specific permission required
 */
const authorize = (roles = [], requiredPermission = null) => {
    if (typeof roles === 'string' && roles !== '') {
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

        // 1. Superadmin bypasses all checks (Total Control)
        if (req.user.role === 'superadmin') {
            return next();
        }

        // 2. Check Permissions (Granular Control assigned by Superadmin)
        if (requiredPermission && req.user.permissions && req.user.permissions.includes(requiredPermission)) {
            return next();
        }

        // 3. Check Roles (Standard Control)
        if (Array.isArray(roles) && roles.length > 0) {
            if (roles.includes(req.user.role)) {
                return next();
            }
        } else if (!requiredPermission) {
            // If no roles and no permissions are specified, allow access (rarely used)
            return next();
        }

        return res.status(403).json({
            success: false,
            error_code: 'FORBIDDEN',
            message: 'Access denied: insufficient permissions or incorrect role'
        });
    };
};

module.exports = authorize;
