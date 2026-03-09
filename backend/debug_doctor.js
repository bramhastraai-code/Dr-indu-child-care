const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Doctor = require('./src/models/Doctor');
const DoctorAvailability = require('./src/models/DoctorAvailability');

async function debugDoctor() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const doctor_id = 'DOC-00009';
        const doctor = await Doctor.findOne({ doctor_id });
        console.log('Doctor:', doctor);

        if (!doctor) {
            console.log('Doctor not found');
            return;
        }

        const record = await DoctorAvailability.findOne({ doctor_id, date: null });
        console.log('Availability Record (date: null):', record);

        const allRecords = await DoctorAvailability.find({ doctor_id });
        console.log('All Availability Records count:', allRecords.length);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

debugDoctor();
