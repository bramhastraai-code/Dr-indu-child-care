const express = require('express');
const router = express.Router();
const { submitFeedback, getFeedback } = require('./feedback.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');

// POST /api/feedback is public
router.post('/', submitFeedback);

// GET /api/feedback — Public
router.get('/', getFeedback);

module.exports = router;
