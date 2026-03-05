const express = require('express');
const router = express.Router();
const {
    updateAvailability,
    getAvailability,
    updateStatus,
    updateEta,
    recordLateCheckin,
    getLateCheckins,
    getAvailabilityDashboard
} = require('./availability.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');

const AVAILABILITY_ROLES = ['superadmin', 'admin', 'staff', 'secretary', 'doctor'];

// All routes — auth middleware allows public access by default
router.post('/availability/update', auth, authorize(AVAILABILITY_ROLES), updateAvailability);
router.get('/availability/:doctor_id', auth, authorize(AVAILABILITY_ROLES), getAvailability);
router.patch('/availability/:doctor_id/status', auth, authorize(AVAILABILITY_ROLES), updateStatus);
router.patch('/availability/:doctor_id/eta', auth, authorize(AVAILABILITY_ROLES), updateEta);
router.post('/late-checkin', auth, authorize(AVAILABILITY_ROLES), recordLateCheckin);
router.get('/late-checkins/:doctor_id', auth, authorize(AVAILABILITY_ROLES), getLateCheckins);
router.get('/availability-dashboard/:doctor_id', auth, authorize(AVAILABILITY_ROLES), getAvailabilityDashboard);

module.exports = router;
