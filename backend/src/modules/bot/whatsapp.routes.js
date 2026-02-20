const express = require('express');
const router = express.Router();
const { sendWhatsApp } = require('./whatsapp.controller');

// Outbound WhatsApp messaging
router.post('/send', sendWhatsApp);

module.exports = router;
