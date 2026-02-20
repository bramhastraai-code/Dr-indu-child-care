const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';
const credentials = {
    username: 'drinduchildcare@gmail.com',
    password: 'Drindu@1234'
};

async function testAPIs() {
    let token = '';

    console.log('--- Testing API Endpoints ---');

    // 1. Login
    try {
        console.log('1. Logging in...');
        const loginRes = await axios.post(`${BASE_URL}/admin/login`, credentials);
        if (loginRes.data.success) {
            token = loginRes.data.access_token;
            console.log('✅ Login successful');
        } else {
            console.error('❌ Login failed:', loginRes.data);
            return;
        }
    } catch (err) {
        console.error('❌ Login error:', err.response?.data || err.message);
        return;
    }

    const authHeader = { headers: { Authorization: `Bearer ${token}` } };

    // 2. Health Check
    try {
        console.log('2. Checking health...');
        const healthRes = await axios.get(`${BASE_URL}/system/health`);
        console.log('✅ Health check:', healthRes.data);
    } catch (err) {
        console.error('❌ Health check failed');
    }

    // 3. Create Patient
    let patientId = '';
    try {
        console.log('3. Creating test patient...');
        const randomStr = Math.random().toString(36).substring(7);
        const patientData = {
            child_name: 'Test Kid ' + randomStr,
            parent_name: 'Test Parent',
            mobile: '9' + Math.floor(Math.random() * 900000000 + 100000000),
            gender: 'Male',
            registration_source: 'dashboard'
        };
        const patientRes = await axios.post(`${BASE_URL}/patients`, patientData, authHeader);
        patientId = patientRes.data.data.patient_id;
        console.log(`✅ Patient created: ${patientId}`);
    } catch (err) {
        console.error('❌ Patient creation failed:', JSON.stringify(err.response?.data || err.message, null, 2));
        return;
    }

    // 4. Get Patients
    try {
        console.log('4. Fetching patients list...');
        const patientsRes = await axios.get(`${BASE_URL}/patients`, authHeader);
        console.log(`✅ Fetched ${patientsRes.data.count} patients`);
    } catch (err) {
        console.error('❌ Fetching patients failed:', err.response?.data || err.message);
    }

    // 5. Get Available Slots
    let validSlotId = 'SLOT-MOR-1';
    try {
        console.log('5. Fetching available slots...');
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        const slotsRes = await axios.get(`${BASE_URL}/slots/available?doctor_type=PULMONARY&date=${tomorrowStr}`, authHeader);
        if (slotsRes.data.data && slotsRes.data.data.length > 0) {
            validSlotId = slotsRes.data.data[0].slot_id;
            console.log(`✅ Found valid slot: ${validSlotId}`);
        } else {
            console.log('⚠️ No slots found for tomorrow, using default SLOT-MOR-1');
        }
    } catch (err) {
        console.error('❌ Fetching slots failed:', err.response?.data || err.message);
    }

    // 6. Book Appointment
    try {
        console.log('6. Booking test appointment...');
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        const apptData = {
            patient_id: patientId,
            doctor_type: 'PULMONARY',
            visit_type: 'CONSULTATION',
            appointment_date: tomorrowStr,
            slot_id: validSlotId,
            appointment_mode: 'OFFLINE'
        };
        const apptRes = await axios.post(`${BASE_URL}/appointments`, apptData, authHeader);
        console.log(`✅ Appointment booked: ${apptRes.data.data.appointment_id}`);
    } catch (err) {
        console.error('❌ Booking failed:', JSON.stringify(err.response?.data || err.message));
    }

    // 7. Get Appointments
    try {
        console.log('7. Fetching appointments list...');
        const apptsRes = await axios.get(`${BASE_URL}/appointments`, authHeader);
        console.log(`✅ Fetched ${apptsRes.data.data.length} appointments`);
    } catch (err) {
        console.error('❌ Fetching appointments failed');
    }

    // 8. Bot Interactions
    try {
        console.log('8. Fetching bot interactions...');
        const botRes = await axios.get(`${BASE_URL}/bot/interactions/unregistered`, authHeader);
        console.log('✅ Bot interactions fetched successfully');
    } catch (err) {
        console.error('❌ Bot interactions failed:', err.response?.data || err.message);
    }

    // 9. Slot Config
    try {
        console.log('9. Fetching slot config...');
        const slotRes = await axios.get(`${BASE_URL}/slots/config`, authHeader);
        console.log('✅ Slot config fetched successfully');
    } catch (err) {
        console.error('❌ Slot config failed:', err.response?.data || err.message);
    }

    console.log('--- API Test Complete ---');
}

testAPIs();
