const express = require('express');
const router = express.Router();
const referringDoctorController = require('./referringDoctor.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');
const ADMIN_ONLY = ['superadmin', 'admin'];

// Publicly accessible referring doctor routes
router.get('/', referringDoctorController.getReferringDoctors);
router.get('/:id', referringDoctorController.getReferringDoctorById);
router.post('/', referringDoctorController.createReferringDoctor);
router.patch('/:id', referringDoctorController.updateReferringDoctor);
router.delete('/:id', referringDoctorController.deleteReferringDoctor);
router.get('/:id/report', referringDoctorController.getReferralReport);

module.exports = router;
