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
const authorize = require('../../middleware/rbac');

const SLOT_READ_ROLES = ['superadmin', 'admin', 'staff', 'secretary', 'doctor'];
const SLOT_MANAGE_ROLES = ['superadmin', 'admin', 'staff', 'secretary', 'doctor'];
const SLOT_CONFIG_ROLES = ['superadmin', 'admin', 'doctor'];

router.use(auth);

// All slot endpoints — public (no auth required)
router.get('/available', authorize(SLOT_READ_ROLES), getAvailableSlots);
router.get('/daily-status', authorize(SLOT_READ_ROLES), getDailyStatus);
router.post('/block', authorize(SLOT_MANAGE_ROLES), blockSlot);
router.post('/unblock', authorize(SLOT_MANAGE_ROLES), unblockSlot);

router.get('/config', authorize(SLOT_CONFIG_ROLES), getSlotConfig);
router.put('/config', authorize(SLOT_CONFIG_ROLES), updateSlotConfig);
router.post('/config/add', authorize(SLOT_CONFIG_ROLES), createSlot);
router.delete('/config/:slot_id', authorize(SLOT_CONFIG_ROLES), deleteSlot);
router.post('/daily-update', authorize(SLOT_MANAGE_ROLES), updateDailySlot);

router.get('/doctor-slots/:doctor_id', authorize(SLOT_READ_ROLES), getDoctorSlots);

module.exports = router;
