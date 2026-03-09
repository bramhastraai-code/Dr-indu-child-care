const axios = require('axios');

async function check() {
    const endpoints = [
        'http://localhost:5000/api/doctors?all=true',
        'http://localhost:5000/api/patients?registration_date=2026-03-09&limit=1',
        'http://localhost:5000/api/patients?page=1&limit=20'
    ];

    for (const url of endpoints) {
        console.log(`Checking ${url}...`);
        try {
            const res = await axios.get(url);
            console.log(`SUCCESS: ${res.status}`);
        } catch (err) {
            console.error(`ERROR: ${err.response?.status}`);
            console.error('BODY:', JSON.stringify(err.response?.data, null, 2));
            if (err.response?.data?.error) {
                console.error('MSG:', err.response.data.error);
            }
        }
    }
}

check();
