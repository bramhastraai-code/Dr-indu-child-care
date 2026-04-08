const express = require('express');
const {
  getVaccinations,
  getVaccination,
  createVaccination,
  updateVaccination,
  deleteVaccination
} = require('./vaccination.controller');

const { validateCreate, validateUpdate } = require('./vaccination.validator');

// Auth middleware if available in your project structure (like auth.js, rbac.js)
const auth = require('../../middleware/auth');
// const authorize = require('../../middleware/rbac');

const router = express.Router({ mergeParams: true });

// Attach auth here if needed for all routes
// router.use(auth);

router
  .route('/')
  .get(getVaccinations)
  .post(validateCreate, createVaccination);

router
  .route('/:id')
  .get(getVaccination)
  .put(validateUpdate, updateVaccination)
  .delete(deleteVaccination);

module.exports = router;
