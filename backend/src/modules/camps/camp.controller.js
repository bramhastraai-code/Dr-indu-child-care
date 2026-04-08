const Camp = require('../../models/Camp');

// @desc  Create a new camp
// @route POST /api/camps
exports.createCamp = async (req, res, next) => {
    try {
        const data = { ...req.body, created_by: req.user?.username || 'admin' };
        const camp = await Camp.create(data);
        res.status(201).json({ success: true, data: camp });
    } catch (err) { next(err); }
};

// @desc  Get all camps (with filters)
// @route GET /api/camps
exports.getCamps = async (req, res, next) => {
    try {
        const { status, camp_type, from, to, search, page = 1, limit = 20 } = req.query;
        const query = { is_deleted: false };
        if (status) query.status = status;
        if (camp_type) query.camp_type = camp_type;
        if (search) {
            const r = new RegExp(search, 'i');
            query.$or = [{ camp_name: r }, { 'location.venue': r }, { 'location.city': r }, { organizer: r }];
        }
        if (from || to) {
            query.scheduled_date = {};
            if (from) query.scheduled_date.$gte = new Date(from);
            if (to) query.scheduled_date.$lte = new Date(to);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [camps, total] = await Promise.all([
            Camp.find(query).sort({ scheduled_date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
            Camp.countDocuments(query)
        ]);

        res.json({
            success: true,
            count: camps.length,
            total,
            pagination: { page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
            data: camps
        });
    } catch (err) { next(err); }
};

// @desc  Get a single camp
// @route GET /api/camps/:id
exports.getCampById = async (req, res, next) => {
    try {
        const camp = await Camp.findOne({ _id: req.params.id, is_deleted: false });
        if (!camp) return res.status(404).json({ success: false, message: 'Camp not found' });
        res.json({ success: true, data: camp });
    } catch (err) { next(err); }
};

// @desc  Update a camp
// @route PATCH /api/camps/:id
exports.updateCamp = async (req, res, next) => {
    try {
        const updates = { ...req.body };
        delete updates._id;
        const camp = await Camp.findOneAndUpdate(
            { _id: req.params.id, is_deleted: false },
            { $set: updates },
            { new: true, runValidators: true }
        );
        if (!camp) return res.status(404).json({ success: false, message: 'Camp not found' });
        res.json({ success: true, data: camp });
    } catch (err) { next(err); }
};

// @desc  Update camp status
// @route PATCH /api/camps/:id/status
exports.updateCampStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ success: false, message: 'Status is required' });
        const camp = await Camp.findOneAndUpdate(
            { _id: req.params.id, is_deleted: false },
            { $set: { status } },
            { new: true }
        );
        if (!camp) return res.status(404).json({ success: false, message: 'Camp not found' });
        res.json({ success: true, data: camp });
    } catch (err) { next(err); }
};

// @desc  Delete (soft) a camp
// @route DELETE /api/camps/:id
exports.deleteCamp = async (req, res, next) => {
    try {
        const camp = await Camp.findOneAndUpdate(
            { _id: req.params.id, is_deleted: false },
            { $set: { is_deleted: true, status: 'cancelled' } },
            { new: true }
        );
        if (!camp) return res.status(404).json({ success: false, message: 'Camp not found' });
        res.json({ success: true, message: 'Camp deleted successfully' });
    } catch (err) { next(err); }
};

// @desc  Get camp stats (summary)
// @route GET /api/camps/stats
exports.getCampStats = async (req, res, next) => {
    try {
        const now = new Date();
        const [total, scheduled, ongoing, completed, cancelled, upcoming] = await Promise.all([
            Camp.countDocuments({ is_deleted: false }),
            Camp.countDocuments({ is_deleted: false, status: 'scheduled' }),
            Camp.countDocuments({ is_deleted: false, status: 'ongoing' }),
            Camp.countDocuments({ is_deleted: false, status: 'completed' }),
            Camp.countDocuments({ is_deleted: false, status: 'cancelled' }),
            Camp.countDocuments({ is_deleted: false, status: 'scheduled', scheduled_date: { $gte: now } })
        ]);

        const byType = await Camp.aggregate([
            { $match: { is_deleted: false } },
            { $group: { _id: '$camp_type', count: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            data: {
                total, scheduled, ongoing, completed, cancelled, upcoming,
                by_type: byType.reduce((acc, { _id, count }) => { if (_id) acc[_id] = count; return acc; }, {})
            }
        });
    } catch (err) { next(err); }
};
