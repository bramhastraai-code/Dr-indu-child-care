const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config();

const createAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected...');

        const username = 'drinduchildcare@gmail.com';
        const password = 'Drindu@1234';
        const hashedPassword = await bcrypt.hash(password, 10);

        const db = mongoose.connection.db;
        const collection = db.collection('admins');

        // Remove existing
        await collection.deleteMany({ username });

        // Insert new
        await collection.insertOne({
            username,
            password: hashedPassword,
            role: 'ADMIN',
            created_at: new Date()
        });

        console.log('Admin user inserted directly into database');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

createAdmin();
