const express = require('express');
const router = express.Router();
const { getConfig, updateConfig } = require('./system.controller');
const auth = require('../../middleware/auth');

/**
 * @openapi
 * /api/config:
 *   get:
 *     summary: Fetch system configuration
 *     tags: [Config]
 *   patch:
 *     summary: Modify system configuration
 *     tags: [Config]
 */

// Publicly accessible via endpoints
router.get('/', getConfig);
router.patch('/', updateConfig);

module.exports = router;
