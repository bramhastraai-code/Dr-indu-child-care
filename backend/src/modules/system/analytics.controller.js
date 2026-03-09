const Appointment = require('../../models/Appointment');
const Feedback = require('../../models/Feedback');
const Patient = require('../../models/Patient');
const { toMidnight } = require('../../utils/helpers');

// @desc    Get appointment analytics
// @route   GET /api/analytics/appointments
// @access  Super Admin Only
exports.getAppointmentAnalytics = async (req, res) => {
    try {
        const { from_date, to_date, doctor_id, visit_category } = req.query;

        const filter = { is_deleted: false };
        if (from_date || to_date) {
            filter.appointment_date = {};
            if (from_date) filter.appointment_date.$gte = toMidnight(from_date);
            if (to_date) filter.appointment_date.$lte = toMidnight(to_date);
        }
        if (doctor_id) filter.doctor_id = doctor_id;
        if (visit_category) filter.visit_category = visit_category;

        const [total, byCategory, noShowCount] = await Promise.all([
            Appointment.countDocuments(filter),
            Appointment.aggregate([
                { $match: filter },
                { $group: { _id: '$visit_category', count: { $sum: 1 } } }
            ]),
            Appointment.countDocuments({ ...filter, status: 'no_show' })
        ]);

        res.json({
            success: true,
            data: {
                total_appointments: total,
                breakdown_by_category: byCategory.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                no_show_count: noShowCount
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get token analytics
// @route   GET /api/analytics/tokens
// @access  Super Admin Only
exports.getTokenAnalytics = async (req, res) => {
    try {
        const { from_date, to_date, doctor_id } = req.query;

        const filter = { is_deleted: false, token_number: { $ne: null } };
        if (from_date || to_date) {
            filter.appointment_date = {};
            if (from_date) filter.appointment_date.$gte = toMidnight(from_date);
            if (to_date) filter.appointment_date.$lte = toMidnight(to_date);
        }
        if (doctor_id) filter.doctor_id = doctor_id;

        const [onlineSplit, walkinSplit] = await Promise.all([
            Appointment.countDocuments({ ...filter, registration_type: 'online' }),
            Appointment.countDocuments({ ...filter, registration_type: 'walkin' })
        ]);

        res.json({
            success: true,
            data: {
                total_tokens_issued: onlineSplit + walkinSplit,
                online_tokens: onlineSplit,
                walkin_tokens: walkinSplit,
                utilisation_percentage: ((onlineSplit + walkinSplit) / (onlineSplit + walkinSplit + 1)) * 100 // Example logic
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get registration analytics
// @route   GET /api/analytics/registrations
// @access  Super Admin Only
exports.getRegistrationAnalytics = async (req, res) => {
    try {
        const { from_date, to_date } = req.query;

        const filter = { is_deleted: false };
        if (from_date || to_date) {
            filter.registered_at = {};
            if (from_date) filter.registered_at.$gte = new Date(from_date);
            if (to_date) filter.registered_at.$lte = new Date(to_date);
        }

        const counts = await Patient.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$registered_at" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            success: true,
            data: {
                registrations: counts.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                total: counts.reduce((sum, curr) => sum + curr.count, 0)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get feedback analytics
// @route   GET /api/analytics/feedback
// @access  Super Admin Only
exports.getFeedbackAnalytics = async (req, res) => {
    try {
        const { from_date, to_date, doctor_id } = req.query;

        const filter = {};
        if (from_date || to_date) {
            filter.submitted_at = {};
            if (from_date) filter.submitted_at.$gte = new Date(from_date);
            if (to_date) filter.submitted_at.$lte = new Date(to_date);
        }

        // If doctor_id is provided, we need to join with Appointment
        let aggregateMatch = { ...filter };
        if (doctor_id) {
            // This would require a lookup if appointment_id is stored
            // For now, simplified aggregate
        }

        const averages = await Feedback.aggregate([
            { $match: aggregateMatch },
            {
                $group: {
                    _id: null,
                    avg_doctor: { $avg: "$doctor_rating" },
                    avg_frontdesk: { $avg: "$frontdesk_rating" },
                    avg_hospital: { $avg: "$hospital_rating" },
                    total_responses: { $sum: 1 }
                }
            }
        ]);

        const result = averages[0] || { avg_doctor: 0, avg_frontdesk: 0, avg_hospital: 0, total_responses: 0 };

        res.json({
            success: true,
            data: {
                average_doctor_rating: result.avg_doctor.toFixed(1),
                average_frontdesk_rating: result.avg_frontdesk.toFixed(1),
                average_hospital_rating: result.avg_hospital.toFixed(1),
                total_responses: result.total_responses
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get practice insights (unified dashboard)
// @route   GET /api/analytics/practice-insights
exports.getPracticeInsights = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const last7Days = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

        const [
            totalPatients,
            newPatientsMonth,
            appointments7Days,
            visitCategories,
            whatsappBookings,
            totalBookings,
            tokenUsage
        ] = await Promise.all([
            Patient.countDocuments({ is_deleted: false }),
            Patient.countDocuments({ is_deleted: false, registered_at: { $gte: startOfMonth } }),
            Appointment.aggregate([
                { $match: { is_deleted: false, appointment_date: { $gte: toMidnight(last7Days) } } },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$appointment_date" } },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]),
            Appointment.aggregate([
                { $match: { is_deleted: false, appointment_date: { $gte: toMidnight(startOfMonth) } } },
                { $group: { _id: '$visit_category', count: { $sum: 1 } } }
            ]),
            Appointment.countDocuments({ is_deleted: false, booking_source: 'whatsapp' }),
            Appointment.countDocuments({ is_deleted: false }),
            Appointment.countDocuments({
                is_deleted: false,
                appointment_date: toMidnight(now),
                token_number: { $ne: null }
            })
        ]);

        // Calculate growth (simple mock calculation for demo, normally would compare with prev month)
        const growth = totalPatients > 0 ? (newPatientsMonth / totalPatients * 100).toFixed(1) : 0;

        // Process timeline data to ensure all 7 days are present
        const timeline = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
            const ds = d.toISOString().split('T')[0];
            const match = appointments7Days.find(a => a._id === ds);
            timeline.push({
                day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
                count: match ? match.count : 0,
                fullDate: ds
            });
        }

        res.json({
            success: true,
            data: {
                metrics: {
                    total_patients: totalPatients,
                    monthly_new: newPatientsMonth,
                    growth_percentage: growth,
                    direct_booking_percentage: totalBookings > 0 ? (whatsappBookings / totalBookings * 100).toFixed(1) : 0,
                    today_tokens: tokenUsage,
                    avg_wait_time: 15 // Mocked for now, normally would aggregate consultation durations
                },
                timeline,
                categories: visitCategories.reduce((acc, curr) => {
                    acc[curr._id || 'General'] = curr.count;
                    return acc;
                }, {})
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
