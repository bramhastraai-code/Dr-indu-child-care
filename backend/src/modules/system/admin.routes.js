const express = require('express');
const router = express.Router();
const { login, refreshToken, logout } = require('../auth/auth.controller');
const { getAdmins, createAdmin, updateAdmin, deleteAdmin, getProfile, updateProfile, getSystemOverview, getAvailableRoles } = require('./admin.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');

// ── Public Auth Routes ──────────────────────────────────────────────
router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);

// ── Private Admin Routes ───────────────────────────────────────────
router.use(auth); // Require JWT for all routes below

router.get('/profile', getProfile);
router.patch('/profile', updateProfile);

// System overview and role configuration
router.get('/overview', authorize('superadmin', 'admin'), getSystemOverview);
router.get('/roles', getAvailableRoles);

// User Management (Super Admin only for create/delete, Admin can view/update)
router.get('/users', authorize('superadmin', 'admin'), getAdmins);
router.post('/users', authorize('superadmin'), createAdmin);
router.patch('/users/:user_id', authorize('superadmin', 'admin'), updateAdmin);
router.delete('/users/:user_id', authorize('superadmin'), deleteAdmin);

module.exports = router;
