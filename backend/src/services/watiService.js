/**
 * WATI WhatsApp Service
 * Sends messages via WATI API.
 * Falls back to a structured console log when WATI_API_KEY is not set (dev mode).
 */
const WATI_BASE_URL = process.env.WATI_BASE_URL || 'https://live-server-116924.wati.io/api/v1';
const WATI_API_KEY = process.env.WATI_API_KEY;
const WATI_PHONE_ID = process.env.WATI_PHONE_ID || '';

const { triggerWebhook } = require('./webhookService');

/**
 * Send a plain-text WhatsApp session message via n8n.
 * @param {string} waId  — 10-digit or 91XXXXXXXXXX number
 * @param {string} text  — message body
 * @returns {{ success, message_id, wa_id, status, error? }}
 */
async function sendMessage(waId, text) {
    // Normalize to 91XXXXXXXXXX
    const normalized = String(waId).replace(/\D/g, '');
    const phone = normalized.length === 10 ? `91${normalized}` : normalized;

    try {
        // We trigger an n8n webhook for outgoing messages instead of calling WATI directly
        const result = await triggerWebhook('wa-message', {
            wa_id: phone,
            text: text,
            sent_at: new Date().toISOString()
        });

        if (result.success) {
            return {
                success: true,
                message_id: `n8n-${Date.now()}`,
                wa_id: phone,
                status: 'sent'
            };
        } else {
            return { success: false, error: result.error, wa_id: phone };
        }
    } catch (err) {
        console.error(`[n8n-WA] Webhook failed to ${phone}:`, err.message);
        return { success: false, error: err.message, wa_id: phone };
    }
}

/**
 * Check delivery status of a sent message.
 * @param {string} messageId
 * @param {string} waId
 */
async function getMessageStatus(messageId, waId) {
    if (!WATI_API_KEY) {
        return { message_id: messageId, status: 'delivered', channel: 'mock' };
    }
    try {
        const axios = require('axios');
        const phone = String(waId).replace(/\D/g, '');
        const response = await axios.get(
            `${WATI_BASE_URL}/getStatus/${phone}/${messageId}`,
            { headers: { Authorization: `Bearer ${WATI_API_KEY}` }, timeout: 8000 }
        );
        return response.data;
    } catch (err) {
        return { message_id: messageId, status: 'unknown', error: err.message };
    }
}

module.exports = { sendMessage, getMessageStatus };
