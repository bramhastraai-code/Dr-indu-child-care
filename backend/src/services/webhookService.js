const axios = require('axios');

/**
 * Webhook Service
 * Handles all outgoing webhooks to n8n or other external services.
 * 
 * Required environment variables for deployment:
 *   N8N_BASE_URL       - Base URL of n8n instance (default: https://n8n.brahmaastra.ai)
 *   N8N_API_KEY        - API key for n8n authentication
 *   N8N_USE_TEST_WEBHOOK - Set to 'true' to use /webhook-test/ prefix (for testing only)
 */

// Load n8n configuration from environment
const N8N_BASE_URL = process.env.N8N_BASE_URL || 'https://n8n.brahmaastra.ai';
const N8N_API_KEY = process.env.N8N_API_KEY || '';
const N8N_USE_TEST_WEBHOOK = process.env.N8N_USE_TEST_WEBHOOK === 'true';

// ── Startup Configuration Log ────────────────────────────────────────────────
// Always log webhook config at startup so deployment misconfigurations are obvious
console.log('[Webhook Config] ──────────────────────────────────────────');
console.log(`[Webhook Config] N8N_BASE_URL          = ${N8N_BASE_URL}`);
console.log(`[Webhook Config] N8N_API_KEY            = ${N8N_API_KEY ? '***SET***' : '⚠️  NOT SET'}`);
console.log(`[Webhook Config] N8N_USE_TEST_WEBHOOK   = ${N8N_USE_TEST_WEBHOOK} (prefix: ${N8N_USE_TEST_WEBHOOK ? 'webhook-test' : 'webhook'})`);
console.log(`[Webhook Config] NODE_ENV               = ${process.env.NODE_ENV || 'not set'}`);
console.log('[Webhook Config] ──────────────────────────────────────────');

// ── Retry Helper ─────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const MAX_RETRIES = 2;        // 1 original + 2 retries = 3 total attempts
const RETRY_DELAY_MS = 1500;  // wait 1.5s between retries

/**
 * Trigger an n8n webhook with automatic retry for transient failures.
 * @param {string} endpoint - The webhook endpoint path (e.g. 'appointment', 'Registration')
 * @param {object} data - The payload to send
 * @returns {Promise<{success: boolean, status: number|string, data?: any, error?: string}>}
 */
const triggerWebhook = async (endpoint, data) => {
    // n8n uses /webhook-test/ for non-active workflows in the editor,
    // and /webhook/ for activated "production" workflows.
    const webhookPrefix = N8N_USE_TEST_WEBHOOK ? 'webhook-test' : 'webhook';

    // Clean up endpoint (remove leading/trailing slashes)
    const cleanEndpoint = endpoint.replace(/^\/|\/$/g, '');

    const url = `${N8N_BASE_URL}/${webhookPrefix}/${cleanEndpoint}`;

    // Prepare headers
    const headers = {
        'Content-Type': 'application/json'
    };

    // Include API Key if provided
    if (N8N_API_KEY) {
        headers['x-n8n-api-key'] = N8N_API_KEY;
        headers['Authorization'] = `Bearer ${N8N_API_KEY}`;
    }

    // Sanitize data (Convert Dates to ISO strings)
    const sanitizedData = JSON.parse(JSON.stringify(data, (key, value) => {
        if (value instanceof Date) return value.toISOString();
        return value;
    }));

    // Fire request with retry for transient errors
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            console.log(`[Webhook] → Calling ${url} (attempt ${attempt}/${MAX_RETRIES + 1})`);

            const response = await axios.post(url, sanitizedData, {
                headers,
                timeout: 15000 // 15s timeout (increased from 10s for deployment latency)
            });

            console.log(`[Webhook] ✅ Success: ${url} (Status: ${response.status})`);
            return { success: true, status: response.status, data: response.data };
        } catch (err) {
            const errorMsg = err.response?.data?.message || err.response?.statusText || err.message;
            const statusCode = err.response?.status || 'network_error';
            const errorCode = err.code || 'UNKNOWN';
            lastError = { statusCode, errorMsg, errorCode };

            console.error(`[Webhook] ❌ Attempt ${attempt} failed for ${url}:`, {
                status: statusCode,
                code: errorCode,
                message: errorMsg,
                endpoint: cleanEndpoint,
                responseHeaders: err.response?.headers ? JSON.stringify(err.response.headers) : 'N/A'
            });

            // Only retry on transient errors (network, timeout, 5xx)
            const isTransient = !err.response ||
                (err.response.status >= 500 && err.response.status < 600) ||
                err.code === 'ECONNABORTED' ||
                err.code === 'ECONNRESET' ||
                err.code === 'ETIMEDOUT' ||
                err.code === 'ENOTFOUND';

            if (!isTransient || attempt > MAX_RETRIES) {
                break;
            }

            console.log(`[Webhook] ⏳ Retrying in ${RETRY_DELAY_MS}ms...`);
            await sleep(RETRY_DELAY_MS);
        }
    }

    // All attempts failed
    console.error(`[Webhook] 🚨 ALL ATTEMPTS FAILED for ${cleanEndpoint}:`, lastError);
    return { success: false, status: lastError?.statusCode || 'unknown', error: lastError?.errorMsg || 'Unknown error' };
};

module.exports = { triggerWebhook };
