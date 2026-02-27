/**
 * WATI WhatsApp Service
 * Sends messages via WATI API.
 * Falls back to a structured console log when WATI_API_KEY is not set (dev mode).
 */
const WATI_BASE_URL = process.env.WATI_BASE_URL || 'https://live-server-116924.wati.io/api/v1';
const WATI_API_KEY = process.env.WATI_API_KEY;
const WATI_PHONE_ID = process.env.WATI_PHONE_ID || '';

/**
 * Send a plain-text WhatsApp session message.
 * @param {string} waId  — 10-digit or 91XXXXXXXXXX number
 * @param {string} text  — message body
 * @returns {{ success, message_id, wa_id, status, error? }}
 */
async function sendMessage(waId, text) {
    // Normalize to 91XXXXXXXXXX
    const normalized = String(waId).replace(/\D/g, '');
    const phone = normalized.length === 10 ? `91${normalized}` : normalized;

    if (!WATI_API_KEY) {
        // Dev mode — log and return a mock response
        console.log(`[WATI-DEV] → ${phone}\n${text}\n${'─'.repeat(60)}`);
        return {
            success: true,
            message_id: `mock-${Date.now()}`,
            wa_id: phone,
            status: 'sent'
        };
    }

    try {
        const axios = require('axios');
        const response = await axios.post(
            `${WATI_BASE_URL}/sendSessionMessage/${phone}`,
            { messageText: text },
            {
                headers: {
                    Authorization: `Bearer ${WATI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        const data = response.data || {};
        return {
            success: true,
            message_id: data.id || data.messageId || `WATI-${Date.now()}`,
            wa_id: phone,
            status: 'sent'
        };
    } catch (err) {
        const errorMsg = err.response?.data?.message || err.message;
        console.error(`[WATI] Send failed to ${phone}:`, errorMsg);
        return { success: false, error: errorMsg, wa_id: phone };
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
