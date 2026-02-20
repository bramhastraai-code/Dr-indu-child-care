const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const bcrypt = require('bcryptjs');

const AdminSchema = new mongoose.Schema({
    username: String,
    email: String,
    password_hash: String,
    full_name: String,
    role: String,
    is_active: { type: Boolean, default: true },
    last_login_at: { type: Date, default: null },
    created_at: { type: Date, default: Date.now }
}, { collection: 'admins' });

const Admin = mongoose.model('Admin', AdminSchema);

const seed = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected...');

        const username = 'drinduchildcare@gmail.com';
        const password = 'Drindu@1234';
        const password_hash = await bcrypt.hash(password, 12);

        await Admin.deleteMany({ $or: [{ username }, { email: username }] });

        const admin = await Admin.create({
            username,
            email: username,
            password_hash,
            full_name: 'Dr. Indu',
            role: 'SUPER_ADMIN',
            is_active: true
        });

        console.log('✅ Admin seeded successfully!');
        console.log('   Email/Username:', username);
        console.log('   Password:       Drindu@1234');
        console.log('   Role:           SUPER_ADMIN');
        console.log('   Document ID:   ', admin._id);
        process.exit(0);
    } catch (err) {
        console.error('❌ Error seeding admin:', err.message);
        process.exit(1);
    }
};

seed();
