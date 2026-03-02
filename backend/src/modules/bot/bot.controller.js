const BotSession = require('../../models/BotSession');
const Escalation = require('../../models/Escalation');
const MessageLog = require('../../models/MessageLog');
const BotChatHistory = require('../../models/BotChatHistory');
const Patient = require('../../models/Patient');
const audit = require('../../utils/audit');
const { normalizeWaId, normalizePhone } = require('../../utils/helpers');
const { hashField } = require('../../utils/encryption');

const WORKFLOW_STAGES = [
    { stage_number: 1, name: "General Talk", key: "GENERAL_TALK" },
    { stage_number: 2, name: "Patient Registration", key: "PATIENT_REGISTRATION" },
    { stage_number: 3, name: "Appointment Booking", key: "APPOINTMENT_BOOKING" },
    { stage_number: 4, name: "Appointment Reminder", key: "APPOINTMENT_REMINDER" },
    { stage_number: 5, name: "Appointment Completed", key: "APPOINTMENT_COMPLETED" }
];




// Helper: normalise wa_id — accept wa_id or wa_number in body
const getWaId = (body) => body ? normalizeWaId(body.wa_id || body.wa_number) : null;

// Helper: resolve patients by wa_id/mobile with normalized + hash lookup
const findPatientsByWa = async (waId) => {
    const mobile = normalizePhone(waId);
    const mobileHash = hashField(mobile);

    return Patient.find({
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

        // Check if patients exist (handles siblings)
        const patients = await findPatientsByWa(wa_id);
        const existingPatient = patients.length > 0 ? patients[0] : null;

        const initialState = patients.length > 0 ? 'S40_MAIN_MENU' : 'S00_WELCOME';

        const session = await BotSession.create({
            session_id: session_id || `SES-${Date.now()}`,
            wa_id,
            patient_id: patients.length === 1 ? patients[0].patient_id : null,
            current_state: initialState,
            stage_number: req.body.stage_number || (patients.length > 0 ? 1 : 1),
            session_data: {
                source: source || 'WATI',
                existing_patient: patients.length > 0,
                is_sibling: patients.length > 1,
                patient_matches: patients.map(p => ({ patient_id: p.patient_id, child_name: p.child_name }))
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
        const { current_state, session_data, retry_count, patient_id, stage_number } = req.body || {};
        if (!wa_id) return res.status(400).json({ success: false, message: 'wa_id is required' });

        const session = await BotSession.findOneAndUpdate(
            { wa_id, is_active: true },
            {
                $set: {
                    current_state,
                    session_data,
                    retry_count,
                    patient_id,
                    stage_number,
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
        const patients = await findPatientsByWa(target);
        const is_registered = patients.length > 0;
        const patient = patients[0] || null;

        await BotChatHistory.create({
            wa_id: target,
            user_name: user_name || (patient ? (patient.parent_name || patient.child_name || 'User') : 'Unknown'),
            message,
            sender,          // 'user' | 'bot'
            is_registered,
            patient_id: (patients.length === 1 && patient) ? patient.patient_id : null,
            metadata: {
                matches: patients.map(p => p.patient_id)
            }
        });

        res.status(201).json({
            success: true,
            message: 'Chat logged',
            is_registered,
            patient_id: (patients.length === 1 && patient) ? patient.patient_id : null,
            total_matches: patients.length
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
        const patients = await findPatientsByWa(target);
        const patient = patients[0] || null;

        const history = await BotChatHistory.find({ wa_id: target })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();

        res.json({
            success: true,
            wa_id: target,
            is_registered: patients.length > 0,
            patient_id: patients.length === 1 ? (patient?.patient_id || null) : null,
            total_matches: patients.length,
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

// @desc    Log Bot reply (Single record per number - Upsert)
// @route   POST /api/bot/chat/bot-reply
exports.logBotReply = async (req, res) => {
    try {
        const { wa_id, wa_number, message, bot_name = 'Bot' } = req.body || {};
        const target = normalizeWaId(wa_id || wa_number);

        if (!target || !message) {
            return res.status(400).json({ success: false, message: 'wa_id and message are required' });
        }

        const chat = await BotChatHistory.findOneAndUpdate(
            { wa_id: target, sender: 'bot' },
            { $set: { message, user_name: bot_name, timestamp: new Date() } },
            { upsert: true, new: true, lean: true }
        );

        res.status(201).json({
            success: true,
            data: {
                wa_id: chat.wa_id,
                message: chat.message,
                bot_name: chat.user_name,
                timestamp: chat.timestamp
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get Bot reply (Returns single clean object)
// @route   GET /api/bot/chat/bot-replies/:wa_id
exports.getBotReplies = async (req, res) => {
    try {
        const target = normalizeWaId(req.params.wa_id);
        const reply = await BotChatHistory.findOne({ wa_id: target, sender: 'bot' }).lean();

        if (!reply) {
            return res.status(404).json({ success: false, message: 'No bot reply found' });
        }

        res.json({
            success: true,
            data: {
                wa_id: reply.wa_id,
                message: reply.message,
                bot_name: reply.user_name,
                timestamp: reply.timestamp
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Simple Store Message (No lookups)
// @route   POST /api/bot/messages
exports.saveMessage = async (req, res) => {
    try {
        const { wa_id, message, sender = 'user' } = req.body || {};
        if (!wa_id || !message) {
            return res.status(400).json({ success: false, message: 'wa_id and message are required' });
        }

        const chat = await BotChatHistory.create({
            wa_id: normalizeWaId(wa_id),
            message,
            sender,
            user_name: sender === 'bot' ? 'Bot' : 'User'
        });

        res.status(201).json({ success: true, data: chat });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Simple Get Messages
// @route   GET /api/bot/messages/:wa_id
exports.getMessages = async (req, res) => {
    try {
        const wa_id = normalizeWaId(req.params.wa_id);
        const messages = await BotChatHistory.find({ wa_id }).sort({ timestamp: -1 }).limit(50);
        res.json({ success: true, data: messages });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Update Message by _id
// @route   PATCH /api/bot/messages/:message_id
exports.updateMessage = async (req, res) => {
    try {
        const { message_id } = req.params;
        const { message } = req.body || {};
        if (!message) return res.status(400).json({ success: false, message: 'Updated message content is required' });

        const updated = await BotChatHistory.findByIdAndUpdate(
            message_id,
            { $set: { message, updated_at: new Date() } },
            { new: true }
        );

        if (!updated) return res.status(404).json({ success: false, message: 'Message not found' });
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};


// @desc    Get comprehensive workflow status (User Progress)
// @route   GET /api/bot/workflow-status/:wa_id
exports.getBotWorkflowStatus = async (req, res) => {
    try {
        const wa_id = normalizeWaId(req.params.wa_id);
        const session = await BotSession.findOne({
            wa_id,
            is_active: true,
            expires_at: { $gt: new Date() }
        }).sort({ created_at: -1 });

        const currentStageNumber = session ? session.stage_number : 0;
        const currentStageInfo = WORKFLOW_STAGES.find(s => s.stage_number === currentStageNumber) || {
            name: "Not Started",
            key: "IDLE"
        };

        const patients = await findPatientsByWa(wa_id);
        const is_registered = patients.length > 0;

        res.status(200).json({
            success: true,
            wa_id,
            is_registered,
            current_stage: {
                number: currentStageNumber,
                name: currentStageInfo.name,
                key: currentStageInfo.key,
                state: session ? session.current_state : "IDLE",
                last_active: session ? session.last_activity_at : null
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
