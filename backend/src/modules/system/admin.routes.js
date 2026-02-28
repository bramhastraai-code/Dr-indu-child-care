const express = require('express');
const router = express.Router();
const { login, refreshToken, logout } = require('../auth/auth.controller');
const { getAdmins, createAdmin, updateAdmin, deleteAdmin, getProfile, updateProfile, getSystemOverview, getAvailableRoles } = require('./admin.controller');
const auth = require('../../middleware/auth');

// ── Public Auth Routes ──────────────────────────────────────────────
router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout); // Logout can be public as it clears own cookie

// ── Administrative Routes (Protected) ───────────────────────────────
router.get('/profile', auth, getProfile);
router.patch('/profile', auth, updateProfile);

router.get('/overview', auth, getSystemOverview);
router.get('/roles', auth, getAvailableRoles);
router.get('/users', auth, getAdmins);
router.post('/users', auth, createAdmin);
router.patch('/users/:user_id', auth, updateAdmin);
router.delete('/users/:user_id', auth, deleteAdmin);

module.exports = router;
