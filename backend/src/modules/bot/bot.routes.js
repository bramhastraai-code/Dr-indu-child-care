const express = require('express');
const router = express.Router();
const {
    getSession,
    createSession,
    updateSession,
    closeSession,
    escalateSession,
    logMessage,
    getSessionHistory,
    getEscalations,
    resolveEscalation,
    getUnregisteredInteractions,
    logChat,
    getChatHistory
} = require('./bot.controller');

const rateLimit = require('express-rate-limit');

const botLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 100, // 100 requests per hour per WA ID
    keyGenerator: (req) => req.body.wa_id || req.body.wa_number || req.ip,
    message: { success: false, error_code: 'BOT_RATE_LIMIT', message: 'Rate limit exceeded for this WhatsApp ID' }
});

router.use(botLimiter);

// All routes are now public for external integrations like n8n
router.get('/interactions/unregistered', getUnregisteredInteractions);
router.get('/session/:wa_id', getSession);
router.post('/session/create', createSession);
router.patch('/session/update', updateSession);

router.post('/chat/log', logChat);
router.get('/chat/history/:wa_id', getChatHistory);

router.post('/escalate', escalateSession);

// Bot Session Management
router.get('/session/:wa_id/history', getSessionHistory);
router.post('/session/close', closeSession);

// Bot Escalation Management
router.get('/escalations', getEscalations);
router.patch('/escalations/:id', resolveEscalation);

// Bot Message Logging
router.post('/message/log', logMessage);

module.exports = router;
