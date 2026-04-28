const express = require('express');
const router = express.Router();
const { getReferralTargets } = require('./referrals.controller');

router.get('/targets', getReferralTargets);

module.exports = router;
