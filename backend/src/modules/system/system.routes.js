const express = require('express');
const router = express.Router();
const {
    getHealth,
    getConfig,
    updateConfig,
    getAuditLogs
} = require('./system.controller');

/**
 * @openapi
 * /api/system/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [System]
 */
router.get('/health', getHealth);

/**
 * @openapi
 * /api/system/config:
 *   get:
 *     summary: Fetch system configuration
 *     tags: [System]
 *   put:
 *     summary: Update system configuration
 *     tags: [System]
 */
router.get('/config', getConfig);
router.put('/config', updateConfig);

/**
 * @openapi
 * /api/system/audit-logs:
 *   get:
 *     summary: Fetch system audit logs
 *     tags: [System]
 */
router.get('/audit-logs', getAuditLogs);

module.exports = router;
