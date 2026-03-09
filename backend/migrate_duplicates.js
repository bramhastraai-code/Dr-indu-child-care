const dotenv = require('dotenv');
dotenv.config();

const mongoose = require('mongoose');
const Appointment = require('./src/models/Appointment');
const Patient = require('./src/models/Patient');

const migrate = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected');

        // 1. Appointments
        console.log('Migrating Appointments...');
        const appointments = await Appointment.find({ visit_category: { $exists: false } });
        console.log(`Processing ${appointments.length} appointments`);
        for (const appt of appointments) {
            appt.visit_category = appt.visit_type || 'First visit';
            await appt.save();
        }

        // 2. Patients (Photos)
        console.log('Migrating Patient Photos...');
        const patientsPhoto = await Patient.find({
            patient_photo: { $exists: false },
            photo: { $exists: true, $ne: null }
        });
        console.log(`Processing ${patientsPhoto.length} patients for photo sync`);
        for (const p of patientsPhoto) {
            p.patient_photo = p.photo;
            await p.save();
        }

        // 3. Patients (Remarks)
        console.log('Migrating Patient Remarks...');
        const patientsRemark = await Patient.find({
            remarks: { $exists: false },
            remark: { $exists: true, $ne: null }
        });
        console.log(`Processing ${patientsRemark.length} patients for remark sync`);
        for (const p of patientsRemark) {
            p.remarks = p.remark;
            await p.save();
        }

        console.log('Migration complete');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

migrate();
