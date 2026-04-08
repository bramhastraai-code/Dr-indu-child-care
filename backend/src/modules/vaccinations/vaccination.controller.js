const Vaccination = require('../../models/Vaccination');

// @desc    Get all vaccinations
// @route   GET /api/vaccinations
// @access  Private/Admin
exports.getVaccinations = async (req, res, next) => {
  try {
    const filter = req.query.patientId ? { patientId: req.query.patientId } : {};
    
    // Default ignore removed
    if (!req.query.includeRemoved) {
      filter['metadata.isRemoved'] = { $ne: true };
    }

    const vaccinations = await Vaccination.find(filter).sort('-createdAt');

    res.status(200).json({
      success: true,
      count: vaccinations.length,
      data: vaccinations
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Get single vaccination
// @route   GET /api/vaccinations/:id
// @access  Private/Admin
exports.getVaccination = async (req, res, next) => {
  try {
    const vaccination = await Vaccination.findById(req.params.id);

    if (!vaccination) {
      return res.status(404).json({ success: false, error: 'Vaccination not found' });
    }

    res.status(200).json({
      success: true,
      data: vaccination
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Create new vaccination
// @route   POST /api/vaccinations
// @access  Private/Admin
exports.createVaccination = async (req, res, next) => {
  try {
    // Add default user metadata if authenticated
    if (req.user && !req.body.metadata?.createdBy) {
      req.body.metadata = req.body.metadata || {};
      req.body.metadata.createdBy = req.user.id || 1; // Assuming your user has an ID
    }

    const vaccination = await Vaccination.create(req.body);

    res.status(201).json({
      success: true,
      data: vaccination
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// @desc    Update vaccination
// @route   PUT /api/vaccinations/:id
// @access  Private/Admin
exports.updateVaccination = async (req, res, next) => {
  try {
    if (req.user && !req.body.metadata?.modifiedBy) {
      req.body.metadata = req.body.metadata || {};
      req.body.metadata.modifiedBy = req.user.id || 1;
      req.body.metadata.modifiedOn = Date.now();
    }

    const vaccination = await Vaccination.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!vaccination) {
      return res.status(404).json({ success: false, error: 'Vaccination not found' });
    }

    res.status(200).json({
      success: true,
      data: vaccination
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// @desc    Delete (soft remove) vaccination
// @route   DELETE /api/vaccinations/:id
// @access  Private/Admin
exports.deleteVaccination = async (req, res, next) => {
  try {
    const vaccination = await Vaccination.findById(req.params.id);

    if (!vaccination) {
      return res.status(404).json({ success: false, error: 'Vaccination not found' });
    }

    // Soft delete
    if (!vaccination.metadata) vaccination.metadata = {};
    vaccination.metadata.isRemoved = true;
    vaccination.metadata.modifiedBy = req.user ? req.user.id : 1;
    vaccination.metadata.modifiedOn = Date.now();
    
    await vaccination.save();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
