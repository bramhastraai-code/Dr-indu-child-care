const express = require('express');
const router = express.Router();
const {
    getMRDByPatientId,
    addMRDEntry,
    updateMRDEntry,
    updateMRDById,
    exportMRD,
    getEntryByAppointment,
    addVaccinationRecord,
    lockMRDEntry,
    uploadMRDAttachment,
    sendPrescriptionViaWhatsApp
} = require('./mrd.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');

// All MRD endpoints — auth allows public access by default

// All MRD endpoints — Protected (Restricted access)
const MRD_ROLES = ['superadmin', 'admin', 'doctor', 'nurse', 'staff'];

router.use(auth); // Ensure all routes below are authenticated

router.post('/vaccination', authorize(MRD_ROLES), addVaccinationRecord);
router.post('/entry', authorize(MRD_ROLES), addMRDEntry);
router.patch('/entry/:id', authorize(MRD_ROLES), updateMRDEntry);
router.get('/appointment/:appointment_id', authorize(MRD_ROLES), getEntryByAppointment);
router.patch('/entry/:id/lock', authorize(['superadmin', 'admin', 'doctor']), lockMRDEntry);
router.post('/entry/:id/attachment', authorize(MRD_ROLES), uploadMRDAttachment);
router.post('/entry/:id/send-whatsapp', authorize(MRD_ROLES), sendPrescriptionViaWhatsApp);

router.get('/:patient_id/export', authorize(MRD_ROLES), exportMRD);
router.get('/:patient_id', authorize(MRD_ROLES), getMRDByPatientId);
router.put('/:mrd_id', authorize(MRD_ROLES), updateMRDById);

module.exports = router;
