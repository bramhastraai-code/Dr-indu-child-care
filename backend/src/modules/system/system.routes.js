const express = require('express');
const router = express.Router();
const {
    getHealth,
    getConfig,
    updateConfig,
    getAuditLogs
} = require('./system.controller');
const auth = require('../../middleware/auth');

/**
 * @openapi
 * /api/system/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [System]
 */
router.get('/health', getHealth);
router.get('/config', auth, getConfig);
router.put('/config', auth, updateConfig);
router.get('/audit-logs', auth, getAuditLogs);


module.exports = router;
