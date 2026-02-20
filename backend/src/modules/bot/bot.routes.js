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

// Bot Session Management
router.get('/interactions/unregistered', authorize(['superadmin', 'admin', 'staff']), getUnregisteredInteractions);
router.get('/session/:wa_id', authorize(['bot_service', 'superadmin', 'admin', 'staff']), getSession);
router.get('/session/:wa_id/history', authorize(['bot_service', 'superadmin', 'admin', 'staff']), getSessionHistory);
router.post('/session/create', authorize(['bot_service', 'superadmin']), createSession);
router.patch('/session/update', authorize(['bot_service', 'superadmin']), updateSession);
router.post('/session/close', authorize(['bot_service', 'superadmin']), closeSession);

// Bot Chat History
router.post('/chat/log', authorize(['bot_service', 'superadmin']), logChat);
router.get('/chat/history/:wa_id', authorize(['bot_service', 'superadmin', 'admin', 'staff']), getChatHistory);

// Bot Escalation Management
router.post('/escalate', authorize(['bot_service', 'superadmin']), escalateSession);
router.get('/escalations', authorize(['superadmin', 'admin', 'staff']), getEscalations);
router.patch('/escalations/:id', authorize(['superadmin', 'admin', 'staff']), resolveEscalation);

// Bot Message Logging (Internal)
router.post('/message/log', authorize(['bot_service', 'superadmin']), logMessage);

module.exports = router;
