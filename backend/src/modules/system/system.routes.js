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
router.get('/config', getConfig);
router.put('/config', updateConfig);
router.get('/audit-logs', getAuditLogs);


module.exports = router;
