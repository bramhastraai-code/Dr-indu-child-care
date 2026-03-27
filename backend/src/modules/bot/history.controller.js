/**
 * Bot Hub — Chat History Controller
 *
 * Provides a unified chat history per patient / WhatsApp number using:
 *  1. BotChatHistory  — inbound user messages + bot replies logged by the bot
 *
 * Routes:
 *   GET /api/bot/history/patient/:patient_id   — by patient_id
 *   GET /api/bot/history/wa/:wa_id             — by WhatsApp number (raw or hashed)
 *   GET /api/bot/history/search                — ?mobile=&patient_id=&limit=&page=
 */

const BotChatHistory = require('../../models/BotChatHistory');
const Patient = require('../../models/Patient');
const { normalizePhone, normalizeWaId } = require('../../utils/helpers');
const { hashField, decrypt } = require('../../utils/encryption');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert a BotChatHistory doc to a unified message shape.
 */
const mapInbound = (doc) => ({
    _id: doc._id,
    source: 'bot',
    sender: doc.sender,           // 'user' | 'bot'
    message: doc.message,
    message_type: 'CHAT',
    status: 'DELIVERED',
    wa_id: doc.wa_id,
    timestamp: doc.timestamp,
    created_at: doc.timestamp
});

// ── GET /api/bot/history/patient/:patient_id ───────────────────────────────

exports.getHistoryByPatientId = async (req, res) => {
    try {
        const { patient_id } = req.params;
        let { limit = DEFAULT_LIMIT, page = 1 } = req.query;
        limit = Math.min(parseInt(limit, 10) || DEFAULT_LIMIT, MAX_LIMIT);
        page = Math.max(parseInt(page, 10) || 1, 1);

        const patient = await Patient.findOne({ patient_id, is_deleted: false }).lean();
        if (!patient) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }

        // Resolve wa_id (may be encrypted)
        let rawWaId = patient.wa_id;
        try { rawWaId = decrypt(rawWaId); } catch (_) { /* raw */ }
        const normalizedWaId = String(rawWaId || '').replace(/\D/g, '');

        const skip = (page - 1) * limit;

        const [botMessages, total] = await Promise.all([
            BotChatHistory.find({
                $or: [{ patient_id }, { wa_id: { $in: [normalizedWaId, patient.wa_id] } }]
            }).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),

            BotChatHistory.countDocuments({
                $or: [{ patient_id }, { wa_id: { $in: [normalizedWaId, patient.wa_id] } }]
            })
        ]);

        res.json({
            success: true,
            patient_id,
            patient_name: patient.child_name || patient.first_name || 'Unknown',
            wa_id: normalizedWaId,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
            messages: botMessages.map(mapInbound)
        });
    } catch (err) {
        console.error('[BotHistory] getHistoryByPatientId:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── GET /api/bot/history/wa/:wa_id ─────────────────────────────────────────

exports.getHistoryByWaId = async (req, res) => {
    try {
        const rawWaId = req.params.wa_id;
        let { limit = DEFAULT_LIMIT, page = 1 } = req.query;
        limit = Math.min(parseInt(limit, 10) || DEFAULT_LIMIT, MAX_LIMIT);
        page = Math.max(parseInt(page, 10) || 1, 1);

        const normalizedWaId = String(rawWaId || '').replace(/\D/g, '');
        const wa_hash = hashField(normalizePhone(rawWaId));

        // Try to find the patient for extra context
        const patient = await Patient.findOne({ wa_hash, is_deleted: false }).lean();

        const skip = (page - 1) * limit;
        const query = {
            $or: [
                { wa_id: normalizedWaId },
                ...(patient ? [{ patient_id: patient.patient_id }] : [])
            ]
        };

        const [botMessages, total] = await Promise.all([
            BotChatHistory.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
            BotChatHistory.countDocuments(query)
        ]);

        res.json({
            success: true,
            wa_id: normalizedWaId,
            patient_id: patient?.patient_id || null,
            patient_name: patient?.child_name || patient?.first_name || null,
            is_registered: !!patient,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
            messages: botMessages.map(mapInbound)
        });
    } catch (err) {
        console.error('[BotHistory] getHistoryByWaId:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── GET /api/bot/history/search?mobile=&patient_id=&limit=&page= ───────────

exports.searchHistory = async (req, res) => {
    try {
        const { mobile, patient_id, limit: lq = DEFAULT_LIMIT, page: pg = 1 } = req.query;
        const limit = Math.min(parseInt(lq, 10) || DEFAULT_LIMIT, MAX_LIMIT);
        const page = Math.max(parseInt(pg, 10) || 1, 1);

        if (!mobile && !patient_id) {
            return res.status(400).json({
                success: false,
                message: 'Provide at least one of: mobile, patient_id'
            });
        }

        // Delegate to the correct sub-handler
        if (patient_id) {
            req.params = { patient_id };
            req.query = { limit, page };
            return exports.getHistoryByPatientId(req, res);
        }

        req.params = { wa_id: mobile };
        req.query = { limit, page };
        return exports.getHistoryByWaId(req, res);
    } catch (err) {
        console.error('[BotHistory] searchHistory:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── GET /api/bot/history/recent — latest N conversations across all patients ─

exports.getRecentConversations = async (req, res) => {
    try {
        let { limit = 20, page = 1 } = req.query;
        limit = Math.min(parseInt(limit, 10) || 20, 100);
        page = Math.max(parseInt(page, 10) || 1, 1);
        const skip = (page - 1) * limit;

        // Group by wa_id, get latest message per conversation
        const conversations = await BotChatHistory.aggregate([
            { $sort: { timestamp: -1 } },
            {
                $group: {
                    _id: '$wa_id',
                    last_message: { $first: '$message' },
                    last_sender: { $first: '$sender' },
                    last_timestamp: { $first: '$timestamp' },
                    patient_id: { $first: '$patient_id' },
                    is_registered: { $first: '$is_registered' },
                    user_name: { $first: '$user_name' },
                    message_count: { $sum: 1 }
                }
            },
            { $sort: { last_timestamp: -1 } },
            { $skip: skip },
            { $limit: limit }
        ]);

        res.json({
            success: true,
            total: conversations.length,
            page,
            limit,
            conversations
        });
    } catch (err) {
        console.error('[BotHistory] getRecentConversations:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
