const mongoose = require('mongoose');

const VaccinationSchema = new mongoose.Schema({
  patientId: {
    type: Number,
    required: true
  },
  wardInpatientId: {
    type: Number
  },
  vaccine: {
    vaccineId: {
      type: Number,
      required: true
    },
    isGiven: {
      type: Boolean,
      default: false
    }
  },
  administration: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
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
    },
    modifiedBy: {
      type: Number
    },
    modifiedOn: {
      type: Date
    }
  }
}, { timestamps: true });

// Optionally, add an index on patientId for faster queries
VaccinationSchema.index({ patientId: 1 });

module.exports = mongoose.model('Vaccination', VaccinationSchema);
