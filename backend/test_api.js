const axios = require('axios');

async function testApi() {
    try {
        const res = await axios.get('http://localhost:5000/api/patients/by-email/test@example.com');
        console.log('Success:', res.data);
    } catch (err) {
        console.error('Error:', err.response?.status, err.response?.data || err.message);
    }
}

testApi();
