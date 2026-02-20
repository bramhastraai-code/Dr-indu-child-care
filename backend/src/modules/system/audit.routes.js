const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('./system.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');

router.get('/logs', auth, authorize(['superadmin', 'admin']), getAuditLogs);

module.exports = router;
