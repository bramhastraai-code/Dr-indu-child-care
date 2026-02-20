const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.header('x-auth-token');

    if (!token) {
        return res.status(401).json({
            success: false,
            error_code: 'UNAUTHORIZED',
            message: 'Authentication token missing'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Standardize req.user for RBAC
        req.user = {
            id: decoded.id,
            username: decoded.username,
            role: decoded.role
        };

        next();
    } catch (err) {
        let error_code = 'INVALID_TOKEN';
        let message = 'Access token is invalid';

        if (err.name === 'TokenExpiredError') {
            error_code = 'TOKEN_EXPIRED';
            message = 'Access token has expired';
        }

        res.status(401).json({ success: false, error_code, message });
    }
};
