const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Slot = require('../src/models/Slot');
const SlotAvailability = require('../src/models/SlotAvailability');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const generateSlots = () => {
    const slots = [];
    let startTime = 10 * 60; // 10:00 = 600 min
    const endTime = 17 * 60; // 17:00 = 1020 min
    const interval = 30;

    let order = 1;

    while (startTime < endTime) {
        const startH = Math.floor(startTime / 60);
        const startM = startTime % 60;
        const endH = Math.floor((startTime + interval) / 60);
        const endM = (startTime + interval) % 60;

        const formatTime = (h, m) => {
            const period = h < 12 ? 'AM' : 'PM';
            const displayH = h % 12 || 12;
            const displayM = m.toString().padStart(2, '0');
            return `${displayH}:${displayM} ${period}`;
        };

        const dbTime = (h, m) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

        const startStr = dbTime(startH, startM);
        const endStr = dbTime(endH, endM);

        const label = `${formatTime(startH, startM)} - ${formatTime(endH, endM)}`;

        // Session logic
        let session = 'MORNING';
        if (startH >= 12) session = 'AFTERNOON';
        if (startH >= 16) session = 'EVENING';

        slots.push({
            slot_id: `SLOT-${startStr.replace(':', '')}-${endStr.replace(':', '')}`,
            slot_label: label,
            display_label: label,
            start_time: startStr,
            end_time: endStr,
            session,
            is_active: true,
            sort_order: order++
        });

        startTime += interval;
    }
    return slots;
};

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected...');

        // Clear existing slots & availability for clean slate
        await Slot.deleteMany({});
        await SlotAvailability.deleteMany({});
        console.log('Cleared existing slots and availability.');

        const slots = generateSlots();
        await Slot.insertMany(slots);

        console.log(`Created ${slots.length} slots (10:00 AM - 5:00 PM, 30 min intervals).`);
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
