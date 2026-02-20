const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const checkStatus = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        const collection = db.collection('admins');
        const admin = await collection.findOne({ username: 'drinduchildcare@gmail.com' });

        if (admin) {
            console.log('✅ Admin user found in database');
        } else {
            console.log('❌ Admin user NOT found');
        }
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

checkStatus();
