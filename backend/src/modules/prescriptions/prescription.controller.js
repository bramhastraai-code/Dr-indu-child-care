const Prescription = require('../../models/Prescription');

// @desc    Get all prescriptions
// @route   GET /api/prescriptions
// @access  Private/Admin
exports.getPrescriptions = async (req, res, next) => {
  try {
    const filter = req.query.patientId ? { patientId: req.query.patientId } : {};
    
    // Default ignore removed
    if (!req.query.includeRemoved) {
      filter['metadata.isRemoved'] = { $ne: true };
    }

    const prescriptions = await Prescription.find(filter).sort('-createdAt');

    res.status(200).json({
      success: true,
      count: prescriptions.length,
      data: prescriptions
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Get single prescription
// @route   GET /api/prescriptions/:id
// @access  Private/Admin
exports.getPrescription = async (req, res, next) => {
  try {
    const prescription = await Prescription.findById(req.params.id);

    if (!prescription) {
      return res.status(404).json({ success: false, error: 'Prescription not found' });
    }

    res.status(200).json({
      success: true,
      data: prescription
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Create new prescription
// @route   POST /api/prescriptions
// @access  Private/Admin
exports.createPrescription = async (req, res, next) => {
  try {
    // Add default user metadata if authenticated
    if (req.user && !req.body.metadata?.createdBy) {
      req.body.metadata = req.body.metadata || {};
      req.body.metadata.createdBy = req.user.id || 1; // Assuming your user has an ID
    }

    const prescription = await Prescription.create(req.body);

    res.status(201).json({
      success: true,
      data: prescription
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// @desc    Update prescription
// @route   PUT /api/prescriptions/:id
// @access  Private/Admin
exports.updatePrescription = async (req, res, next) => {
  try {
    const prescription = await Prescription.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!prescription) {
      return res.status(404).json({ success: false, error: 'Prescription not found' });
    }

    res.status(200).json({
      success: true,
      data: prescription
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// @desc    Delete (soft remove) prescription
// @route   DELETE /api/prescriptions/:id
// @access  Private/Admin
exports.deletePrescription = async (req, res, next) => {
  try {
    const prescription = await Prescription.findById(req.params.id);

    if (!prescription) {
      return res.status(404).json({ success: false, error: 'Prescription not found' });
    }

    // Soft delete
    prescription.metadata.isRemoved = true;
    await prescription.save();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
