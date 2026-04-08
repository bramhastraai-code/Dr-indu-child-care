const mongoose = require('mongoose');

const PrescriptionSchema = new mongoose.Schema({
  patientId: {
    type: Number,
    required: true
  },
  wardInpatientId: {
    type: Number
  },
  prescription: {
    medication: {
      type: String,
      required: true
    },
    instruction: {
      type: String
    },
    genericId: {
      type: Number
    }
  },
  metadata: {
    serialNumber: {
      type: Number
    },
    isRemoved: {
      type: Boolean,
      default: false
    },
    createdBy: {
      type: Number
    },
    createdOn: {
      type: Date,
      default: Date.now
    }
  }
}, { timestamps: true });

// Optionally, add an index on patientId for faster queries
PrescriptionSchema.index({ patientId: 1 });

module.exports = mongoose.model('Prescription', PrescriptionSchema);
