const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AdminSchema = new mongoose.Schema({
    username: {
        type: String,
        unique: true,
        required: true,
        trim: true
    },
    email: {
        type: String,
        unique: true,
        required: true,
        trim: true,
        lowercase: true
    },
    password_hash: {
        type: String,
        required: true
    },
    full_name: {
        type: String,
        required: true,
        trim: true
    },
    role: {
        type: String,
        enum: ['superadmin', 'admin', 'staff', 'secretary', 'doctor'],
        required: true
    },
    is_active: {
        type: Boolean,
        default: true
    },
    last_login_at: {
        type: Date,
        default: null
    },
    permissions: {
        type: [String],
        default: []
    },
    doctor_id: {
        type: String,
        default: null,
        index: true
    },
    created_at: {
        type: Date,
        default: Date.now
    }
});

// Hash password before saving (Mongoose 9 async style)
AdminSchema.pre('save', async function () {
    if (!this.isModified('password_hash')) return;
    this.password_hash = await bcrypt.hash(this.password_hash, 12);
});

// Compare password method
AdminSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password_hash);
};

module.exports = mongoose.model('Admin', AdminSchema);
