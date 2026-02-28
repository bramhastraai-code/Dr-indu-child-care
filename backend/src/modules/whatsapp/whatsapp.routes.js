const express = require('express');
const router = express.Router();
const {
    doctorLateAlert,
    doctorArrivedAlert,
    rescheduleNotification,
    tokenCallReminder,
    completionNotice,
    getMessageStatus,
    getBatchStatus,
    getPendingMessages,
    updateMessageStatus
} = require('./whatsapp.controller');
const auth = require('../../middleware/auth');

router.use(auth);

// All public — no auth

// ── Doctor events ─────────────────────────────────────────────────────
router.post('/doctor/late-alert', doctorLateAlert);
router.post('/doctor/arrived-alert', doctorArrivedAlert);

// ── Appointment events ───────────────────────────────────────────────
router.post('/appointment/reschedule-notification', rescheduleNotification);
router.post('/appointment/completion-notice', completionNotice);

// ── Token events ─────────────────────────────────────────────────────
router.post('/token/call-reminder', tokenCallReminder);

// ── Message management (for n8n integration) ─────────────────────────
router.get('/messages/pending', getPendingMessages);
router.get('/messages/status/:message_id', getMessageStatus);
router.get('/messages/batch/:batch_id', getBatchStatus);
router.patch('/messages/:queue_id/status', updateMessageStatus);

module.exports = router;
