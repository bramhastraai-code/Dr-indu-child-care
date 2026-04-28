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
    registerFromForm,
    getPatientByEmail,
    getComprehensiveProfile,
    getVitalsHistory,
    getAllergySummary,
    getCurrentMeds,
    getPatientHistory
} = require('./patient.controller');
const validate = require('../../middleware/validate');
const { register, update } = require('./patient.validator');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');

const PATIENT_ROLES = ['superadmin', 'admin', 'staff', 'secretary', 'doctor'];
const PATIENT_DELETE_ROLES = ['superadmin', 'admin'];
console.log('--- DEBUG: patient.routes.js initialized ---');

// ── Public / Bot routes (No Dashboard Auth Required) ─────────────────
router.post('/form', validate(register), registerFromForm);
router.post('/whatsapp', validate(register), registerFromWhatsapp);
router.get('/by-wa/:wa_id', getPatientByWaId);
router.get('/by-email/:email', getPatientByEmail);

// ── Static routes (must come BEFORE /:patient_id) ───────────────────
router.get('/export/csv', exportPatientsCsv);
router.get('/stats', getPatientStats);

// ── Core CRUD ────────────────────────────────────────────────────────
router.post('/', validate(register), registerPatient);
router.get('/', getPatients);

// ── Patient-specific routes ──────────────────────────────────────────
router.get('/:patient_id/comprehensive', getComprehensiveProfile);
router.get('/:patient_id/vitals-history', getVitalsHistory);
router.get('/:patient_id/allergy-summary', getAllergySummary);
router.get('/:patient_id/current-meds', getCurrentMeds);
router.get('/:patient_id/patient-history', getPatientHistory);
router.get('/:patient_id', getPatientById);
router.put('/:patient_id', validate(update), updatePatient);
router.delete('/:patient_id', deletePatient);
router.patch('/:patient_id/photo', uploadPatientPhoto);

module.exports = router;
