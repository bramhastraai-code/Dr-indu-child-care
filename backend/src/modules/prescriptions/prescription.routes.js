const express = require('express');
const {
  getPrescriptions,
  getPrescription,
  createPrescription,
  updatePrescription,
  deletePrescription
} = require('./prescription.controller');

const { validateCreate, validateUpdate } = require('./prescription.validator');

// Auth middleware if available in your project structure (like auth.js, rbac.js)
const auth = require('../../middleware/auth');
// const authorize = require('../../middleware/rbac');

const router = express.Router({ mergeParams: true });

// Attach auth here if needed for all routes
// router.use(auth);

router
  .route('/')
  .get(getPrescriptions)
  .post(validateCreate, createPrescription);

router
  .route('/:id')
  .get(getPrescription)
  .put(validateUpdate, updatePrescription)
  .delete(deletePrescription);

module.exports = router;
