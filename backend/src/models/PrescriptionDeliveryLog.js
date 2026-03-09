const mongoose = require('mongoose');

const PrescriptionDeliveryLogSchema = new mongoose.Schema({
    prescription_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    patient_id: {
        type: String,
        ref: 'Patient',
        required: true,
        index: true
    },
    sent_by: {
        type: String, // Username or Admin ID
        required: true
    },
    sent_at: {
        type: Date,
        default: Date.now
    },
    delivery_status: {
        type: String,
        enum: ['sent', 'failed'],
        required: true
    },
    whatsapp_number: {
        type: String,
        required: true
    }
}, {
    timestamps: false
});

module.exports = mongoose.model('PrescriptionDeliveryLog', PrescriptionDeliveryLogSchema);
