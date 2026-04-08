// backend/src/modules/prescriptions/prescription.validator.js
// Validation for prescriptions

exports.validateCreate = (req, res, next) => {
  const { patientId, prescription } = req.body;

  if (!patientId) {
    return res.status(400).json({
      success: false,
      error: 'Please add a patientId'
    });
  }

  if (!prescription || !prescription.medication) {
    return res.status(400).json({
      success: false,
      error: 'Please add prescription details with a medication name'
    });
  }

  next();
};

exports.validateUpdate = (req, res, next) => {
  // Add field level validation here if needed for updates
  next();
};
