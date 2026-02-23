const express = require('express');
const router = express.Router();
const {
    getDoctors,
    getDoctorById,
    createDoctor,
    updateDoctor,
    deleteDoctor
} = require('./doctor.controller');
const validate = require('../../middleware/validate');
const { createDoctor: createSchema, updateDoctor: updateSchema } = require('./doctor.validator');

/**
 * @openapi
 * tags:
 *   - name: Doctors
 *     description: Doctor management
 */

// All routes are public for external integrations like n8n
/**
 * @openapi
 * /api/doctors:
 *   get:
 *     summary: List all doctors
 *     tags: [Doctors]
 */
router.get('/', getDoctors);

/**
 * @openapi
 * /api/doctors/{doctor_id}:
 *   get:
 *     summary: Get doctor by ID
 *     tags: [Doctors]
 */
router.get('/:doctor_id', getDoctorById);

/**
 * @openapi
 * /api/doctors:
 *   post:
 *     summary: Create a new doctor
 *     tags: [Doctors]
 */
router.post('/', validate(createSchema), createDoctor);

/**
 * @openapi
 * /api/doctors/{doctor_id}:
 *   patch:
 *     summary: Update doctor details or available slots
 *     tags: [Doctors]
 */
router.patch('/:doctor_id', validate(updateSchema), updateDoctor);

/**
 * @openapi
 * /api/doctors/{doctor_id}:
 *   delete:
 *     summary: Delete a doctor
 *     tags: [Doctors]
 */
router.delete('/:doctor_id', deleteDoctor);

module.exports = router;
