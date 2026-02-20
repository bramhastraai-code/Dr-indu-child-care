const audit = require('../utils/audit');

/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log for server-side debugging
    console.error(`[ERROR] ${req.method} ${req.url}:`, {
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        user: req.user ? req.user.id : 'anonymous'
    });

    // Handle specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error_code: 'VALIDATION_ERROR',
            message: Object.values(err.errors).map(val => val.message).join(', ')
        });
    }

    if (err.code === 11000) {
        return res.status(409).json({
            success: false,
            error_code: 'DUPLICATE_KEY',
            message: 'A record with this unique identifier already exists'
        });
    }

    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            error_code: 'INVALID_TOKEN',
            message: 'Invalid authentication token'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            error_code: 'TOKEN_EXPIRED',
            message: 'Authentication token has expired'
        });
    }

    // Default 500
    res.status(err.status || 500).json({
        success: false,
        error_code: err.error_code || 'SERVER_ERROR',
        message: err.message || 'Internal Server Error'
    });
};

module.exports = errorHandler;
