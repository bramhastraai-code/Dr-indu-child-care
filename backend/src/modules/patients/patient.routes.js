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
const authorize = require('../../middleware/rbac');
const validate = require('../../middleware/validate');
const { register, update } = require('./patient.validator');

const auth = require('../../middleware/auth');

// Public form registration (No auth required)
router.post('/form', validate(register), registerFromForm);

// Protected routes (Require JWT or API Key)
router.use(auth);

router.post('/', authorize(['superadmin', 'admin', 'staff']), validate(register), registerPatient);
router.post('/whatsapp', authorize(['bot_service', 'superadmin']), validate(register), registerFromWhatsapp);

// Lookup and Management
router.get('/', authorize(['superadmin', 'admin', 'staff']), getPatients);
router.get('/by-mobile/:mobile', authorize(['bot_service', 'superadmin', 'admin', 'staff']), getPatientByMobile);
router.get('/:patient_id', authorize(['superadmin', 'admin', 'staff']), getPatientById);
router.put('/:patient_id', authorize(['superadmin', 'admin', 'staff']), validate(update), updatePatient);

// Bot shortcut
router.get('/by-wa/:wa_id', authorize(['bot_service', 'superadmin', 'admin', 'staff']), (req, res, next) => {
    req.params.mobile = req.params.wa_id;
    next();
}, getPatientByMobile);

module.exports = router;
