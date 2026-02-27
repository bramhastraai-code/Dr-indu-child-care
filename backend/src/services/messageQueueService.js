/**
 * Message Queue Service
 * Builds messages from templates, queues them, and processes pending
 * messages via a cron job every 30 seconds.
 */
const WhatsAppMessageQueue = require('../models/WhatsAppMessageQueue');
const { sendMessage } = require('./watiService');

// Strip leading "Dr." or "Dr " prefix so templates don't double it
const drName = (name) => String(name || '').replace(/^Dr\.?\s*/i, '').trim();

// ── Message Templates ────────────────────────────────────────────────

const TEMPLATES = {
    DOCTOR_RUNNING_LATE: (v) => `Hi ${v.parent_name},

⚠️ Doctor Update:
Dr. ${drName(v.doctor_name)} is running approximately ${v.minutes} minutes late.

Your Appointment Details:
📅 Date: ${v.date}
🕐 Original Time: ${v.original_time}
⏰ New Expected Time: ${v.new_time}
🏥 Token: ${v.token}

What to do:
✓ Your appointment has been automatically adjusted
✓ Please arrive by ${v.new_time}
✓ No action needed from your side

Thank you,
${v.clinic_name || 'Dr. Indu Child Care Clinic'}`,

    APPOINTMENT_RESCHEDULED: (v) => `✅ Appointment Rescheduled

Hi ${v.parent_name},

Your appointment with Dr. ${v.doctor_name} has been rescheduled:

📋 Appointment Details:
├─ Child: ${v.child_name}
├─ Doctor: Dr. ${v.doctor_name}
├─ Date: ${v.date}
├─ Original Slot: ${v.original_time}
├─ New Slot: ${v.new_time}
└─ Token: ${v.token}

📍 Clinic: ${v.clinic_address || process.env.CLINIC_ADDRESS || 'Dr. Indu Child Care Clinic'}

⏱️ Please arrive 5 minutes before your new appointment time.

Dr. Indu Child Care Clinic`,

    DOCTOR_ARRIVED: (v) => `✅ Doctor is Now Available

Good news, ${v.parent_name}!

Dr. ${v.doctor_name} has arrived and is ready to see patients.

Your Appointment:
🏥 Token: ${v.token}
🕐 Time: ${v.appointment_time}
📍 Clinic: ${v.clinic_address || process.env.CLINIC_ADDRESS || 'Dr. Indu Child Care Clinic'}

Next Steps:
1. Head to the clinic
2. Check in using your token
3. Wait for your token to be called

Thank you for your patience!
Dr. Indu Child Care Clinic`,

    TOKEN_CALL_REMINDER: (v) => `🔔 Your Turn Coming Soon!

Hi ${v.parent_name},

Your token *${v.token}* will be called next!

👶 Child: ${v.child_name}
🕐 Time: ${v.appointment_time}
🏥 ${v.clinic_name || 'Dr. Indu Child Care Clinic'}

📍 Location: Consultation Room 1

Please be ready!
Dr. Indu Child Care Clinic`,

    APPOINTMENT_COMPLETED: (v) => `✅ Appointment Completed

Hi ${v.parent_name},

Thank you for visiting Dr. Indu Child Care Clinic!

🏥 Appointment Summary:
├─ Child: ${v.child_name}
├─ Doctor: Dr. ${v.doctor_name}
├─ Date: ${v.date}
├─ Duration: ${v.duration || '—'} minutes
└─ Token: ${v.token}

📋 Next Steps:
${v.notes_from_doctor || 'Follow doctor instructions.'}
${v.next_appointment_date ? `\n📅 Next Appointment: ${v.next_appointment_date}\nToken: ${v.next_token || '---'}` : ''}

For queries, reply to this message anytime.
Dr. Indu Child Care Clinic`,

    NO_SHOW_NOTICE: (v) => `ℹ️ Appointment Status Update

Hi ${v.parent_name},

We noticed you didn't attend your appointment today.

📅 Missed Appointment:
├─ Date: ${v.date}
├─ Time: ${v.time}
├─ Token: ${v.token}
└─ Doctor: Dr. ${v.doctor_name}

To reschedule, please reply "Reschedule" and choose a new date/time.

We are here to help!
Dr. Indu Child Care Clinic`,

    APPOINTMENT_CONFIRMED: (v) => `✅ Appointment Confirmed!

Hi ${v.parent_name},

📋 APPOINTMENT DETAILS:
👶 Child: ${v.child_name}
👨‍⚕️ Doctor: Dr. ${v.doctor_name}
📅 Date: ${v.date}
🕐 Time: ${v.appointment_time}
🔖 Token: ${v.token}

📍 ${v.clinic_address || process.env.CLINIC_ADDRESS || 'Dr. Indu Child Care Clinic'}

Please arrive 5 minutes before your appointment time.

Dr. Indu Child Care Clinic`
};

// ── Queue API ─────────────────────────────────────────────────────────

/**
 * Add a message to the queue.
 * @param {string} waId           — recipient phone
 * @param {string} messageType    — one of TEMPLATES keys
 * @param {object} variables      — template variables
 * @param {object} [opts]         — { batchId, scheduledFor, relatedEntity }
 */
async function queueMessage(waId, messageType, variables, opts = {}) {
    const builder = TEMPLATES[messageType];
    if (!builder) throw new Error(`Unknown messageType: ${messageType} `);

    const messageText = builder(variables);
    const queueEntry = await WhatsAppMessageQueue.create({
        wa_id: String(waId).replace(/\D/g, ''),
        message_type: messageType,
        message_text: messageText,
        variables,
        batch_id: opts.batchId || null,
        scheduled_for: opts.scheduledFor || new Date(),
        related_entity: opts.relatedEntity || {},
        status: 'PENDING'
    });
    return queueEntry;
}

/**
 * Generate a new unique batch ID
 */
function newBatchId() {
    const year = new Date().getFullYear();
    return `BATCH-${year}-${Date.now().toString(36).toUpperCase()}`;
}

// ── Queue Processor ───────────────────────────────────────────────────

let _processorRunning = false;

async function processPendingMessages() {
    if (_processorRunning) return;   // prevent overlap
    _processorRunning = true;
    try {
        const pending = await WhatsAppMessageQueue.find({
            status: { $in: ['PENDING', 'RETRY'] },
            scheduled_for: { $lte: new Date() }
        }).limit(50);

        if (pending.length === 0) return;
        console.log(`[MQ] Processing ${pending.length} queued messages...`);

        for (const msg of pending) {
            try {
                const result = await sendMessage(msg.wa_id, msg.message_text);

                if (result.success) {
                    await WhatsAppMessageQueue.updateOne({ _id: msg._id }, {
                        $set: { status: 'SENT', message_id: result.message_id, sent_at: new Date() }
                    });
                } else {
                    const retries = msg.retry_count + 1;
                    const failed = retries >= 3;
                    await WhatsAppMessageQueue.updateOne({ _id: msg._id }, {
                        $set: {
                            status: failed ? 'FAILED' : 'RETRY',
                            retry_count: retries,
                            failed_reason: result.error || 'Unknown error',
                            scheduled_for: failed ? msg.scheduled_for : new Date(Date.now() + 5 * 60 * 1000)
                        }
                    });
                }
            } catch (err) {
                console.error(`[MQ] Error sending ${msg._id}: `, err.message);
            }
        }
    } finally {
        _processorRunning = false;
    }
}

/**
 * Start the cron-based queue processor.
 * Call this once from app.js at startup.
 */
function startQueueProcessor() {
    try {
        const cron = require('node-cron');
        // Every 30 seconds
        cron.schedule('*/30 * * * * *', processPendingMessages);
        console.log('✅ WhatsApp message queue processor started (every 30s)');
    } catch (err) {
        console.warn('[MQ] node-cron not available — queue processor disabled:', err.message);
    }
}

module.exports = {
    queueMessage,
    newBatchId,
    processPendingMessages,
    startQueueProcessor,
    TEMPLATES
};
