const express = require('express');
const router = express.Router();
const { sendWhatsApp } = require('./whatsapp.controller');

// All routes are now public for external integrations like n8n
// Outbound WhatsApp messaging
router.post('/send', sendWhatsApp);

module.exports = router;
