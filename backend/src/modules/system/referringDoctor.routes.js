const express = require('express');
const router = express.Router();
const referringDoctorController = require('./referringDoctor.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');
const ADMIN_ONLY = ['superadmin', 'admin'];

router.use(auth);

router.get('/', referringDoctorController.getReferringDoctors);
router.get('/:id', referringDoctorController.getReferringDoctorById);
router.post('/', authorize(ADMIN_ONLY), referringDoctorController.createReferringDoctor);
router.patch('/:id', authorize(ADMIN_ONLY), referringDoctorController.updateReferringDoctor);
router.delete('/:id', authorize(ADMIN_ONLY), referringDoctorController.deleteReferringDoctor);
router.get('/:id/report', referringDoctorController.getReferralReport);

module.exports = router;
