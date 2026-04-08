// backend/src/modules/vaccinations/vaccination.validator.js
// Validation for vaccinations

exports.validateCreate = (req, res, next) => {
  const { patientId, vaccine } = req.body;

  if (!patientId) {
    return res.status(400).json({
      success: false,
      error: 'Please add a patientId'
    });
  }

  if (!vaccine || vaccine.vaccineId === undefined) {
    return res.status(400).json({
      success: false,
      error: 'Please add vaccine details with a vaccineId'
    });
  }

  next();
};

exports.validateUpdate = (req, res, next) => {
  // Add field level validation here if needed for updates
  next();
};
