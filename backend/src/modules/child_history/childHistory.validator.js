// backend/src/modules/child_history/childHistory.validator.js
// Validation for child history

exports.validateCreate = (req, res, next) => {
  const { PID, History } = req.body;

  if (!PID) {
    return res.status(400).json({
      success: false,
      error: 'Please add a PID (Patient ID)'
    });
  }

  if (!History) {
    return res.status(400).json({
      success: false,
      error: 'Please add History content'
    });
  }

  next();
};

exports.validateUpdate = (req, res, next) => {
  // Add field level validation here if needed for updates
  next();
};
