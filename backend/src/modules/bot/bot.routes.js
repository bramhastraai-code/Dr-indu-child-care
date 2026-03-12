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
    getChatHistory,
    logBotReply,
    getBotReplies,
    saveMessage,
    getMessages,
    updateMessage,
    getDoctorsMinimal,
    getDoctorAvailabilityBot,
    getAppointmentsByWaBot,
    getTokenStatusBot
} = require('./bot.controller');
const auth = require('../../middleware/auth');

// ── Public Routes (No Auth) ──────────────────────────────────────────
router.get('/doctors', getDoctorsMinimal);
router.get('/doctor-availability/:doctor_id', getDoctorAvailabilityBot);
router.get('/appointments/by-wa/:wa_id', getAppointmentsByWaBot);
router.get('/appointments/token-status/:token', getTokenStatusBot);

// ── Public (bot integration) ────────────────────────────────────────
router.get('/session/:wa_id', getSession);
router.post('/session/create', createSession);
router.patch('/session/update', updateSession);
router.post('/session/close', closeSession);
router.get('/session/:wa_id/history', getSessionHistory);

router.post('/chat/log', logChat);
router.post('/chat/bot-reply', logBotReply);
router.get('/chat/bot-replies/:wa_id', getBotReplies);
router.get('/chat/history', getChatHistory);

// Simple Messages
router.post('/messages', saveMessage);
router.get('/messages/:wa_id', getMessages);
router.patch('/messages/:message_id', updateMessage);

router.post('/escalate', escalateSession);
router.post('/message/log', logMessage);

// ── Public (no auth) ─────────────────────────────────────────────
router.get('/interactions/unregistered', getUnregisteredInteractions);
router.get('/escalations', getEscalations);
router.patch('/escalations/:escalation_id/resolve', resolveEscalation);

router.use(auth);

// ── Analytics (Public) ───────────────────────────────────────────
router.get('/analytics/daily', async (req, res) => {
    try {
        const BotSession = require('../../models/BotSession');
        const BotChatHistory = require('../../models/BotChatHistory');
        const Escalation = require('../../models/Escalation');
        const Appointment = require('../../models/Appointment');
        const Patient = require('../../models/Patient');

        const { date } = req.query;
        const targetDate = date ? new Date(date) : new Date();
        const start = new Date(targetDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(targetDate);
        end.setHours(23, 59, 59, 999);

        const [totalInteractions, newRegistrations, appointmentsBooked, escalations] = await Promise.all([
            BotChatHistory.countDocuments({ timestamp: { $gte: start, $lte: end } }),
            Patient.countDocuments({ registered_at: { $gte: start, $lte: end }, registration_source: 'whatsapp' }),
            Appointment.countDocuments({ created_at: { $gte: start, $lte: end }, booking_source: 'whatsapp' }),
            Escalation.countDocuments({ escalated_at: { $gte: start, $lte: end } })
        ]);

        res.json({
            success: true,
            date: targetDate.toISOString().split('T')[0],
            data: {
                total_interactions: totalInteractions,
                new_registrations: newRegistrations,
                appointments_booked: appointmentsBooked,
                escalations,
                average_session_duration_minutes: null, // Would need session tracking
                completion_rate: null,
                top_queries: []
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// router.get('/workflow-status/:wa_id', getBotWorkflowStatus);

module.exports = router;
