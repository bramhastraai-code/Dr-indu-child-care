const Feedback = require('../../models/Feedback');
const audit = require('../../utils/audit');

// @desc    Submit feedback
// @route   POST /api/feedback
// @access  Public (Rate limited)
exports.submitFeedback = async (req, res) => {
    try {
        const { 
            name, 
            mobile, 
            email, 
            doctor_rating, 
            frontdesk_rating, 
            hospital_rating, 
            suggestions,
            appointment_id 
        } = req.body || {};

        if (!doctor_rating || !frontdesk_rating || !hospital_rating) {
            return res.status(400).json({ success: false, message: 'All ratings (doctor, frontdesk, hospital) are required.' });
        }

        const feedback = await Feedback.create({
            name: name || null,
            mobile: mobile || null,
            email: email || null,
            doctor_rating,
            frontdesk_rating,
            hospital_rating,
            suggestions: suggestions || null,
            appointment_id: appointment_id || null,
            ip_address: req.ip || req.headers['x-forwarded-for'] || 'unknown',
            submitted_at: new Date()
        });

        res.status(201).json({ success: true, message: 'Thank you for your feedback!', data: feedback });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get all feedback
// @route   GET /api/feedback
// @access  Super Admin Only
exports.getFeedback = async (req, res) => {
    try {
        let { from_date, to_date, doctor_id, page = 1, limit = 20 } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const skip = (page - 1) * limit;

        const filter = {};
        if (from_date || to_date) {
            filter.submitted_at = {};
            if (from_date) filter.submitted_at.$gte = new Date(from_date);
            if (to_date) filter.submitted_at.$lte = new Date(to_date);
        }

        // doctor_id filtering would require matching appointment_id if provided
        // For now, simplified list

        const [feedback, total] = await Promise.all([
            Feedback.find(filter).sort({ submitted_at: -1 }).skip(skip).limit(limit),
            Feedback.countDocuments(filter)
        ]);

        res.json({
            success: true,
            count: feedback.length,
            total,
            pagination: { page, limit, pages: Math.ceil(total / limit) },
            data: feedback
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
