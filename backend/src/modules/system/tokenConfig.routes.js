const express = require('express');
const router = express.Router();
const {
    getTokenConfig,
    updateTokenConfig,
    addDateOverride
} = require('./tokenConfig.controller');

const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');

// All token configuration endpoints are now public

router.get('/:doctor_id', getTokenConfig);
router.post('/', updateTokenConfig);
router.post('/override', addDateOverride);

module.exports = router;
