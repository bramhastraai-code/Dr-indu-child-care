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

// All MRD endpoints — public (no auth required)
router.post('/vaccination', addVaccinationRecord);
router.post('/entry', addMRDEntry);
router.patch('/entry/:id', updateMRDEntry);
router.get('/appointment/:appointment_id', getEntryByAppointment);
router.patch('/entry/:id/lock', lockMRDEntry);
router.post('/entry/:id/attachment', uploadMRDAttachment);

router.get('/:patient_id/export', exportMRD);
router.get('/:patient_id', getMRDByPatientId);
router.put('/:mrd_id', updateMRDById);

module.exports = router;
