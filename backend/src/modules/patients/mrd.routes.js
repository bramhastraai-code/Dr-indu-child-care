const express = require('express');
const router = express.Router();
const { getMRDByPatientId, addMRDEntry, updateMRDEntry, exportMRD, getEntryByAppointment } = require('./mrd.controller');

/**
 * @openapi
 * /api/mrd/entry/{id}:
 *   patch:
 *     summary: Update an entry in MRD
 *     tags: [MRD]
 */
const auth = require('../../middleware/auth');
const jwtOnly = require('../../middleware/jwtOnly');
const authorize = require('../../middleware/rbac');

router.use(auth, jwtOnly);

router.patch('/entry/:id', authorize(['superadmin', 'admin', 'staff']), updateMRDEntry);

/**
 * @openapi
 * /api/mrd/appointment/{appointment_id}:
 *   get:
 *     summary: Get MRD entry associated with a specific appointment
 *     tags: [MRD]
 */
router.get('/appointment/:appointment_id', authorize(['superadmin', 'admin', 'staff']), getEntryByAppointment);

/**
 * @openapi
 * /api/mrd/{patient_id}/export:
 *   get:
 *     summary: Export MRD data for a patient
 *     tags: [MRD]
 */
router.get('/:patient_id/export', authorize(['superadmin', 'admin']), exportMRD);
router.get('/:patient_id', authorize(['superadmin', 'admin', 'staff']), getMRDByPatientId);
router.post('/entry', authorize(['superadmin', 'admin', 'staff']), addMRDEntry);

module.exports = router;
