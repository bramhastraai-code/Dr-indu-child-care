const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('./system.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');

const jwtOnly = require('../../middleware/jwtOnly');

router.use(auth, jwtOnly, authorize(['superadmin', 'admin']));

router.get('/logs', getAuditLogs);

module.exports = router;
