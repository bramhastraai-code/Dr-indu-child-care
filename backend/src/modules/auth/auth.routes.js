const express = require('express');
const router = express.Router();
const { login, refreshToken, logout, changePassword } = require('./auth.controller');

// All auth endpoints — public (no auth required)
router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/token', refreshToken);   // legacy alias
router.post('/logout', logout);
router.post('/change-password', changePassword);

module.exports = router;
