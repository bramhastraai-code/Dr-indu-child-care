const express = require('express');
const router = express.Router();
const { sendWhatsApp } = require('./whatsapp.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');

router.use(auth);

// Outbound WhatsApp messaging
router.post('/send', authorize(['bot_service', 'superadmin', 'admin']), sendWhatsApp);

module.exports = router;
