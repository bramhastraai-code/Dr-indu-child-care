const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('./system.controller');
// All routes are public for external integrations like n8n
router.get('/logs', getAuditLogs);

module.exports = router;
