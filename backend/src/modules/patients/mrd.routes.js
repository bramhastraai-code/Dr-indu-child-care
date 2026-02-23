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

// All routes are now public for external integrations like n8n
router.patch('/entry/:id', updateMRDEntry);

/**
 * @openapi
 * /api/mrd/appointment/{appointment_id}:
 *   get:
 *     summary: Get MRD entry associated with a specific appointment
 *     tags: [MRD]
 */
router.get('/appointment/:appointment_id', getEntryByAppointment);

/**
 * @openapi
 * /api/mrd/{patient_id}/export:
 *   get:
 *     summary: Export MRD data for a patient
 *     tags: [MRD]
 */
router.get('/:patient_id/export', exportMRD);
router.get('/:patient_id', getMRDByPatientId);
router.post('/entry', addMRDEntry);

module.exports = router;
