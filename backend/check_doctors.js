const mongoose = require('mongoose');
const Doctor = require('./src/models/Doctor');
require('dotenv').config();

async function checkDoctors() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const doctors = await Doctor.find({});
        console.log(`Found ${doctors.length} doctors total.`);
        doctors.forEach(d => {
            console.log(`- Doctor: ${d.name} (${d.doctor_id}), Speciality: ${d.speciality}, Active: ${d.is_active}`);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkDoctors();
