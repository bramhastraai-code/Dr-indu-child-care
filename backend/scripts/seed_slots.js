const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Slot = require('../src/models/Slot');

const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const slots = [];
let idCounter = 1;

const formatTime = (h, m) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
};

const addSession = (startH, endH, sessionName) => {
    let currentH = startH;
    let currentM = 0;

    while (currentH < endH || (currentH === endH && currentM === 0)) {
        if (currentH === endH && currentM === 0) break;

        const startStr = `${currentH.toString().padStart(2, '0')}:${currentM.toString().padStart(2, '0')}`;
        const labelStart = formatTime(currentH, currentM);

        // Add 30 mins
        let nextM = currentM + 30;
        let nextH = currentH;
        if (nextM >= 60) {
            nextM -= 60;
            nextH += 1;
        }

        const endStr = `${nextH.toString().padStart(2, '0')}:${nextM.toString().padStart(2, '0')}`;
        const labelEnd = formatTime(nextH, nextM);

        slots.push({
            slot_id: `S${idCounter++}`,
            slot_label: `${labelStart} – ${labelEnd}`,
            start_time: startStr,
            end_time: endStr,
            session: sessionName,
            is_active: true,
            sort_order: idCounter
        });

        currentH = nextH;
        currentM = nextM;
    }
};

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected...');

        // Clear existing
        await Slot.deleteMany({});
        console.log('Cleared existing slots.');

        // Clinic Hours: 10:00 AM - 5:00 PM (17:00)
        // 10:00 - 12:00
        addSession(10, 12, 'MORNING');
        // 12:00 - 17:00
        addSession(12, 17, 'AFTERNOON');

        await Slot.insertMany(slots);
        console.log(`Seeded ${slots.length} slots successfully.`);

        console.log('Sample:', slots[0]);
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
