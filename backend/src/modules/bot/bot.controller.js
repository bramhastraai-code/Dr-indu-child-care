const BotSession = require('../../models/BotSession');
const Escalation = require('../../models/Escalation');
const MessageLog = require('../../models/MessageLog');
const BotChatHistory = require('../../models/BotChatHistory');
const Patient = require('../../models/Patient');
const audit = require('../../utils/audit');
const { normalizeWaId } = require('../../utils/helpers');

// Helper: normalise wa_id — accept wa_id or wa_number in body
const getWaId = (body) => normalizeWaId(body.wa_id || body.wa_number);

// @desc    Fetch active session
// @route   GET /api/bot/session/:wa_id
exports.getSession = async (req, res) => {
    try {
        const wa_id = normalizeWaId(req.params.wa_id);
        const session = await BotSession.findOne({
            wa_id,
            is_active: true,
            expires_at: { $gt: new Date() }
        }).sort({ created_at: -1 });

        if (!session) return res.status(404).json({ success: false, message: 'No active session' });
        res.json({ success: true, data: session });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Create session
// @route   POST /api/bot/session/create
exports.createSession = async (req, res) => {
    try {
        const wa_id = getWaId(req.body);
        const { session_id, source } = req.body;
        if (!wa_id) return res.status(400).json({ success: false, message: 'wa_id is required' });

        // Close others
        await BotSession.updateMany({ wa_id, is_active: true }, { is_active: false });

        // Check if patient exists (skip registration if found)
        const existingPatient = await Patient.findOne({
            $or: [{ parent_mobile: wa_id }, { wa_id: wa_id }],
            is_deleted: false
        });

        const initialState = existingPatient ? 'S40_MAIN_MENU' : 'S00_WELCOME';

        const session = await BotSession.create({
            session_id: session_id || `SES-${Date.now()}`,
            wa_id,
            patient_id: existingPatient ? existingPatient.patient_id : null,
            current_state: initialState,
            session_data: {
                source: source || 'WATI',
                existing_patient: !!existingPatient
            },
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });

        res.status(201).json({ success: true, data: session });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Update session
// @route   PATCH /api/bot/session/update
exports.updateSession = async (req, res) => {
    try {
        const wa_id = getWaId(req.body);
        const { current_state, session_data, retry_count, patient_id } = req.body;
        if (!wa_id) return res.status(400).json({ success: false, message: 'wa_id is required' });

        const session = await BotSession.findOneAndUpdate(
            { wa_id, is_active: true },
            {
                $set: {
                    current_state,
                    session_data,
                    retry_count,
                    patient_id,
                    last_activity_at: new Date(),
                    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
                }
            },
            { new: true }
        );

        if (!session) return res.status(404).json({ success: false, message: 'No active session found' });
        res.json({ success: true, data: session });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Close session
// @route   POST /api/bot/session/close
exports.closeSession = async (req, res) => {
    try {
        const wa_id = getWaId(req.body);
        const { reason } = req.body;
        if (!wa_id) return res.status(400).json({ success: false, message: 'wa_id is required' });

        const result = await BotSession.updateMany(
            { wa_id, is_active: true },
            { is_active: false, expires_at: new Date(), current_state: reason || 'CLOSED' }
        );

        res.json({ success: true, message: `Session closed: ${reason || 'COMPLETED'}`, modified: result.modifiedCount });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Escalate session
// @route   POST /api/bot/escalate
exports.escalateSession = async (req, res) => {
    try {
        const wa_id = getWaId(req.body);
        const { reason, failed_state, retry_count, session_id } = req.body;

        const session = await BotSession.findOneAndUpdate(
            { wa_id, is_active: true },
            { is_active: false, current_state: 'ERR_ESCALATED' }
        );

        const escalation = await Escalation.create({
            wa_id,
            session_id: session_id || (session ? session.session_id : null),
            reason,
            failed_state,
            retry_count
        });

        await audit({
            event_type: 'BOT_ESCALATION',
            entity_type: 'bot_session',
            entity_id: session_id || (session ? session.session_id : wa_id),
            actor: 'BOT',
            actor_type: 'BOT',
            new_value: { reason, failed_state }
        });

        res.json({ success: true, data: escalation });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Log message
// @route   POST /api/bot/message/log
exports.logMessage = async (req, res) => {
    try {
        const { to, wa_id, template_name, template_params, status, provider_response } = req.body;
        const target = normalizeWaId(to || wa_id);
        const log = await MessageLog.create({
            wa_id: target,
            template_name,
            template_params,
            status,
            provider_response
        });
        res.status(201).json({ success: true, data: log });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get unresolved escalations
// @route   GET /api/bot/escalations
exports.getEscalations = async (req, res) => {
    try {
        const escalations = await Escalation.find({ resolved: false }).sort({ escalated_at: 1 });
        res.json({ success: true, data: escalations });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Resolve escalation
// @route   PATCH /api/bot/escalations/:id
exports.resolveEscalation = async (req, res) => {
    try {
        const actor = req.user ? req.user.username : 'SECRETARY';
        const escalation = await Escalation.findByIdAndUpdate(
            req.params.id,
            { resolved: true, resolved_at: new Date(), resolved_by: actor },
            { new: true }
        );

        if (!escalation) return res.status(404).json({ success: false, message: 'Escalation not found' });

        await audit({
            event_type: 'ESCALATION_RESOLVED',
            entity_type: 'bot_escalation',
            entity_id: req.params.id,
            actor,
            actor_type: req.user ? req.user.role : 'SECRETARY'
        });

        res.json({ success: true, data: escalation });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Log chat message
// @route   POST /api/bot/chat/log
exports.logChat = async (req, res) => {
    try {
        const { wa_id, wa_number, user_name, message } = req.body;
        const target = normalizeWaId(wa_id || wa_number);
        if (!target || !message) {
            return res.status(400).json({ success: false, message: 'wa_id and message are required' });
        }

        // Check if patient is registered
        const patient = await Patient.findOne({
            $or: [{ parent_mobile: target }, { wa_id: target }],
            is_deleted: false
        });

        if (!patient) {
            return res.status(200).json({ success: true, message: 'Chat ignored (not registered)' });
        }

        await BotChatHistory.create({
            wa_id: target,
            user_name: user_name || patient.parent_name || 'User',
            message,
            is_registered: true
        });

        res.status(201).json({ success: true, message: 'Chat logged' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get chat history
// @route   GET /api/bot/chat/history/:wa_id
exports.getChatHistory = async (req, res) => {
    try {
        const wa_id = normalizeWaId(req.params.wa_id);
        const history = await BotChatHistory.find({ wa_id })
            .sort({ timestamp: -1 })
            .limit(10);

        res.json({ success: true, data: history });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get unregistered interactions (no patient_id)
// @route   GET /api/bot/interactions/unregistered
exports.getUnregisteredInteractions = async (req, res) => {
    try {
        const sessions = await BotSession.find({
            patient_id: null,
            is_active: true,
            expires_at: { $gt: new Date() }
        })
            .sort({ last_activity_at: -1 })
            .limit(100);

        res.json({ success: true, data: sessions });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get session history
// @route   GET /api/bot/session/:wa_id/history
exports.getSessionHistory = async (req, res) => {
    try {
        const wa_id = normalizeWaId(req.params.wa_id);
        const sessions = await BotSession.find({ wa_id }).sort({ created_at: -1 }).limit(10);
        res.json({ success: true, data: sessions });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
