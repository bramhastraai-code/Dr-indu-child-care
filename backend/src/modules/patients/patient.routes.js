const express = require('express');
const router = express.Router();

const {
    registerPatient,
    getPatients,
    getPatientByMobile,
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

// ── Public / Bot routes ─────────────────────────────────────────────
router.post('/form', validate(register), registerFromForm);
router.post('/whatsapp', validate(register), registerFromWhatsapp);
router.get('/by-wa/:wa_id', getPatientByMobile);
router.get('/by-mobile/:wa_id', getPatientByMobile);

// ── Static routes (must come BEFORE /:patient_id) ───────────────────
router.get('/export/csv', exportPatientsCsv);
router.get('/stats', getPatientStats);

// ── Core CRUD ────────────────────────────────────────────────────────
router.post('/', validate(register), registerPatient);
router.get('/', getPatients);

// ── Patient-specific routes ──────────────────────────────────────────
router.get('/:patient_id', getPatientById);
router.put('/:patient_id', validate(update), updatePatient);
router.delete('/:patient_id', deletePatient);
router.patch('/:patient_id/photo', uploadPatientPhoto);

module.exports = router;
