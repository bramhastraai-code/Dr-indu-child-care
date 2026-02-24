const express = require('express');
const router = express.Router();

const {
    registerPatient,
    getPatients,
    getPatientByMobile,
    getPatientById,
    updatePatient,
    registerFromWhatsapp,
    registerFromForm
} = require('./patient.controller');
const validate = require('../../middleware/validate');
const { register, update } = require('./patient.validator');

// All routes are now public for external integrations like n8n
router.post('/form', validate(register), registerFromForm);
router.post('/whatsapp', validate(register), registerFromWhatsapp);
router.get('/by-wa/:wa_id', getPatientByMobile);

// Direct registration
router.post('/', validate(register), registerPatient);

// Lookup and Management
router.get('/', getPatients);
router.get('/:patient_id', getPatientById);
router.put('/:patient_id', validate(update), updatePatient);

// Bot shortcut (alias)
router.get('/by-mobile/:wa_id', getPatientByMobile);

module.exports = router;
