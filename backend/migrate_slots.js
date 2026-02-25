const mongoose = require('mongoose');
require('dotenv').config();
const Doctor = require('./src/models/Doctor');
const Slot = require('./src/models/Slot');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        // 1. Fix Dr. Indu ID to match user's test expectation
        const indu = await Doctor.findOne({ name: 'Dr. Indu' });
        if (indu) {
            indu.doctor_id = 'DOC-00001';
            await indu.save();
            console.log('Updated Dr. Indu ID to DOC-00001');
        }

        // 2. Update Slot Templates
        const slots = await Slot.find({});
        for (const s of slots) {
            let changed = false;

            // If PULMONARY or other generic categories exist, map them to Dr. Indu
            const categories = ['PULMONARY', 'NON_PULMONARY', 'VACCINATION'];
            let bestDays = [0, 1, 2, 3, 4, 5, 6];

            for (const cat of categories) {
                if (s.days_by_doctor && s.days_by_doctor.has(cat)) {
                    bestDays = s.days_by_doctor.get(cat);
                    changed = true;
                }
            }

            // Sanitize name for MongoDB key (dots not allowed)
            const safeName = 'Dr Indu';
            if (!s.days_by_doctor.has(safeName)) {
                s.days_by_doctor.set(safeName, bestDays);
                changed = true;
            }

            if (changed) {
                await s.save();
                console.log(`Updated slot ${s.slot_id}`);
            }
        }

        console.log('Slots migration complete');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
