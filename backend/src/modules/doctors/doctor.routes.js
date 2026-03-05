const express = require('express');
const router = express.Router();
const {
    getDoctors,
    getDoctorById,
    createDoctor,
    updateDoctor,
    deleteDoctor,
    getDoctorSchedule,
    updateDoctorSchedule
} = require('./doctor.controller');
const validate = require('../../middleware/validate');
const { createDoctor: createSchema, updateDoctor: updateSchema } = require('./doctor.validator');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');

const DOCTOR_MANAGE_ROLES = ['superadmin', 'admin'];
const DOCTOR_VIEW_ROLES = ['superadmin', 'admin', 'staff', 'secretary', 'doctor'];

// All routes use auth which defaults to public access
router.get('/', auth, authorize(DOCTOR_VIEW_ROLES), getDoctors);
router.get('/:doctor_id/schedule', auth, authorize(DOCTOR_VIEW_ROLES), getDoctorSchedule);
router.post('/', auth, authorize(DOCTOR_MANAGE_ROLES), validate(createSchema), createDoctor);
router.patch('/:doctor_id/schedule', auth, authorize(DOCTOR_VIEW_ROLES), updateDoctorSchedule);
router.get('/:doctor_id', auth, authorize(DOCTOR_VIEW_ROLES), getDoctorById);
router.patch('/:doctor_id', auth, authorize(DOCTOR_VIEW_ROLES), validate(updateSchema), updateDoctor);
router.delete('/:doctor_id', auth, authorize(DOCTOR_MANAGE_ROLES), deleteDoctor);

module.exports = router;
