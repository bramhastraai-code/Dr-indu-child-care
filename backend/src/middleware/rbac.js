/**
 * RBAC MIDDLEWARE
 * Checks if the user's role is included in the allowed roles for the route.
 */
const authorize = (allowedRoles = []) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const userRole = req.user.role ? req.user.role.toLowerCase() : null;

        // Superadmin always has access
        if (userRole === 'superadmin') {
            return next();
        }

        if (allowedRoles.length > 0 && !allowedRoles.map(r => r.toLowerCase()).includes(userRole)) {
            return res.status(403).json({
                success: false,
                message: `Access denied: insufficient permissions. Required: [${allowedRoles.join(', ')}], Found: ${userRole}`
            });
        }

        next();
    };
};

module.exports = authorize;
