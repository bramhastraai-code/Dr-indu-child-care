const express = require('express');
const router = express.Router();
const {
    getDoctors,
    getDoctorById,
    createDoctor,
    updateDoctor,
    deleteDoctor,
    getDoctorHistory
} = require('./doctor.controller');
const validate = require('../../middleware/validate');
const { createDoctor: createSchema, updateDoctor: updateSchema } = require('./doctor.validator');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');

const DOCTOR_MANAGE_ROLES = ['superadmin', 'admin'];
const DOCTOR_VIEW_ROLES = ['superadmin', 'admin', 'staff', 'secretary', 'doctor'];

// All routes are now public
router.get('/', getDoctors);
router.post('/', validate(createSchema), createDoctor);
router.get('/:doctor_id', getDoctorById);
router.get('/:doctor_id/history', getDoctorHistory);
router.patch('/:doctor_id', validate(updateSchema), updateDoctor);
router.delete('/:doctor_id', deleteDoctor);

module.exports = router;
