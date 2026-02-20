const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Patient = require('../src/models/Patient');
const MRD = require('../src/models/MRD');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const patients = [
    {
        patient_id: 'DICC-2026-0001',
        child_name: 'Aarav Sharma',
        parent_name: 'Rohit Sharma',
        parent_mobile: '9876543210',
        dob: new Date('2020-05-15'),
        gender: 'MALE',
        address: 'Sector 15, Gurgaon',
        registration_status: 'COMPLETE',
        registered_at: new Date('2026-01-01T10:00:00Z')
    },
    {
        patient_id: 'DICC-2026-0002',
        child_name: 'Vihaan Gupta',
        parent_name: 'Amit Gupta',
        parent_mobile: '9123456789',
        dob: new Date('2022-08-20'),
        gender: 'MALE',
        address: 'DLF Phase 3, Gurgaon',
        registration_status: 'COMPLETE',
        registered_at: new Date('2026-01-05T11:30:00Z')
    },
    {
        patient_id: 'DICC-2026-0003',
        child_name: 'Aditi Singh',
        parent_name: 'Vikram Singh',
        parent_mobile: '9988776655',
        dob: new Date('2019-11-10'),
        gender: 'FEMALE',
        address: 'Sohna Road, Gurgaon',
        registration_status: 'COMPLETE',
        registered_at: new Date('2026-01-10T09:15:00Z')
    }
];

const mrdEntries = [
    {
        patient_id: 'DICC-2026-0001',
        visit_date: new Date('2025-12-10'),
        visit_type: 'CONSULTATION',
        attending_doctor: 'Dr. Indu',
        chief_complaint: 'Fever and cough',
        diagnosis: 'Viral Fever',
        prescription: 'Paracetamol 5ml SOS',
        recorded_by: 'Dr. Indu'
    },
    {
        patient_id: 'DICC-2026-0002',
        visit_date: new Date('2026-01-05'),
        visit_type: 'VACCINATION',
        attending_doctor: 'Nurse Puja',
        vaccine_given: 'Polio Booster',
        recorded_by: 'Nurse Puja'
    }
];

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected...');

        // Upsert Patients
        for (const p of patients) {
            await Patient.updateOne(
                { patient_id: p.patient_id },
                { $set: p },
                { upsert: true }
            );
            console.log(`Upserted patient ${p.patient_id}`);

            // Ensure MRD doc
            const mrd = await MRD.findOne({ patient_id: p.patient_id });
            if (!mrd) {
                await MRD.create({ patient_id: p.patient_id, entries: [] });
            }
        }

        // Add Entries (only if empty to avoid dups for now)
        for (const entry of mrdEntries) {
            const mrd = await MRD.findOne({ patient_id: entry.patient_id });
            if (mrd && mrd.entries.length === 0) {
                mrd.entries.push(entry);
                await mrd.save();
                console.log(`Added MRD entry for ${entry.patient_id}`);
            }
        }

        console.log('Seeding complete.');
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
