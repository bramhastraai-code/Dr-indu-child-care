const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const DoctorSchema = new mongoose.Schema({
    doctor_id: {
        type: String,
        unique: true,
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    qualification: {
        type: String,
        trim: true
    },
    experience: {
        type: String,
        trim: true
    },
    speciality: {
        type: String,
        trim: true
    },
    login_username: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
        lowercase: true
    },
    login_email: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
        lowercase: true
    },
    password_hash: {
        type: String,
        select: false
    },
    last_login_at: {
        type: Date,
        default: null
    },
    is_active: {
        type: Boolean,
        default: true
    },
    daily_token_limit: {
        type: Number,
        default: 40
    },
    online_token_limit: {
        type: Number,
        default: 20
    },
    walkin_token_limit: {
        type: Number,
        default: 20
    },
    avg_consultation_time: {
        type: Number,
        default: 10 // Minutes
    },
    consultation_count: {
        type: Number,
        default: 0
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp + hash password if it changed.
DoctorSchema.pre('save', async function () {
    this.updated_at = Date.now();
    if (this.isModified('password_hash') && this.password_hash) {
        this.password_hash = await bcrypt.hash(this.password_hash, 12);
    }
});

DoctorSchema.methods.comparePassword = async function (candidatePassword) {
    if (!this.password_hash || !candidatePassword) return false;
    return bcrypt.compare(candidatePassword, this.password_hash);
};

DoctorSchema.set('toJSON', {
    transform: (_doc, ret) => {
        delete ret.password_hash;
        return ret;
    }
});

module.exports = mongoose.model('Doctor', DoctorSchema);
