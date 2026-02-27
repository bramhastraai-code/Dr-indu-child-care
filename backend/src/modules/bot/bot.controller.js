const BotSession = require('../../models/BotSession');
const Escalation = require('../../models/Escalation');
const MessageLog = require('../../models/MessageLog');
const BotChatHistory = require('../../models/BotChatHistory');
const Patient = require('../../models/Patient');
const audit = require('../../utils/audit');
const { normalizeWaId, normalizePhone } = require('../../utils/helpers');
const { hashField } = require('../../utils/encryption');

// Helper: normalise wa_id — accept wa_id or wa_number in body
const getWaId = (body) => body ? normalizeWaId(body.wa_id || body.wa_number) : null;

// Helper: resolve patient by wa_id/mobile with normalized + hash lookup
const findPatientByWa = async (waId) => {
    const normalized = normalizeWaId(waId);
    const mobile = normalizePhone(waId);
    const mobileHash = hashField(mobile);

    return Patient.findOne({
        wa_hash: mobileHash,
        is_deleted: false
    });
};

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
        const { session_id, source } = req.body || {};
        if (!wa_id) return res.status(400).json({ success: false, message: 'wa_id is required' });

        // Close others
        await BotSession.updateMany({ wa_id, is_active: true }, { is_active: false });

        // Check if patient exists (skip registration if found)
        const existingPatient = await findPatientByWa(wa_id);

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
        const { current_state, session_data, retry_count, patient_id } = req.body || {};
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
        const { reason } = req.body || {};
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
        const { reason, failed_state, retry_count, session_id } = req.body || {};

        if (!reason && !failed_state) {
            return res.status(400).json({ success: false, message: 'reason or failed_state is required for escalation' });
        }

        const finalReason = reason || `Bot escalated from state: ${failed_state || 'UNKNOWN'}`;

        const session = await BotSession.findOneAndUpdate(
            { wa_id, is_active: true },
            { is_active: false, current_state: 'ERR_ESCALATED' }
        );

        const escalation = await Escalation.create({
            wa_id,
            session_id: session_id || (session ? session.session_id : null),
            reason: finalReason,
            failed_state,
            retry_count
        });

        await audit({
            event_type: 'BOT_ESCALATION',
            entity_type: 'bot_session',
            entity_id: session_id || (session ? session.session_id : wa_id),
            actor: 'BOT',
            actor_type: 'BOT',
            new_value: { reason: finalReason, failed_state }
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
        const { to, wa_id, template_name, template_params, status, provider_response } = req.body || {};
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

// @desc    Log chat message — logs ALL numbers (registered AND unregistered)
// @route   POST /api/bot/chat/log
exports.logChat = async (req, res) => {
    try {
        const { wa_id, wa_number, user_name, message, sender = 'user' } = req.body || {};
        const target = normalizeWaId(wa_id || wa_number);

        if (!target || !message) {
            return res.status(400).json({ success: false, message: 'wa_id and message are required' });
        }

        // Lookup patient — but do NOT gate on this. Log regardless.
        const patient = await findPatientByWa(target);
        const is_registered = !!patient;

        await BotChatHistory.create({
            wa_id: target,
            user_name: user_name || (patient ? (patient.parent_name || patient.child_name || 'User') : 'Unknown'),
            message,
            sender,          // 'user' | 'bot'
            is_registered,
            patient_id: patient ? patient.patient_id : null
        });

        res.status(201).json({
            success: true,
            message: 'Chat logged',
            is_registered,
            patient_id: patient ? patient.patient_id : null
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get chat history — works for registered AND unregistered numbers
// @route   GET /api/bot/chat/history/:wa_id
exports.getChatHistory = async (req, res) => {
    try {
        const target = normalizeWaId(req.params.wa_id);
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);

        // Try to find patient for enrichment — OK if not found
        const patient = await findPatientByWa(target);

        const history = await BotChatHistory.find({ wa_id: target })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();

        res.json({
            success: true,
            wa_id: target,
            is_registered: !!patient,
            patient_id: patient ? patient.patient_id : null,
            child_name: patient ? (patient.child_name || patient.full_name || null) : null,
            total: history.length,
            data: history
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get unregistered interactions — numbers that chatted but are NOT registered patients
// @route   GET /api/bot/interactions/unregistered
// @access  Public
exports.getUnregisteredInteractions = async (req, res) => {
    try {
        const { limit = 50, page = 1 } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, parseInt(limit));

        // Pull from BotChatHistory where is_registered = false, grouped per wa_id
        const [chatLeads, countResult] = await Promise.all([
            BotChatHistory.aggregate([
                { $match: { is_registered: false } },
                {
                    $group: {
                        _id: '$wa_id',
                        message_count: { $sum: 1 },
                        first_contact: { $min: '$timestamp' },
                        last_seen: { $max: '$timestamp' },
                        messages: {
                            $push: { message: '$message', sender: '$sender', timestamp: '$timestamp' }
                        }
                    }
                },
                { $sort: { last_seen: -1 } },
                { $skip: (pageNum - 1) * limitNum },
                { $limit: limitNum },
                {
                    $project: {
                        _id: 0,
                        wa_id: '$_id',
                        message_count: 1,
                        first_contact: 1,
                        last_seen: 1,
                        latest_messages: { $slice: ['$messages', -5] }
                    }
                }
            ]),
            BotChatHistory.aggregate([
                { $match: { is_registered: false } },
                { $group: { _id: '$wa_id' } },
                { $count: 'total' }
            ])
        ]);

        // Enrich with active session data if present
        const waIds = chatLeads.map(l => l.wa_id);
        const activeSessions = await BotSession.find({
            wa_id: { $in: waIds },
            is_active: true,
            expires_at: { $gt: new Date() }
        }).select('wa_id current_state created_at last_activity_at').lean();

        const sessionMap = {};
        activeSessions.forEach(s => { sessionMap[s.wa_id] = s; });

        const enriched = chatLeads.map(lead => ({
            ...lead,
            is_registered: false,
            has_active_session: !!sessionMap[lead.wa_id],
            bot_state: sessionMap[lead.wa_id]?.current_state || null,
            session_started_at: sessionMap[lead.wa_id]?.created_at || null
        }));

        const total = countResult[0]?.total || 0;
        res.json({
            success: true,
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum),
            data: enriched
        });
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
