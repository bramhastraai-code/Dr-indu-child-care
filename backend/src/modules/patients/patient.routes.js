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

// ── Public / Bot routes (Protected by API Key or JWT) ───────────────
router.post('/form', auth, validate(register), registerFromForm);
router.post('/whatsapp', auth, validate(register), registerFromWhatsapp);
router.get('/by-wa/:wa_id', auth, getPatientByWaId);

// ── Static routes (must come BEFORE /:patient_id) ───────────────────
router.get('/export/csv', auth, exportPatientsCsv);
router.get('/stats', auth, getPatientStats);

// ── Core CRUD ────────────────────────────────────────────────────────
router.post('/', auth, validate(register), registerPatient);
router.get('/', auth, getPatients);

// ── Patient-specific routes ──────────────────────────────────────────
router.get('/:patient_id', auth, getPatientById);
router.put('/:patient_id', auth, validate(update), updatePatient);
router.delete('/:patient_id', auth, deletePatient);
router.patch('/:patient_id/photo', auth, uploadPatientPhoto);

module.exports = router;
