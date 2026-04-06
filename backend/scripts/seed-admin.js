/**
 * Seed Admin User
 * Usage: node scripts/seed-admin.js <username> <email> <password> <role>
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Admin = require('../src/models/Admin');

dotenv.config({ path: path.join(__dirname, '../.env') });

const seed = async () => {
    const args = process.argv.slice(2);
    if (args.length < 3) {
        console.log('Usage: node scripts/seed-admin.js <username> <email> <password> [role]');
        process.exit(1);
    }

    const [username, email, password, role = 'superadmin'] = args;

    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const exists = await Admin.findOne({ $or: [{ username }, { email }] });
        if (exists) {
            console.error(`User ${username} or email ${email} already exists.`);
            process.exit(1);
        }

        const admin = new Admin({
            username,
            email,
            password_hash: password, // Hashed by pre-save hook
            full_name: 'Initial Administrator',
            role,
            is_active: true,
            permissions: ['*']
        });

        await admin.save();
        console.log(`✅ Admin user ${username} created successfully.`);
        
        await mongoose.disconnect();
    } catch (err) {
        console.error('Error seeding admin:', err.message);
        process.exit(1);
    }
};

seed();
