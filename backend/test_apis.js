const http = require('http');

const BASE_URL = 'http://localhost:5000/api';

const request = (method, path, body = null) => {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', (err) => reject(err));

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
};

async function runTests() {
    console.log('--- Starting Comprehensive API Tests (Native HTTP) ---');

    // 1. Unregistered Interactions
    try {
        const resp = await request('GET', `${BASE_URL}/bot/interactions/unregistered`);
        console.log('✅ GET /bot/interactions/unregistered:', resp.status, `(Count: ${resp.data.data ? resp.data.data.length : 0})`);
    } catch (err) {
        console.error('❌ GET /bot/interactions/unregistered FAILED:', err.message);
    }

    // 2. Pending Reminders
    try {
        const resp = await request('GET', `${BASE_URL}/appointments/reminders/pending-24h`);
        console.log('✅ GET /appointments/reminders/pending-24h:', resp.status, `(Count: ${resp.data.count ?? 0})`);
    } catch (err) {
        console.error('❌ GET /appointments/reminders/pending-24h FAILED:', err.message);
    }

    // 3. Bot Chat History
    const testWaId = '919876543210';
    try {
        const resp = await request('GET', `${BASE_URL}/bot/chat/history/${testWaId}`);
        console.log('✅ GET /bot/chat/history/:wa_id:', resp.status);
    } catch (err) {
        console.error('❌ GET /bot/chat/history/:wa_id FAILED:', err.message);
    }

    // 4. Test Chat Logging
    try {
        const resp = await request('POST', `${BASE_URL}/bot/chat/log`, {
            wa_number: testWaId,
            message: 'Smoke Test Message',
            user_name: 'Tester'
        });
        console.log('✅ POST /bot/chat/log:', resp.status, resp.data.message || '');
    } catch (err) {
        console.log('ℹ️ POST /bot/chat/log Info:', err.message);
    }

    console.log('--- Tests Completed ---');
}

runTests();
