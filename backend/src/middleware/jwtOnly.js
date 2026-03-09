module.exports = (req, res, next) => {
    // PUBLIC MODE: jwtOnly restriction disabled
    next();
};
