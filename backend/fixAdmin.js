const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config();

// We'll define the schema here exactly as in the model to avoid import issues
const AdminSchema = new mongoose.Schema({
    username: String,
    email: { type: String, lowercase: true },
    password_hash: String,
    full_name: String,
    role: { type: String, enum: ['superadmin', 'admin', 'staff'] },
    is_active: { type: Boolean, default: true }
}, { collection: 'admins' });

const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

const fix = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            console.error('MONGODB_URI is not defined in .env');
            process.exit(1);
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected...');

        const username = 'drinduchildcare@gmail.com';
        const password = 'Drindu@1234';

        // Use 12 rounds to match model PRE hook if it were running
        const password_hash = await bcrypt.hash(password, 12);

        // Delete any existing user with this email or username
        await Admin.deleteMany({ $or: [{ username }, { email: username }] });

        const admin = await Admin.create({
            username: 'drindu', // Let's use a simpler username
            email: username,
            password_hash: password_hash,
            full_name: 'Dr. Indu',
            role: 'superadmin', // Must be lowercase to match enum
            is_active: true
        });

        console.log('✅ Admin user created/updated successfully!');
        console.log('   Username:       ' + admin.username);
        console.log('   Email:          ' + admin.email);
        console.log('   Password:       ' + password);
        console.log('   Role:           ' + admin.role);

        process.exit(0);
    } catch (err) {
        console.error('❌ Error fixing admin:', err);
        process.exit(1);
    }
};

fix();
