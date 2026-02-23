const express = require('express');
const router = express.Router();
const { login, refreshToken, logout } = require('../auth/auth.controller');
const { getAdmins, createAdmin, updateAdmin } = require('./admin.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');
const jwtOnly = require('../../middleware/jwtOnly');

// Public routes
router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);

// Protected routes (Admin management) - Strictly JWT only
router.get('/users', auth, jwtOnly, authorize(['superadmin', 'admin']), getAdmins);
router.post('/users', auth, jwtOnly, authorize('superadmin'), createAdmin);
router.patch('/users/:id', auth, jwtOnly, authorize('superadmin'), updateAdmin);

module.exports = router;
