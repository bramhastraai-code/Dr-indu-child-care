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

// Protected by API Key or JWT
router.get('/', auth, getConfig);
router.patch('/', auth, updateConfig);

module.exports = router;
