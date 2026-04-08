const express = require('express');
const {
  getChildHistories,
  getChildHistory,
  createChildHistory,
  updateChildHistory,
  deleteChildHistory
} = require('./childHistory.controller');

const { validateCreate, validateUpdate } = require('./childHistory.validator');

// Auth middleware if available in your project structure (like auth.js, rbac.js)
const auth = require('../../middleware/auth');
// const authorize = require('../../middleware/rbac');

const router = express.Router({ mergeParams: true });

// Attach auth here if needed for all routes
// router.use(auth);

router
  .route('/')
  .get(getChildHistories)
  .post(validateCreate, createChildHistory);

router
  .route('/:id')
  .get(getChildHistory)
  .put(validateUpdate, updateChildHistory)
  .delete(deleteChildHistory);

module.exports = router;
