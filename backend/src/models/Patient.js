const mongoose = require('mongoose');
const { encrypt, decrypt, maskData, hashField } = require('../utils/encryption');
const { normalizeGender } = require('../utils/helpers');

const PatientSchema = new mongoose.Schema({
  // ── Core / System ────────────────────────────────────────────
  patient_id: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  patient_uid: {
    type: String,
    unique: true,
    required: true,
    index: true
  },

  // Human-readable unique key, e.g. "26-RK-01" (Year-Initials-Sequence)
  patient_key: {
    type: String,
    unique: true,
    sparse: true,   // allows null for old records
    index: true,
    default: null
  },

  // WhatsApp / primary contact phone (encrypted)
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
  // Backward-compat combined name (child full name) - now optional as it can be computed
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
  mothers_name: {
    type: String,
    trim: true,
    default: null
  },

  // Birth Details
  dob_unknown: {
    type: Boolean,
    default: false
  },
  dob: {
    type: Date,
    default: null
  },
  // Computed/stored age (for cases where DOB is unknown)
  age_years: {
    type: Number,
    default: null
  },
  age_months: {
    type: Number,
    default: null
  },
  age_days: {
    type: Number,
    default: null
  },

  // ── Section 2: Photograph & Patient ID ───────────────────────
  registration_date: {
    type: Date,
    default: Date.now
  },
  patient_photo: {
    type: String,
    default: null
  },


  // ── Section 3: Parent / Guardian Information ─────────────────
  // Father
  father_name: {
    type: String,
    trim: true,
    default: null
  },
  father_email: {
    type: String,
    trim: true,
    lowercase: true,
    default: null
  },
  father_occupation: {
    type: String,
    trim: true,
    default: null
  },

  // Mother
  mother_name: {
    type: String,
    trim: true,
    default: null
  },
  mother_email: {
    type: String,
    trim: true,
    lowercase: true,
    default: null
  },
  mother_occupation: {
    type: String,
    trim: true,
    default: null
  },

  communication_preference: {
    type: mongoose.Schema.Types.Mixed, // Can be Boolean or String
    default: null
  },

  // Encrypted primary email (for portal login / comms)
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

  // ── Section 5: Additional Details ────────────────────────────
  source: {
    type: String,
    trim: true,
    default: null
  },
  referred_by: {
    type: String,
    trim: true,
    default: null
  },
  home_branch: {
    type: String,
    trim: true,
    default: null
  },
  doctor: {
    type: String,
    trim: true,
    default: null
  },
  religion: {
    type: String,
    trim: true,
    default: null
  },
  language: {
    type: String,
    trim: true,
    default: null
  },
  account_type: {
    type: String,
    trim: true,
    default: null
  },
  rating: {
    type: String,
    default: null
  },

  remarks: {
    type: String,
    trim: true,
    default: null
  },

  // ── Section 6: Enrollment Options ────────────────────────────
  enrollment_option: {
    type: String,
    enum: ['just_enroll', 'send_to_specific', 'book_appointment', null],
    default: 'just_enroll'
  },
  send_to_specific: {
    type: Boolean,
    default: false
  },

  // ── Section 7: Status ─────────────────────────────────────────
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
  autoIndex: false, // Disable auto-index creation to prevent buffering timeouts
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
  if (this.isModified('email')) {
    const rawVal = decrypt(this.email);
    this.email_hash = hashField(rawVal);
  }

  if (this.isModified('first_name') || this.isModified('middle_name') || this.isModified('last_name')) {
    this.child_name = [this.first_name, this.middle_name, this.last_name].filter(Boolean).join(' ');
  }
  this.last_updated_at = new Date();
});

// ── Virtuals ───────────────────────────────────────────────────
PatientSchema.virtual('wa_masked').get(function () {
  return this.wa_id ? maskData(this.wa_id) : null;
});

// Alias for backward-compat
PatientSchema.virtual('parent_mobile').get(function () {
  return this.wa_id;
});

// Full name virtual
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
  localField: 'patient_id',
  foreignField: 'patient_id'
});

PatientSchema.virtual('mrd', {
  ref: 'MRD',
  localField: 'patient_id',
  foreignField: 'patient_id',
  justOne: true
});

module.exports = mongoose.model('Patient', PatientSchema);

