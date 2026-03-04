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

router.use(auth);
router.use(authorize(AVAILABILITY_ROLES));

// ── Doctor Availability & Queue ─────────────────────────────────────────────
// All public (no auth)

// Availability CRUD
router.post('/availability/update', updateAvailability);
router.get('/availability/:doctor_id', getAvailability);

// Real-time status & ETA patches
router.patch('/availability/:doctor_id/status', updateStatus);
router.patch('/availability/:doctor_id/eta', updateEta);

// Late check-in
router.post('/late-checkin', recordLateCheckin);
router.get('/late-checkins/:doctor_id', getLateCheckins);

// Dashboard (analytics)
router.get('/availability-dashboard/:doctor_id', getAvailabilityDashboard);

module.exports = router;
