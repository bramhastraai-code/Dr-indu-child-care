const mongoose = require('mongoose');

const TokenSchema = new mongoose.Schema({
    user_id: {
        type: String,
        required: true,
        index: true
    },
    token: {
        type: String,
        required: true,
        index: true
    },
    expires_at: {
        type: Date,
        required: true,
        index: { expires: 0 } // TTL index: documents will be removed when expires_at reached
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    created_by_ip: String,
    replaced_by_token: String,
    revoked_at: Date,
    revoked_by_ip: String
});

TokenSchema.virtual('is_expired').get(function () {
    return Date.now() >= this.expires_at;
});

TokenSchema.virtual('is_active').get(function () {
    return !this.revoked_at && !this.is_expired;
});

module.exports = mongoose.model('Token', TokenSchema);
