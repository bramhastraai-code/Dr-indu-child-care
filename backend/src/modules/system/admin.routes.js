const express = require('express');
const router = express.Router();
const { login, refreshToken, logout } = require('../auth/auth.controller');
const { getAdmins, createAdmin, updateAdmin } = require('./admin.controller');

// All routes are public for external integrations like n8n
router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);

// Admin management
router.get('/users', getAdmins);
router.post('/users', createAdmin);
router.patch('/users/:id', updateAdmin);

module.exports = router;
