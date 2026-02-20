const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const AdminSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'SECRETARY', 'DOCTOR'], default: 'SECRETARY' },
    created_at: { type: Date, default: Date.now }
});

// Pre-save hook for hashing
const bcrypt = require('bcryptjs');
AdminSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

const Admin = mongoose.model('Admin', AdminSchema);

const createAdmin = async () => {
    try {
        console.log('Connecting to URI:', process.env.MONGODB_URI);
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected...');

        const username = 'drinduchildcare@gmail.com';
        const password = 'Drindu@1234';

        // Delete existing if any to be sure
        await Admin.deleteMany({ username });

        const admin = new Admin({
            username,
            password,
            role: 'ADMIN'
        });

        await admin.save();
        console.log('Admin user created successfully: drinduchildcare@gmail.com / Drindu@1234');

        process.exit(0);
    } catch (err) {
        console.error('Error detail:', err);
        process.exit(1);
    }
};

createAdmin();
