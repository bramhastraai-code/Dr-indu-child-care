const express = require('express');
const router = express.Router();
const {
    createCamp,
    getCamps,
    getCampById,
    updateCamp,
    updateCampStatus,
    deleteCamp,
    getCampStats
} = require('./camp.controller');

// ── Static routes first ──────────────────────────────────────────────────────
router.get('/stats', getCampStats);

// ── Core CRUD ────────────────────────────────────────────────────────────────
router.get('/', getCamps);
router.post('/', createCamp);

// ── Camp-specific routes ─────────────────────────────────────────────────────
router.get('/:id', getCampById);
router.patch('/:id', updateCamp);
router.patch('/:id/status', updateCampStatus);
router.delete('/:id', deleteCamp);

module.exports = router;
