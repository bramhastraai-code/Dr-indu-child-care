const express = require('express');
const router = express.Router();
const {
    getAvailableSlots,
    getDailyStatus,
    blockSlot,
    unblockSlot,
    getSlotConfig,
    updateSlotConfig,
    createSlot,
    deleteSlot,
    updateDailySlot,
    getDoctorSlots
} = require('./slot.controller');
const auth = require('../../middleware/auth');

router.use(auth);

// All slot endpoints — public (no auth required)
router.get('/available', getAvailableSlots);
router.get('/daily-status', getDailyStatus);
router.post('/block', blockSlot);
router.post('/unblock', unblockSlot);

router.get('/config', getSlotConfig);
router.put('/config', updateSlotConfig);
router.post('/config/add', createSlot);
router.delete('/config/:slot_id', deleteSlot);
router.post('/daily-update', updateDailySlot);

router.get('/doctor-slots/:doctor_id', getDoctorSlots);

module.exports = router;
