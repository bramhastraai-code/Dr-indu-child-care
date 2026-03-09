const express = require('express');
const router = express.Router();
const {
    getSchedule,
    setSchedule,
    getTodaySchedule,
    getScheduleHistory,
    getAvailability,
    getAvailabilityDashboard,
    updateAvailability,
    updateAvailabilityStatus,
    updateAvailabilityEta,
    logLateCheckin,
    getLateCheckins,
    setTodayStartTime,
    notifyPatientsOfTime
} = require('./availability.controller');

// ── Doctor Weekly Arrival Schedule ───────────────────────────────────────────
// GET  /api/doctor/schedule/:doctor_id           → Full weekly schedule
// PUT  /api/doctor/schedule/:doctor_id           → Set/update weekly schedule
// GET  /api/doctor/schedule/:doctor_id/today     → Today's arrival time
// GET  /api/doctor/schedule/:doctor_id/history   → Full change history

router.get('/schedule/:doctor_id/today', getTodaySchedule);
router.get('/schedule/:doctor_id/history', getScheduleHistory);
router.get('/schedule/:doctor_id', getSchedule);
router.put('/schedule/:doctor_id', setSchedule);

// Availability endpoints used by the dashboard
router.get('/availability/:doctor_id', getAvailability);
router.get('/availability-dashboard/:doctor_id', getAvailabilityDashboard);
router.post('/availability/update', updateAvailability);
router.patch('/availability/:doctor_id/status', updateAvailabilityStatus);
router.patch('/availability/:doctor_id/eta', updateAvailabilityEta);
router.post('/late-checkin', logLateCheckin);
router.get('/late-checkins/:doctor_id', getLateCheckins);

// ── Doctor sets actual start time for today → recalculates all token times (silent)
router.patch('/today-start', setTodayStartTime);

// ── Doctor/receptionist explicitly triggers patient notifications
router.post('/notify-patients', notifyPatientsOfTime);

module.exports = router;
