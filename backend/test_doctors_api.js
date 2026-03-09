const axios = require('axios');

async function testDoctors() {
    try {
        console.log('Testing /api/doctors (default)...');
        const res1 = await axios.get('http://localhost:5000/api/doctors');
        console.log('Count:', res1.data.count);
        res1.data.data.forEach(d => console.log(`- ${d.name} (Active: ${d.is_active})`));

        console.log('\nTesting /api/doctors?all=true...');
        const res2 = await axios.get('http://localhost:5000/api/doctors?all=true');
        console.log('Count:', res2.data.count);
        res2.data.data.forEach(d => console.log(`- ${d.name} (Active: ${d.is_active})`));

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.response?.status, err.response?.data || err.message);
        process.exit(1);
    }
}

testDoctors();
