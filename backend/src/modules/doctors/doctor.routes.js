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

router.use(auth);

// All doctor endpoints — public (no auth required)
router.get('/', getDoctors);
router.post('/', validate(createSchema), createDoctor);

router.get('/:doctor_id/schedule', getDoctorSchedule);
router.patch('/:doctor_id/schedule', updateDoctorSchedule);

router.get('/:doctor_id', getDoctorById);
router.patch('/:doctor_id', validate(updateSchema), updateDoctor);
router.delete('/:doctor_id', deleteDoctor);

module.exports = router;
