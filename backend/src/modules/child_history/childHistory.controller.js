const ChildHistory = require('../../models/ChildHistory');

// @desc    Get all child histories
// @route   GET /api/child-history
// @access  Private/Admin
exports.getChildHistories = async (req, res, next) => {
  try {
    const filter = req.query.PID ? { PID: req.query.PID } : {};
    
    // Default ignore removed
    if (!req.query.includeRemoved) {
      filter.IsRemove = { $ne: true };
    }

    const histories = await ChildHistory.find(filter).sort('-CreatedOn -createdAt');

    res.status(200).json({
      success: true,
      count: histories.length,
      data: histories
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Get single child history
// @route   GET /api/child-history/:id
// @access  Private/Admin
exports.getChildHistory = async (req, res, next) => {
  try {
    const history = await ChildHistory.findById(req.params.id);

    if (!history) {
      return res.status(404).json({ success: false, error: 'Child History not found' });
    }

    res.status(200).json({
      success: true,
      data: history
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Create new child history
// @route   POST /api/child-history
// @access  Private/Admin
exports.createChildHistory = async (req, res, next) => {
  try {
    // Add default user metadata if authenticated
    if (req.user && !req.body.CreatedBy) {
      req.body.CreatedBy = req.user.id || 0;
    }

    const history = await ChildHistory.create(req.body);

    res.status(201).json({
      success: true,
      data: history
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// @desc    Update child history
// @route   PUT /api/child-history/:id
// @access  Private/Admin
exports.updateChildHistory = async (req, res, next) => {
  try {
    const history = await ChildHistory.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!history) {
      return res.status(404).json({ success: false, error: 'Child History not found' });
    }

    res.status(200).json({
      success: true,
      data: history
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// @desc    Delete (soft remove) child history
// @route   DELETE /api/child-history/:id
// @access  Private/Admin
exports.deleteChildHistory = async (req, res, next) => {
  try {
    const history = await ChildHistory.findById(req.params.id);

    if (!history) {
      return res.status(404).json({ success: false, error: 'Child History not found' });
    }

    // Soft delete
    history.IsRemove = true;
    
    await history.save();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
