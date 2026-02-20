const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Slot = require('./src/models/Slot');

dotenv.config();

const slots = [
    { slot_id: 'S1', slot_label: '10:00 – 10:30 AM', display_label: '10:00 – 10:30 AM', start_time: '10:00', end_time: '10:30', session: 'MORNING' },
    { slot_id: 'S2', slot_label: '11:00 – 11:30 AM', display_label: '11:00 – 11:30 AM', start_time: '11:00', end_time: '11:30', session: 'MORNING' },
    { slot_id: 'S3', slot_label: '11:30 AM – 12:00 PM', display_label: '11:30 AM – 12:00 PM', start_time: '11:30', end_time: '12:00', session: 'MORNING' },
    { slot_id: 'S4', slot_label: '05:00 – 05:30 PM', display_label: '05:00 – 05:30 PM', start_time: '17:00', end_time: '17:30', session: 'EVENING' },
    { slot_id: 'S5', slot_label: '06:00 – 06:30 PM', display_label: '06:00 – 06:30 PM', start_time: '18:00', end_time: '18:30', session: 'EVENING' },
    { slot_id: 'S6', slot_label: '06:30 – 07:00 PM', display_label: '06:30 – 07:00 PM', start_time: '18:30', end_time: '19:00', session: 'EVENING' }
];

const seedSlots = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected for seeding...');

        await Slot.deleteMany(); // Clear existing slots
        await Slot.insertMany(slots);

        console.log('Standard slots seeded successfully');
        process.exit();
    } catch (err) {
        console.error('Error seeding slots:', err);
        process.exit(1);
    }
};

seedSlots();
