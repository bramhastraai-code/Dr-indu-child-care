const mongoose = require('mongoose');

const BotChatHistorySchema = new mongoose.Schema({
    wa_id: {
        type: String,
        required: true,
        index: true
    },
    user_name: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    is_registered: {
        type: Boolean,
        default: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

// Compound index for efficient cleanup/limiting
BotChatHistorySchema.index({ wa_id: 1, timestamp: -1 });

// Post-save hook to keep only last 10 messages for this number
BotChatHistorySchema.post('save', async function (doc) {
    try {
        const count = await doc.constructor.countDocuments({ wa_id: doc.wa_id });
        if (count > 10) {
            const history = await doc.constructor.find({ wa_id: doc.wa_id })
                .sort({ timestamp: -1 })
                .skip(10);

            if (history.length > 0) {
                const idsToDelete = history.map(h => h._id);
                await doc.constructor.deleteMany({ _id: { $in: idsToDelete } });
            }
        }
    } catch (err) {
        console.error('[BotChatHistory post-save error]', err.message);
    }
});

module.exports = mongoose.model('BotChatHistory', BotChatHistorySchema);
