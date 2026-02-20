const express = require('express');
const router = express.Router();
const { getMRDByPatientId, addMRDEntry, updateMRDEntry, exportMRD } = require('./mrd.controller');

/**
 * @openapi
 * /api/mrd/entry/{id}:
 *   patch:
 *     summary: Update an entry in MRD
 *     tags: [MRD]
 */
router.patch('/entry/:id', updateMRDEntry);

/**
 * @openapi
 * /api/mrd/{patient_id}/export:
 *   get:
 *     summary: Export MRD data for a patient
 *     tags: [MRD]
 */
router.get('/:patient_id/export', exportMRD);
const auth = require('../../middleware/auth');

/**
 * @openapi
 * /api/mrd/{patient_id}:
 *   get:
 *     summary: Get MRD for a patient
 *     tags: [MRD]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patient_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Patient MRD found
 */
router.get('/:patient_id', auth, getMRDByPatientId);

/**
 * @openapi
 * /api/mrd/entry:
 *   post:
 *     summary: Add an entry to MRD
 *     tags: [MRD]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               patient_id: { type: string }
 *               doctor: { type: string }
 *               visit_type: { type: string }
 *               clinical_notes: { type: string }
 *     responses:
 *       200:
 *         description: MRD entry added
 */
router.post('/entry', auth, addMRDEntry);

module.exports = router;
