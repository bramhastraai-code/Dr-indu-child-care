const express = require('express');
const router = express.Router();
const {
    getAppointmentAnalytics,
    getTokenAnalytics,
    getRegistrationAnalytics,
    getFeedbackAnalytics,
    getPracticeInsights,
    getVaccineAnalytics,
    getDemographicAnalytics,
    getTopReferrers
} = require('./analytics.controller');

const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');

// All analytics endpoints are now public

router.get('/appointments', getAppointmentAnalytics);
router.get('/tokens', getTokenAnalytics);
router.get('/registrations', getRegistrationAnalytics);
router.get('/feedback', getFeedbackAnalytics);
router.get('/practice-insights', getPracticeInsights);
router.get('/vaccines', getVaccineAnalytics);
router.get('/demographics', getDemographicAnalytics);
router.get('/referrers', getTopReferrers);

module.exports = router;
