require('dotenv').config();
const mongoose = require('mongoose');
const Patient = require('./models/Patient');
const Appointment = require('./models/Appointment');
const Doctor = require('./models/Doctor');
const MRD = require('./models/MRD');
const ReferringDoctor = require('./models/ReferringDoctor');
const DoctorAvailability = require('./models/DoctorAvailability');
const Feedback = require('./models/Feedback');

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const p = await Patient.countDocuments();
        const a = await Appointment.countDocuments();
        const d = await Doctor.countDocuments();
        const m = await MRD.countDocuments();
        const r = await ReferringDoctor.countDocuments();
        const da = await DoctorAvailability.countDocuments();
        const f = await Feedback.countDocuments();
        console.log(`Counts: 
  Patients: ${p}
  Appointments: ${a}
  Doctors: ${d}
  MRD: ${m}
  Referring Doctors: ${r}
  Doctor Availability: ${da}
  Feedback: ${f}`);
        await mongoose.disconnect();
    } catch(err) { console.log(err.message); }
    process.exit(0);
}
check();
