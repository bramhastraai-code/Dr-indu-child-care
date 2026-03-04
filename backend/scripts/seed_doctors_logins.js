const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Doctor = require('../src/models/Doctor');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const doctorsToUpsert = [
    {
        name: 'Dr. Deepak',
        speciality: 'Pediatrics',
        qualification: 'MBBS, MD',
        experience: '10 years',
        login_username: 'dr.deepak',
        login_email: 'dr.deepak@drindu.local',
        password_env: 'SEED_DR_DEEPAK_PASSWORD'
    },
    {
        name: 'Dr. Krishna',
        speciality: 'Pediatrics',
        qualification: 'MBBS, MD',
        experience: '9 years',
        login_username: 'dr.krishna',
        login_email: 'dr.krishna@drindu.local',
        password_env: 'SEED_DR_KRISHNA_PASSWORD'
    },
    {
        name: 'Dr. Rutik',
        speciality: 'Pediatrics',
        qualification: 'MBBS, DCH',
        experience: '7 years',
        login_username: 'dr.rutik',
        login_email: 'dr.rutik@drindu.local',
        password_env: 'SEED_DR_RUTIK_PASSWORD'
    },
    {
        name: 'Dr. Indu',
        speciality: 'Pediatrics',
        qualification: 'MBBS, MD (Pediatrics)',
        experience: '15 years',
        login_username: 'dr.indu',
        login_email: 'dr.indu@drindu.local',
        password_env: 'SEED_DR_INDU_PASSWORD'
    }
];

const generateDoctorId = async () => {
    const prefix = 'DOC-';
    const last = await Doctor.findOne({ doctor_id: { $regex: `^${prefix}` } }).sort({ doctor_id: -1 });
    const seq = last ? Number.parseInt(String(last.doctor_id).replace(prefix, ''), 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(5, '0')}`;
};

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected');

        for (const doctorSeed of doctorsToUpsert) {
            const password = process.env[doctorSeed.password_env];
            if (!password) {
                throw new Error(`Missing required env var: ${doctorSeed.password_env}`);
            }

            const existing = await Doctor.findOne({
                $or: [
                    { name: doctorSeed.name },
                    { login_username: doctorSeed.login_username },
                    { login_email: doctorSeed.login_email }
                ]
            }).select('+password_hash');

            if (existing) {
                existing.name = doctorSeed.name;
                existing.speciality = doctorSeed.speciality;
                existing.qualification = doctorSeed.qualification;
                existing.experience = doctorSeed.experience;
                existing.login_username = doctorSeed.login_username;
                existing.login_email = doctorSeed.login_email;
                existing.password_hash = password;
                existing.is_active = true;
                await existing.save();
                console.log(`Updated doctor login: ${existing.name} (${existing.doctor_id})`);
                continue;
            }

            const doctor = new Doctor({
                doctor_id: await generateDoctorId(),
                name: doctorSeed.name,
                speciality: doctorSeed.speciality,
                qualification: doctorSeed.qualification,
                experience: doctorSeed.experience,
                login_username: doctorSeed.login_username,
                login_email: doctorSeed.login_email,
                password_hash: password,
                is_active: true
            });

            await doctor.save();
            console.log(`Created doctor login: ${doctor.name} (${doctor.doctor_id})`);
        }

        console.log('Doctor login seeding completed.');
        process.exit(0);
    } catch (err) {
        console.error('Doctor login seeding failed:', err.message);
        process.exit(1);
    }
};

run();
