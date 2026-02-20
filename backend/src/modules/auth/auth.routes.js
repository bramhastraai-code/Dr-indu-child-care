const express = require('express');
const router = express.Router();
const { login, refreshToken, logout } = require('./auth.controller');

// Token endpoint: use refreshToken handler for issuing new access tokens
router.post('/token', refreshToken);

// Expose login/logout for convenience (admin login routes also exist under /api/admin)
router.post('/login', login);
router.post('/logout', logout);

module.exports = router;
