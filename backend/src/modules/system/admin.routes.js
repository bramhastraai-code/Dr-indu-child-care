const express = require('express');
const router = express.Router();
const { login, refreshToken, logout } = require('../auth/auth.controller');
const { getAdmins, createAdmin, updateAdmin, deleteAdmin, getProfile, updateProfile } = require('./admin.controller');

// All admin endpoints — public (no auth required)
router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);

router.get('/users', getAdmins);
router.post('/users', createAdmin);
router.patch('/users/:user_id', updateAdmin);
router.delete('/users/:user_id', deleteAdmin);

router.get('/profile', getProfile);
router.patch('/profile', updateProfile);

module.exports = router;
