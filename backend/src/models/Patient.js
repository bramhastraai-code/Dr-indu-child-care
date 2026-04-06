const mongoose = require('mongoose');
const { encrypt, decrypt, maskData, hashField } = require('../utils/encryption');
const { normalizeGender } = require('../utils/helpers');

const PatientSchema = new mongoose.Schema({
  // ── Core / System ────────────────────────────────────────────
  // Human-readable unique key, e.g. "26-RK-01" (Year-Initials-Sequence)
  patient_key: {
    type: String,
    unique: true,
    required: true,
    index: true,
    default: null
  },

  // WhatsApp / Primary Contact
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

  // ── Section 1: Personal Information ──────────────────────────
  salutation: {
    type: String,
    enum: ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Master', 'Miss', 'Baby', 'Baby of', '', null],
    default: null
  },
  first_name: {
    type: String,
    trim: true,
    default: null
  },
  middle_name: {
    type: String,
    trim: true,
    default: null
  },
  last_name: {
    type: String,
    trim: true,
    default: null
  },
  child_name: {
    type: String,
    trim: true,
    default: null
  },
  gender: {
    type: String,
    enum: ['boy', 'girl', null],
    set: (v) => normalizeGender(v),
    default: null
  },

  // Birth Details
  dob: {
    type: Date,
    default: null
  },

  // ── Section 2: Registration ───────────────────────────────────
  registration_date: {
    type: Date,
    default: Date.now
  },

  // ── Section 3: Parent / Guardian Information ─────────────────
  father_name: {
    type: String,
    trim: true,
    default: null
  },
  mother_name: {
    type: String,
    trim: true,
    default: null
  },
  communication_preference: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // ── Section 4: Address Details ───────────────────────────────
  residential_address: {
    type: String,
    trim: true,
    default: null
  },
  city: {
    type: String,
    trim: true,
    default: 'Mumbai'
  },
  state: {
    type: String,
    trim: true,
    default: 'Maharashtra'
  },
  pincode: {
    type: String,
    trim: true,
    default: null
  },

  // ── Section 5: Doctor ─────────────────────────────────────────
  doctor: {
    type: String,
    trim: true,
    default: 'Dr. Indu'
  },

  // ── Section 6: Status ─────────────────────────────────────────
  is_active: {
    type: Boolean,
    default: true
  },

  // ── System ────────────────────────────────────────────────────
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
  last_updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false,
  autoIndex: false,
  toJSON: { getters: true, virtuals: true },
  toObject: { getters: true, virtuals: true }
});

// ── Middleware ─────────────────────────────────────────────────
PatientSchema.pre('save', function () {
  const { normalizePhone } = require('../utils/helpers');

  if (this.isModified('wa_id')) {
    const rawVal = decrypt(this.wa_id);
    this.wa_hash = hashField(normalizePhone(rawVal));
  }

  if (this.isModified('first_name') || this.isModified('middle_name') || this.isModified('last_name')) {
    this.child_name = [this.first_name, this.middle_name, this.last_name].filter(Boolean).join(' ');
  }
  this.last_updated_at = new Date();
});

// ── Virtuals ───────────────────────────────────────────────────
PatientSchema.virtual('patient_id').get(function () {
  return this.patient_key;
});

PatientSchema.virtual('wa_masked').get(function () {
  return this.wa_id ? maskData(this.wa_id) : null;
});

PatientSchema.virtual('parent_mobile').get(function () {
  return this.wa_id;
});

PatientSchema.virtual('full_name').get(function () {
  if (this.first_name || this.last_name) {
    return [this.salutation, this.first_name, this.middle_name, this.last_name]
      .filter(Boolean).join(' ');
  }
  return this.child_name || null;
});

// Deep Connections: Virtual Population
PatientSchema.virtual('appointments', {
  ref: 'Appointment',
  localField: 'patient_key',
  foreignField: 'patient_id'
});

PatientSchema.virtual('mrd', {
  ref: 'MRD',
  localField: 'patient_key',
  foreignField: 'patient_id',
  justOne: true
});

module.exports = mongoose.model('Patient', PatientSchema);
