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

// ── All Admin Routes — now public
router.get('/profile', getProfile);
router.patch('/profile', updateProfile);

router.get('/overview', getSystemOverview);
router.get('/roles', getAvailableRoles);
router.get('/users', getAdmins);
router.post('/users', createAdmin);
router.patch('/users/:user_id', updateAdmin);
router.delete('/users/:user_id', deleteAdmin);

module.exports = router;
