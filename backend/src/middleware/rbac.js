const authorize = (allowedRoles = []) => {
    return (req, res, next) => {
        // Since APIs are public, bypass role checking completely
        next();
    };
};

module.exports = authorize;
