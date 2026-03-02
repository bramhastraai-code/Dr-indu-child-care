const BotSession = require('../../models/BotSession');
const Escalation = require('../../models/Escalation');
const MessageLog = require('../../models/MessageLog');
const BotChatHistory = require('../../models/BotChatHistory');
const Patient = require('../../models/Patient');
const Doctor = require('../../models/Doctor');
const Appointment = require('../../models/Appointment');
const DoctorAvailability = require('../../models/DoctorAvailability');
const Slot = require('../../models/Slot');
const SlotAvailability = require('../../models/SlotAvailability');
const MRD = require('../../models/MRD');
const audit = require('../../utils/audit');
const { normalizeWaId, normalizePhone, toMidnight, canonicalizeDoctorName, extractMobile } = require('../../utils/helpers');
const { hashField } = require('../../utils/encryption');

const WORKFLOW_STAGES = [
    { name: "General Talk", key: "GENERAL_TALK" },
    { name: "Patient Registration", key: "PATIENT_REGISTRATION" },
    { name: "Appointment Booking", key: "APPOINTMENT_BOOKING" },
    { name: "Appointment Reminder", key: "APPOINTMENT_REMINDER" },
    { name: "Appointment Completed", key: "APPOINTMENT_COMPLETED" }
];




// Helper: normalise wa_id — accept wa_id or wa_number in body
const getWaId = (body) => body ? normalizeWaId(body.wa_id || body.wa_number) : null;

// Helper: enrich appointment with slot and mrd status for bot
const enrichAppointmentBot = async (a) => {
    const [patient, slot, availability, mrdEntry] = await Promise.all([
        Patient.findOne({ patient_id: a.patient_id }),
        Slot.findOne({ slot_id: a.slot_id }),
        SlotAvailability.findOne({ slot_id: a.slot_id, slot_date: a.appointment_date, doctor_name: a.doctor_name }),
        MRD.findOne({ 'entries.appointment_id': a.appointment_id })
    ]);
    return {
        ...a.toObject(),
        child_name: patient?.full_name || patient?.child_name || null,
        parent_name: patient?.parent_name || null,
        parent_wa_id: patient?.wa_id || null,
        parent_mobile: patient?.wa_id || null,
        wa_id: a.wa_id || patient?.wa_id || null,
        formatted_date: a.appointment_date ? a.appointment_date.toISOString().split('T')[0] : null,
        slot_label: availability?.custom_label || slot?.slot_label || slot?.display_label || null,
        start_time: availability?.custom_start_time || slot?.start_time || null,
        end_time: availability?.custom_end_time || slot?.end_time || null,
        session: slot?.session || null,
        has_mrd_entry: !!mrdEntry
    };
};

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
            stage_key: req.body.stage_key || 'GENERAL_TALK',
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
        const { current_state, session_data, retry_count, patient_id, stage_key } = req.body || {};
        if (!wa_id) return res.status(400).json({ success: false, message: 'wa_id is required' });

        const session = await BotSession.findOneAndUpdate(
            { wa_id, is_active: true },
            {
                $set: {
                    current_state,
                    session_data,
                    retry_count,
                    patient_id,
                    stage_key,
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


// @desc    Get minimal doctor list for bot
// @route   GET /api/bot/doctors
exports.getDoctorsMinimal = async (req, res) => {
    try {
        console.log('[INFO] Fetching minimal doctors list for bot');
        const doctors = await Doctor.find({ is_active: true })
            .select('name doctor_id speciality qualification experience -_id')
            .sort({ name: 1 });

        res.json({
            success: true,
            count: doctors.length,
            data: doctors
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get real-time doctor status and queue counts for bot
// @route   GET /api/bot/doctor-availability/:doctor_id
exports.getDoctorAvailabilityBot = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        const { date } = req.query;
        const queryDate = toMidnight(date || new Date());

        const doctor = await Doctor.findOne({ doctor_id });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        let avail = await DoctorAvailability.findOne({ doctor_id, date: queryDate });
        if (!avail && date) {
            avail = { status: 'UNKNOWN', current_token: 0 };
        } else if (!avail) {
            avail = await DoctorAvailability.create({
                doctor_id,
                doctor_name: doctor.name,
                date: queryDate,
                status: 'PRESENT',
                current_token: 0
            });
        }

        const [total, waiting, inProgress, completed] = await Promise.all([
            Appointment.countDocuments({ doctor_id, appointment_date: queryDate, is_deleted: false }),
            Appointment.countDocuments({ doctor_id, appointment_date: queryDate, token_status: 'WAITING' }),
            Appointment.countDocuments({ doctor_id, appointment_date: queryDate, token_status: 'IN_PROGRESS' }),
            Appointment.countDocuments({ doctor_id, appointment_date: queryDate, token_status: 'COMPLETED' })
        ]);

        res.json({
            success: true,
            data: {
                doctor_id,
                doctor_name: doctor.name,
                status: avail.status,
                current_token: avail.current_token,
                eta_minutes: avail.eta_minutes,
                eta_time: avail.eta_time,
                queue: { total, waiting, in_progress: inProgress, completed }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get available slots for bot
// @route   GET /api/bot/slots/available
exports.getAvailableSlotsBot = async (req, res) => {
    try {
        const { doctor_id, date } = req.query;
        if (!doctor_id) return res.status(400).json({ success: false, message: 'doctor_id is required' });

        const queryDate = toMidnight(date || new Date());
        const dayOfWeek = queryDate.getUTCDay();
        const now = new Date();
        const isToday = queryDate.getUTCFullYear() === now.getUTCFullYear() &&
            queryDate.getUTCMonth() === now.getUTCMonth() &&
            queryDate.getUTCDate() === now.getUTCDate();

        const doctor = await Doctor.findOne({ doctor_id, is_active: true });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found or inactive' });

        const allTemplates = await Slot.find({ is_active: true }).sort({ start_time: 1 });

        const doctorSlotIds = doctor.available_slots?.get(dayOfWeek.toString()) || [];
        let todayTemplates = [];
        if (doctorSlotIds.length === 0) {
            todayTemplates = allTemplates.filter(t => {
                const safeName = doctor.name.replace(/\./g, '');
                const perDoctor = t.days_by_doctor?.get(safeName) || t.days_by_doctor?.get(doctor.name);
                const activeDays = (perDoctor && perDoctor.length > 0) ? perDoctor : (t.days_of_week || [0, 1, 2, 3, 4, 5, 6]);
                return activeDays.includes(dayOfWeek);
            });
        } else {
            todayTemplates = allTemplates.filter(t => doctorSlotIds.includes(t.slot_id));
        }

        const dailyAvailability = await SlotAvailability.find({ slot_date: queryDate, doctor_id });
        const statusMap = new Map(dailyAvailability.map(a => [a.slot_id, a]));

        const available = todayTemplates
            .filter(t => {
                const status = statusMap.get(t.slot_id);
                if (status && (status.is_booked || status.blocked_by_admin)) return false;
                if (isToday) {
                    const [h, m] = (status?.custom_start_time || t.start_time).split(':');
                    const slotMins = parseInt(h) * 60 + parseInt(m);
                    const clinicNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
                    const nowMins = clinicNow.getUTCHours() * 60 + clinicNow.getUTCMinutes();
                    if (slotMins < nowMins - 5) return false;
                }
                return true;
            })
            .map(t => {
                const status = statusMap.get(t.slot_id);
                return {
                    slot_id: t.slot_id,
                    label: status?.custom_label || t.slot_label || t.display_label,
                    session: t.session,
                    start_time: status?.custom_start_time || t.start_time,
                    end_time: status?.custom_end_time || t.end_time
                };
            });

        res.json({
            success: true,
            date: queryDate.toISOString().split('T')[0],
            doctor_id,
            doctor_name: doctor.name,
            data: available
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get upcoming appointments by WA for bot
// @route   GET /api/bot/appointments/by-wa/:wa_id
exports.getAppointmentsByWaBot = async (req, res) => {
    try {
        const rawWaId = req.params.wa_id;
        const parsedDays = Number.parseInt(req.query.days, 10);
        const parsedLimit = Number.parseInt(req.query.limit, 10);
        const maxDays = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.min(parsedDays, 90) : null;
        const maxLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : null;
        const wa_hash = hashField(normalizePhone(extractMobile(rawWaId)));

        const patient = await Patient.findOne({
            wa_hash,
            is_deleted: false
        });
        if (!patient) return res.status(404).json({ success: false, message: `No patient found for ${rawWaId}` });

        const today = toMidnight(new Date());
        const dateFilter = { $gte: today };
        if (maxDays) {
            const upper = new Date(today);
            upper.setUTCDate(upper.getUTCDate() + (maxDays - 1));
            dateFilter.$lte = upper;
        }

        let appointmentsQuery = Appointment.find({
            patient_id: patient.patient_id,
            status: { $in: ['BOOKED', 'CONFIRMED'] },
            appointment_date: dateFilter
        }).sort({ appointment_date: 1, slot_id: 1 });
        if (maxLimit) appointmentsQuery = appointmentsQuery.limit(maxLimit);

        const appointments = await appointmentsQuery;

        const enriched = await Promise.all(appointments.map(enrichAppointmentBot));
        res.json({
            success: true,
            patient_id: patient.patient_id,
            child_name: patient.child_name,
            mobile: patient.mobile || extractMobile(rawWaId),
            filters: { days: maxDays, limit: maxLimit },
            data: enriched
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Patient self-check position in queue for bot
// @route   GET /api/bot/appointments/token-status/:token
exports.getTokenStatusBot = async (req, res) => {
    try {
        const { token } = req.params;
        const { doctor_id, date } = req.query;
        if (!doctor_id) return res.status(400).json({ success: false, message: 'doctor_id is required' });

        const queryDate = toMidnight(date || new Date());
        const filter = { token_number: parseInt(token), appointment_date: queryDate, doctor_id };

        const appt = await Appointment.findOne(filter).lean();
        if (!appt) return res.status(404).json({ success: false, message: `Token ${token} not found for this doctor today` });

        // Position in queue: relative to CHECKED_IN users (who are waiting)
        const positionFilter = {
            doctor_id: appt.doctor_id,
            appointment_date: queryDate,
            token_number: { $lt: parseInt(token) },
            token_status: 'CHECKED_IN'
        };
        const positionInQueue = await Appointment.countDocuments(positionFilter);

        // Average consultation time: 10 mins (can be made dynamic)
        const estWaitTime = (positionInQueue + (appt.token_status === 'CHECKED_IN' ? 0 : 1)) * 10;

        // Get doctor availability
        const avail = await DoctorAvailability.findOne({ doctor_id: appt.doctor_id, date: queryDate }).lean();

        res.json({
            success: true,
            data: {
                token_number: appt.token_number,
                token_status: appt.token_status,
                appointment_id: appt.appointment_id,
                doctor_name: appt.doctor_name,
                appointment_time: appt.appointment_time,
                position_in_queue: positionInQueue + 1,
                estimated_wait: `${estWaitTime}m`,
                doctor_status: avail?.status || 'PRESENT',
                doctor_eta: avail?.eta_time || null,
                message: appt.token_status === 'IN_PROGRESS'
                    ? 'Your turn! Please proceed to the doctor.'
                    : appt.token_status === 'CHECKED_IN'
                        ? `You are #${positionInQueue + 1} in the active waiting queue`
                        : `Status: ${appt.token_status}. Please check-in upon arrival.`
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Helper: Get available slots for a doctor on a specific date
const getSlotsForDate = async (doctor, queryDate, allTemplates) => {
    const dayOfWeek = queryDate.getUTCDay();
    const now = new Date();
    const isToday = queryDate.getUTCFullYear() === now.getUTCFullYear() &&
        queryDate.getUTCMonth() === now.getUTCMonth() &&
        queryDate.getUTCDate() === now.getUTCDate();

    const doctorSlotIds = doctor.available_slots?.get(dayOfWeek.toString()) || [];
    let todayTemplates = [];
    if (doctorSlotIds.length === 0) {
        todayTemplates = allTemplates.filter(t => {
            const safeName = doctor.name.replace(/\./g, '');
            const perDoctor = t.days_by_doctor?.get(safeName) || t.days_by_doctor?.get(doctor.name);
            const activeDays = (perDoctor && perDoctor.length > 0) ? perDoctor : (t.days_of_week || [0, 1, 2, 3, 4, 5, 6]);
            return activeDays.includes(dayOfWeek);
        });
    } else {
        todayTemplates = allTemplates.filter(t => doctorSlotIds.includes(t.slot_id));
    }

    const dailyAvailability = await SlotAvailability.find({
        slot_date: queryDate,
        doctor_id: doctor.doctor_id
    });
    const statusMap = new Map(dailyAvailability.map(a => [a.slot_id, a]));

    return todayTemplates
        .filter(t => {
            const status = statusMap.get(t.slot_id);
            if (status && (status.is_booked || status.blocked_by_admin)) return false;
            if (isToday) {
                const [h, m] = (status?.custom_start_time || t.start_time).split(':');
                const slotMins = parseInt(h) * 60 + parseInt(m);
                const clinicNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
                const nowMins = clinicNow.getUTCHours() * 60 + clinicNow.getUTCMinutes();
                if (slotMins < nowMins - 5) return false;
            }
            return true;
        })
        .map(t => {
            const status = statusMap.get(t.slot_id);
            return {
                slot_id: t.slot_id,
                label: status?.custom_label || t.slot_label || t.display_label,
                session: t.session,
                start_time: status?.custom_start_time || t.start_time,
                end_time: status?.custom_end_time || t.end_time
            };
        });
};

// @desc    Get available slots for bot
// @route   GET /api/bot/slots/available
exports.getAvailableSlotsBot = async (req, res) => {
    try {
        const { doctor_id, doctor_name, date } = req.query;
        if (!doctor_id && !doctor_name) return res.status(400).json({ success: false, message: 'doctor_id or doctor_name is required' });

        const queryDate = toMidnight(date || new Date());
        let doctor = null;
        if (doctor_id) {
            doctor = await Doctor.findOne({ doctor_id, is_active: true });
        } else if (doctor_name) {
            const canonical = canonicalizeDoctorName(doctor_name);
            doctor = await Doctor.findOne({
                $or: [
                    { name: { $regex: new RegExp(`^${doctor_name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
                    { name: { $regex: new RegExp(`^${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
                ],
                is_active: true
            });
        }

        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found or inactive' });

        const allTemplates = await Slot.find({ is_active: true }).sort({ start_time: 1 });
        const available = await getSlotsForDate(doctor, queryDate, allTemplates);

        res.json({
            success: true,
            date: queryDate.toISOString().split('T')[0],
            doctor_id: doctor.doctor_id,
            doctor_name: doctor.name,
            data: available
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get availability summary for next X days for bot
// @route   GET /api/bot/slots/available-dates
exports.getAvailableDatesBot = async (req, res) => {
    try {
        const { doctor_id, doctor_name, days = 14 } = req.query;
        if (!doctor_id && !doctor_name) return res.status(400).json({ success: false, message: 'doctor_id or doctor_name is required' });

        let doctor = null;
        if (doctor_id) {
            doctor = await Doctor.findOne({ doctor_id, is_active: true });
        } else if (doctor_name) {
            const canonical = canonicalizeDoctorName(doctor_name);
            doctor = await Doctor.findOne({
                $or: [
                    { name: { $regex: new RegExp(`^${doctor_name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
                    { name: { $regex: new RegExp(`^${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
                ],
                is_active: true
            });
        }
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found or inactive' });

        const allTemplates = await Slot.find({ is_active: true }).sort({ start_time: 1 });
        const result = [];
        const maxDays = Math.min(parseInt(days), 31);

        for (let i = 0; i < maxDays; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            const queryDate = toMidnight(date);

            const availableSlots = await getSlotsForDate(doctor, queryDate, allTemplates);

            if (availableSlots.length > 0) {
                result.push({
                    date: queryDate.toISOString().split('T')[0],
                    day: queryDate.toLocaleDateString('en-US', { weekday: 'long' }),
                    available_count: availableSlots.length,
                    first_slot: availableSlots[0].start_time
                });
            }
        }

        res.json({
            success: true,
            doctor_id: doctor.doctor_id,
            doctor_name: doctor.name,
            days_checked: maxDays,
            data: result
        });
    } catch (err) {
        console.error('[getAvailableDatesBot]', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

