const axios = require('axios');

/**
 * Webhook Service
 * Handles all outgoing webhooks to n8n or other external services.
 */

// Load n8n configuration from environment
const N8N_BASE_URL = process.env.N8N_BASE_URL || 'https://n8n.brahmaastra.ai';
const N8N_API_KEY = process.env.N8N_API_KEY || '';
const N8N_USE_TEST_WEBHOOK = process.env.N8N_USE_TEST_WEBHOOK === 'true';

/**
 * Trigger an n8n webhook
 * @param {string} endpoint - The webhook endpoint path (e.g. 'appointment', 'Registration')
 * @param {object} data - The payload to send
 * @returns {Promise<any>}
 */
const triggerWebhook = async (endpoint, data) => {
    // n8n uses /webhook-test/ for non-active workflows in the editor,
    // and /webhook/ for activated "production" workflows.
    // We default to 'webhook' unless explicitly told to use testing.
    const webhookPrefix = N8N_USE_TEST_WEBHOOK ? 'webhook-test' : 'webhook';
    
    // 2. Clean up endpoint (remove leading/trailing slashes)
    const cleanEndpoint = endpoint.replace(/^\/|\/$/g, '');
    
    const url = `${N8N_BASE_URL}/${webhookPrefix}/${cleanEndpoint}`;

    // 3. Prepare headers
    const headers = {
        'Content-Type': 'application/json'
    };
    
    // Include API Key if provided
    if (N8N_API_KEY) {
        headers['x-n8n-api-key'] = N8N_API_KEY;
        // Also support Bearer token just in case
        headers['Authorization'] = `Bearer ${N8N_API_KEY}`;
    }

    // 4. Sanitize data (Convert Dates to ISO strings)
    const sanitizedData = JSON.parse(JSON.stringify(data, (key, value) => {
        if (value instanceof Date) return value.toISOString();
        return value;
    }));

    // 5. Fire request
    try {
        const response = await axios.post(url, sanitizedData, { 
            headers,
            timeout: 10000 // 10s timeout
        });
        
        if (NODE_ENV === 'development') {
            console.log(`[Webhook] Success: ${url} (Status: ${response.status})`);
        }
        
        return { success: true, status: response.status, data: response.data };
    } catch (err) {
        const errorMsg = err.response?.data?.message || err.response?.statusText || err.message;
        const statusCode = err.response?.status || 'network_error';
        
        console.error(`[Webhook Error] Failed to trigger ${url}:`, {
            status: statusCode,
            message: errorMsg,
            endpoint: cleanEndpoint
        });
        
        return { success: false, status: statusCode, error: errorMsg };
    }
};

module.exports = { triggerWebhook };
