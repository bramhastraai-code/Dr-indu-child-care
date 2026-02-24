const mongoose = require('mongoose');
const { encrypt, decrypt, maskData, hashField } = require('../utils/encryption');

const PatientSchema = new mongoose.Schema({
  patient_id: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  wa_id: {
    type: String,
    required: true,
    index: true,
    set: encrypt,
    get: decrypt
  },
  wa_hash: {
    type: String,
    index: true
  },
  child_name: {
    type: String,
    required: true,
    trim: true
  },
  parent_name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: null,
    set: (v) => v ? encrypt(v) : v,
    get: (v) => v ? decrypt(v) : v
  },
  email_hash: {
    type: String,
    index: true
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    default: null
  },
  dob: {
    type: Date,
    default: null
  },
  address: {
    type: String,
    default: null
  },
  registration_status: {
    type: String,
    enum: ['PENDING', 'COMPLETE'],
    default: 'COMPLETE'
  },
  registration_source: {
    type: String,
    enum: ['whatsapp', 'form', 'dashboard', 'api'],
    required: true,
    lowercase: true
  },
  is_deleted: {
    type: Boolean,
    default: false
  },
  registered_at: {
    type: Date,
    default: Date.now
  },
  last_updated_at: {
    type: Date,
    default: Date.now
  },
  last_updated_by: {
    type: String,
    default: null
  }
}, {
  timestamps: false,
  toJSON: { getters: true, virtuals: true },
  toObject: { getters: true, virtuals: true }
});

// Middleware to update hashes
PatientSchema.pre('save', function () {
  if (this.isModified('wa_id')) {
    this.wa_hash = hashField(decrypt(this.wa_id));
  }
  if (this.isModified('email')) {
    this.email_hash = hashField(decrypt(this.email));
  }
});

// Virtual for masked wa_id
PatientSchema.virtual('wa_masked').get(function () {
  return this.wa_id ? maskData(this.wa_id) : null;
});

module.exports = mongoose.model('Patient', PatientSchema);
