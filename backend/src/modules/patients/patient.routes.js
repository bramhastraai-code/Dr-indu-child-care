const express = require('express');
const router = express.Router();

const {
    registerPatient,
    getPatients,
    getPatientByWaId,
    getPatientById,
    updatePatient,
    deletePatient,
    uploadPatientPhoto,
    exportPatientsCsv,
    getPatientStats,
    registerFromWhatsapp,
    registerFromForm
} = require('./patient.controller');
const validate = require('../../middleware/validate');
const { register, update } = require('./patient.validator');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');

const PATIENT_ROLES = ['superadmin', 'admin', 'staff', 'secretary', 'doctor'];
const PATIENT_DELETE_ROLES = ['superadmin', 'admin'];

// ── Public / Bot routes (No Dashboard Auth Required) ─────────────────
router.post('/form', validate(register), registerFromForm);
router.post('/whatsapp', validate(register), registerFromWhatsapp);
router.get('/by-wa/:wa_id', getPatientByWaId);

// ── Static routes (must come BEFORE /:patient_id) ───────────────────
router.get('/export/csv', auth, authorize(PATIENT_ROLES), exportPatientsCsv);
router.get('/stats', auth, authorize(PATIENT_ROLES), getPatientStats);

// ── Core CRUD ────────────────────────────────────────────────────────
router.post('/', auth, authorize(PATIENT_ROLES), validate(register), registerPatient);
router.get('/', auth, authorize(PATIENT_ROLES), getPatients);

// ── Patient-specific routes ──────────────────────────────────────────
router.get('/:patient_id', auth, authorize(PATIENT_ROLES), getPatientById);
router.put('/:patient_id', auth, authorize(PATIENT_ROLES), validate(update), updatePatient);
router.delete('/:patient_id', auth, authorize(PATIENT_DELETE_ROLES), deletePatient);
router.patch('/:patient_id/photo', auth, authorize(PATIENT_ROLES), uploadPatientPhoto);

module.exports = router;
