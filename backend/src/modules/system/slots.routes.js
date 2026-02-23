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
const authorize = require('../../middleware/rbac');
const auth = require('../../middleware/auth');

router.use(auth);

router.get('/available', getAvailableSlots);
router.get('/daily-status', getDailyStatus);
router.post('/block', blockSlot);
router.post('/unblock', unblockSlot);

// Only admin/superadmin can modify slot config
router.get('/config', getSlotConfig);
router.put('/config', authorize(['superadmin', 'admin']), updateSlotConfig);
router.post('/config/add', authorize(['superadmin', 'admin']), createSlot);
router.delete('/config/:slot_id', authorize(['superadmin', 'admin']), deleteSlot);
router.post('/daily-update', authorize(['superadmin', 'admin']), updateDailySlot);

module.exports = router;
