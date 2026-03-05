/**
 * RBAC MIDDLEWARE — Public Mode
 * Always allows access. Role checks are bypassed.
 * Returns a middleware function that immediately calls next().
 */
const authorize = (roles = [], requiredPermission = null) => {
    return (req, res, next) => next();
};

module.exports = authorize;
