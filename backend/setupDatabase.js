const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

// Load env vars
dotenv.config();

// Load models
const Admin = require('./src/models/Admin');
const Patient = require('./src/models/Patient');
const Slot = require('./src/models/Slot');
const SlotAvailability = require('./src/models/SlotAvailability');
const Appointment = require('./src/models/Appointment');
const MRD = require('./src/models/MRD');
const AuditLog = require('./src/models/AuditLog');
const SystemConfig = require('./src/models/SystemConfig');
const BotSession = require('./src/models/BotSession');

async function createAll() {
    try {
        console.log('--- Initializing all collections for dr_indu_child_care ---');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB.');

        // 1. Admin
        const adminEmail = 'drinduchildcare@gmail.com';
        await Admin.deleteMany({ email: adminEmail });
        const salt = await bcrypt.genSalt(12);
        const password_hash = await bcrypt.hash('Drindu@1234', salt);
        await Admin.create({
            username: 'admin',
            email: adminEmail,
            password_hash,
            full_name: 'Dr. Indu',
            role: 'superadmin',
            is_active: true
        });
        console.log('✅ Collection: admins');

        // 2. Slots
        await Slot.deleteMany({});
        await Slot.insertMany([
            { slot_id: 'SLOT-MOR-1', slot_label: '10:00 AM', start_time: '10:00', end_time: '10:15', session: 'MORNING' },
            { slot_id: 'SLOT-EVE-1', slot_label: '05:00 PM', start_time: '17:00', end_time: '17:15', session: 'EVENING' }
        ]);
        console.log('✅ Collection: slots');

        // 3. System Config
        await SystemConfig.deleteMany({});
        await SystemConfig.create({
            config_key: 'INIT_FLAG',
            config_value: true,
            description: 'Database initialized'
        });
        console.log('✅ Collection: systemconfigs');

        // 4. Patients
        await Patient.deleteMany({ patient_id: 'DICC-SYSTEM-INIT' });
        const patient = await Patient.create({
            patient_id: 'DICC-SYSTEM-INIT',
            child_name: 'System Root',
            parent_name: 'System',
            mobile: '0000000000',
            registration_source: 'api'
        });
        console.log('✅ Collection: patients');

        // 5. MRD
        await MRD.deleteMany({ patient_id: patient.patient_id });
        await MRD.create({ patient_id: patient.patient_id, entries: [] });
        console.log('✅ Collection: mrds');

        // 6. AuditLog
        await AuditLog.create({
            event_type: 'INITIALIZATION',
            entity_type: 'system',
            entity_id: 'init',
            actor: 'SYSTEM',
            actor_type: 'SYSTEM'
        });
        console.log('✅ Collection: auditlogs');

        // 7. BotSession
        await BotSession.deleteMany({ session_id: 'INIT_SESSION' });
        const expiry = new Date();
        expiry.setHours(expiry.getHours() + 1);
        await BotSession.create({
            session_id: 'INIT_SESSION',
            wa_number: '0000000000',
            expires_at: expiry
        });
        console.log('✅ Collection: botsessions');

        // 8. Appointment
        await Appointment.deleteMany({ appointment_id: 'INIT_APPT' });
        await Appointment.create({
            appointment_id: 'INIT_APPT',
            patient_id: patient.patient_id,
            doctor_type: 'ANY',
            appointment_date: new Date(),
            slot_id: 'SLOT-MOR-1',
            status: 'BOOKED',
            booking_source: 'api'
        });
        console.log('✅ Collection: appointments');

        // 9. SlotAvailability
        await SlotAvailability.deleteMany({ slot_id: 'SLOT-MOR-1' });
        await SlotAvailability.create({
            slot_id: 'SLOT-MOR-1',
            slot_date: new Date(),
            doctor_type: 'ANY',
            is_booked: true
        });
        console.log('✅ Collection: slotavailabilities');

        console.log('\n--- All 9 collections successfully initialized in dr_indu_child_care ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ FAILED to create collections:', err);
        process.exit(1);
    }
}

createAll();
