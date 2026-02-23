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

const authorize = require('../../middleware/rbac');
const auth = require('../../middleware/auth');
const rateLimit = require('express-rate-limit');

const botLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 100, // 100 requests per hour per WA ID
    keyGenerator: (req) => req.body.wa_id || req.body.wa_number || req.ip,
    message: { success: false, error_code: 'BOT_RATE_LIMIT', message: 'Rate limit exceeded for this WhatsApp ID' }
});

router.use(botLimiter);

// Public bot integration routes (for n8n / WhatsApp automation)
router.get('/interactions/unregistered', getUnregisteredInteractions);
router.get('/session/:wa_id', getSession);
router.post('/session/create', createSession);
router.patch('/session/update', updateSession);

router.post('/chat/log', logChat);
router.get('/chat/history/:wa_id', getChatHistory);

router.post('/escalate', escalateSession);

// Protected dashboard/internal routes
router.use(auth);

// Bot Session Management
router.get('/session/:wa_id/history', authorize(['bot_service', 'superadmin', 'admin', 'staff']), getSessionHistory);
router.post('/session/close', authorize(['bot_service', 'superadmin']), closeSession);

// Bot Escalation Management
router.get('/escalations', authorize(['superadmin', 'admin', 'staff']), getEscalations);
router.patch('/escalations/:id', authorize(['superadmin', 'admin', 'staff']), resolveEscalation);

// Bot Message Logging (Internal)
router.post('/message/log', authorize(['bot_service', 'superadmin']), logMessage);

module.exports = router;
