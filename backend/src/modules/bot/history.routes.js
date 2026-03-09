const express = require('express');
const router = express.Router();
const {
    getHistoryByPatientId,
    getHistoryByWaId,
    searchHistory,
    getRecentConversations
} = require('./history.controller');
const auth = require('../../middleware/auth');

// All bot history routes require authentication (for clinic staff)
router.use(auth);

// Search unified history (by mobile or patient_id)
router.get('/search', searchHistory);

// Get history specifically for a patient_id
router.get('/patient/:patient_id', getHistoryByPatientId);

// Get history specifically for a WhatsApp ID (raw or hashed)
router.get('/wa/:wa_id', getHistoryByWaId);

// Get a list of the latest conversations across all patients
router.get('/recent', getRecentConversations);

module.exports = router;
