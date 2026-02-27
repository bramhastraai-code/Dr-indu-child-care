const mongoose = require('mongoose');

const BotChatHistorySchema = new mongoose.Schema({
    wa_id: {
        type: String,
        required: true,
        index: true
    },
    user_name: {
        type: String,
        default: 'Unknown'
    },
    message: {
        type: String,
        required: true
    },
    // 'user' = incoming from WhatsApp user; 'bot' = outgoing from bot/n8n
    sender: {
        type: String,
        enum: ['user', 'bot'],
        default: 'user'
    },
    // Whether this wa_id was a registered patient at time of logging
    is_registered: {
        type: Boolean,
        default: false,
        index: true
    },
    // patient_id if registered, null for unregistered visitors
    patient_id: {
        type: String,
        default: null,
        index: true
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: false,
    autoIndex: false
});

// Compound index for efficient per-number chat queries
BotChatHistorySchema.index({ wa_id: 1, timestamp: -1 });

// Post-save: keep only the last 100 messages per wa_id (increased from 10)
BotChatHistorySchema.post('save', async function (doc) {
    try {
        const count = await doc.constructor.countDocuments({ wa_id: doc.wa_id });
        if (count > 100) {
            const oldest = await doc.constructor.find({ wa_id: doc.wa_id })
                .sort({ timestamp: -1 })
                .skip(100)
                .select('_id')
                .lean();
            if (oldest.length > 0) {
                await doc.constructor.deleteMany({ _id: { $in: oldest.map(h => h._id) } });
            }
        }
    } catch (err) {
        console.error('[BotChatHistory post-save error]', err.message);
    }
});

module.exports = mongoose.model('BotChatHistory', BotChatHistorySchema);
