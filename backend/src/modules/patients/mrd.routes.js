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
    uploadMRDAttachment
} = require('./mrd.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');

router.use(auth); // Must be authenticated to access any MRD endpoint

// All MRD endpoints — Protected (Restricted access)
router.post('/vaccination', authorize(['superadmin', 'admin', 'doctor', 'staff']), addVaccinationRecord);
router.post('/entry', authorize(['superadmin', 'admin', 'doctor']), addMRDEntry);
router.patch('/entry/:id', authorize(['superadmin', 'admin', 'doctor']), updateMRDEntry);
router.get('/appointment/:appointment_id', authorize(['superadmin', 'admin', 'doctor', 'staff', 'secretary']), getEntryByAppointment);
router.patch('/entry/:id/lock', authorize(['superadmin', 'admin', 'doctor']), lockMRDEntry);
router.post('/entry/:id/attachment', authorize(['superadmin', 'admin', 'doctor', 'staff', 'secretary']), uploadMRDAttachment);

router.get('/:patient_id/export', authorize(['superadmin', 'admin', 'doctor', 'staff', 'secretary']), exportMRD);
router.get('/:patient_id', authorize(['superadmin', 'admin', 'doctor', 'staff', 'secretary']), getMRDByPatientId);
router.put('/:mrd_id', authorize(['superadmin', 'admin', 'doctor']), updateMRDById);

module.exports = router;
