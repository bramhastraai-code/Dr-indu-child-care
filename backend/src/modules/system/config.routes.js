const express = require('express');
const router = express.Router();
const { getConfig, updateConfig } = require('./system.controller');

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
const auth = require('../../middleware/auth');
const jwtOnly = require('../../middleware/jwtOnly');
const authorize = require('../../middleware/rbac');

router.use(auth, jwtOnly, authorize('superadmin'));

router.get('/', getConfig);
router.patch('/', updateConfig);

module.exports = router;
