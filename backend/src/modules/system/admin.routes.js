const express = require('express');
const router = express.Router();
const { login, refreshToken, logout } = require('../auth/auth.controller');
const { getAdmins, createAdmin, updateAdmin } = require('./admin.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');

// Public routes
router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);

// Protected routes (Admin management)
router.get('/users', auth, authorize(['superadmin', 'admin']), getAdmins);
router.post('/users', auth, authorize('superadmin'), createAdmin);
router.patch('/users/:id', auth, authorize('superadmin'), updateAdmin);

module.exports = router;
