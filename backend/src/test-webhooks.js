const { triggerWebhook } = require('./services/webhookService');
require('dotenv').config();

const testAllWebhooks = async () => {
    console.log('--- Starting Webhook Connectivity Test ---');
    console.log(`Base URL: ${process.env.N8N_BASE_URL || 'https://n8n.brahmaastra.ai'}`);
    console.log('------------------------------------------');

    const tests = [
        {
            name: 'Registration',
            endpoint: 'Registration',
            data: {
                patient_id: "TEST-REG-01",
                child_name: "Test Registration Child",
                wa_id: "919999999999",
                email: "test-reg@example.com",
                doctor: "Dr. Indu",
                registration_source: "dashboard"
            }
        },
        {
            name: 'Appointment',
            endpoint: 'appointment',
            data: {
                appointment_id: "APP-TEST-01",
                patient_id: "TEST-REG-01",
                child_name: "Test Appointment Child",
                doctor_name: "Dr. Indu",
                appointment_date: new Date().toISOString().split('T')[0],
                appointment_time: "10:30 AM",
                token_number: 99
            }
        },
        {
            name: 'Appointment Update',
            endpoint: 'appointment-upgradation',
            data: {
                appointment_id: "APP-TEST-01",
                status: "CONFIRMED",
                previous_status: "PENDING",
                message: "Test update"
            }
        },
        {
            name: 'Doctor Update',
            endpoint: 'Doctor-update',
            data: {
                doctor_name: "Dr. Indu",
                status: "LATE",
                delay_minutes: 15,
                eta_time: "10:45 AM",
                event_type: "DOCTOR_RUNNING_LATE"
            }
        },
        {
            name: '24 hr Message',
            endpoint: '24hr-message',
            data: {
                patient_name: "Test Child",
                parent_name: "Test Parent",
                doctor_name: "Dr. Indu",
                appointment_date: "2026-03-29",
                appointment_time: "10:30 AM",
                clinic_name: "Dr. Indu Child Care Clinic"
            }
        }
    ];

    for (const test of tests) {
        console.log(`Testing ${test.name} (${test.endpoint})...`);
        try {
            const result = await triggerWebhook(test.endpoint, test.data);
            if (result.success) {
                console.log(`✅ ${test.name}: SUCCESS (Status: ${result.status})`);
            } else {
                console.log(`❌ ${test.name}: FAILED (Status: ${result.status}, Error: ${result.error})`);
            }
        } catch (err) {
            console.log(`❌ ${test.name}: CRITICAL ERROR: ${err.message}`);
        }
        console.log('------------------------------------------');
    }

    console.log('--- Webhook Connectivity Test Complete ---');
};

testAllWebhooks().catch(err => {
    console.error('Fatal Test Error:', err);
    process.exit(1);
});
