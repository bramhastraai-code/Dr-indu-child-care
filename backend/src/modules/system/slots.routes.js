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
    updateDailySlot
} = require('./slot.controller');

// All routes are public for external integrations like n8n
router.get('/available', getAvailableSlots);
router.get('/daily-status', getDailyStatus);
router.post('/block', blockSlot);
router.post('/unblock', unblockSlot);

// Slot configurations
router.get('/config', getSlotConfig);
router.put('/config', updateSlotConfig);
router.post('/config/add', createSlot);
router.delete('/config/:slot_id', deleteSlot);
router.post('/daily-update', updateDailySlot);

module.exports = router;
