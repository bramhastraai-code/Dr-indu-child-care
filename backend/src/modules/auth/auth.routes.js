const express = require('express');
const router = express.Router();
const { login, refreshToken, logout, changePassword } = require('./auth.controller');
const auth = require('../../middleware/auth');
const jwtOnly = require('../../middleware/jwtOnly');

// All auth endpoints — public (no auth required)
router.post('/login', login);
router.post('/doctor/login', login);
router.post('/refresh', refreshToken);
router.post('/token', refreshToken);   // legacy alias
router.post('/logout', logout);
router.post('/change-password', auth, jwtOnly, changePassword);

module.exports = router;
