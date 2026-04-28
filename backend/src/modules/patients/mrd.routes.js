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
    sendPrescriptionViaWhatsApp,
    getMRDEntryPdf
} = require('./mrd.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');

// All MRD endpoints — PUBLIC
router.post('/vaccination', addVaccinationRecord);
router.post('/entry', addMRDEntry);
router.patch('/entry/:id', updateMRDEntry);
router.get('/appointment/:appointment_id', getEntryByAppointment);
router.patch('/entry/:id/lock', lockMRDEntry);
router.post('/entry/:id/attachment', uploadMRDAttachment);
router.get('/entry/:id/pdf', getMRDEntryPdf);
router.post('/entry/:id/send-whatsapp', sendPrescriptionViaWhatsApp);

router.get('/:patient_id/export', exportMRD);
router.get('/:patient_id', getMRDByPatientId);
router.put('/:mrd_id', updateMRDById);

module.exports = router;
