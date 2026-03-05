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

// ── All Admin Routes (auth middleware allows public by default) ──────
router.get('/profile', auth, authorize(['superadmin', 'admin', 'staff', 'secretary', 'doctor']), getProfile);
router.patch('/profile', auth, authorize(['superadmin', 'admin', 'staff', 'secretary', 'doctor']), updateProfile);

router.get('/overview', auth, authorize(['superadmin', 'admin', 'doctor']), getSystemOverview);
router.get('/roles', auth, authorize(['superadmin', 'admin', 'doctor']), getAvailableRoles);
router.get('/users', auth, authorize(['superadmin', 'admin']), getAdmins);
router.post('/users', auth, authorize(['superadmin']), createAdmin);
router.patch('/users/:user_id', auth, authorize(['superadmin']), updateAdmin);
router.delete('/users/:user_id', auth, authorize(['superadmin']), deleteAdmin);

module.exports = router;
