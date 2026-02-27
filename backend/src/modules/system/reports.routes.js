const express = require('express');
const router = express.Router();
const Patient = require('../../models/Patient');
const Appointment = require('../../models/Appointment');
const { toMidnight } = require('../../utils/helpers');

// GET /api/reports/dashboard — public
router.get('/dashboard', async (req, res) => {
    try {
        const today = toMidnight(new Date());
        const tomorrow = new Date(today);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        const sevenDaysLater = new Date(today);
        sevenDaysLater.setUTCDate(sevenDaysLater.getUTCDate() + 7);
        const startOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

        const [totalPatients, todayAppts, upcomingAppts, newThisMonth, doctorStats, statusBreakdown] = await Promise.all([
            Patient.countDocuments({ is_deleted: false }),
            Appointment.countDocuments({ appointment_date: today, status: { $in: ['BOOKED', 'CONFIRMED'] } }),
            Appointment.countDocuments({ appointment_date: { $gte: tomorrow, $lte: sevenDaysLater }, status: { $in: ['BOOKED', 'CONFIRMED'] } }),
            Patient.countDocuments({ is_deleted: false, registered_at: { $gte: startOfMonth } }),
            Appointment.aggregate([
                { $match: { appointment_date: { $gte: today, $lte: sevenDaysLater } } },
                { $group: { _id: '$doctor_name', count: { $sum: 1 } } }
            ]),
            Appointment.aggregate([
                { $match: { appointment_date: today } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ])
        ]);

        const doctorUtilization = {};
        doctorStats.forEach(d => { if (d._id) doctorUtilization[d._id] = d.count; });

        const statusMap = {};
        statusBreakdown.forEach(s => { if (s._id) statusMap[s._id.toLowerCase()] = s.count; });

        res.json({
            success: true,
            data: {
                total_patients: totalPatients,
                appointments_today: todayAppts,
                appointments_upcoming_7days: upcomingAppts,
                new_registrations_this_month: newThisMonth,
                today_status_breakdown: statusMap,
                doctor_utilization: doctorUtilization
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/reports/appointments — public
router.get('/appointments', async (req, res) => {
    try {
        const { date_from, date_to, doctor_id, doctor_name, status, booking_source, page = 1, limit = 100 } = req.query;

        const filter = {};
        if (date_from || date_to) {
            filter.appointment_date = {};
            if (date_from) filter.appointment_date.$gte = toMidnight(date_from);
            if (date_to) filter.appointment_date.$lte = toMidnight(date_to);
        }
        if (doctor_id) filter.doctor_id = doctor_id;
        if (doctor_name) filter.doctor_name = new RegExp(doctor_name, 'i');
        if (status) filter.status = status.toUpperCase();
        if (booking_source) filter.booking_source = booking_source.toLowerCase();

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [appointments, statusSummary, total] = await Promise.all([
            Appointment.find(filter).sort({ appointment_date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
            Appointment.aggregate([
                { $match: filter },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            Appointment.countDocuments(filter)
        ]);

        const summary = statusSummary.reduce((acc, s) => {
            acc[s._id?.toLowerCase() || 'unknown'] = s.count;
            return acc;
        }, { total });

        res.json({
            success: true,
            summary,
            pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
            data: appointments
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/reports/patients — public
router.get('/patients', async (req, res) => {
    try {
        const [byCity, byGender, bySource, byAgeGroup, registrationTrend, total] = await Promise.all([
            Patient.aggregate([{ $match: { is_deleted: false } }, { $group: { _id: '$city', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
            Patient.aggregate([{ $match: { is_deleted: false } }, { $group: { _id: '$gender', count: { $sum: 1 } } }]),
            Patient.aggregate([{ $match: { is_deleted: false } }, { $group: { _id: '$registration_source', count: { $sum: 1 } } }]),
            Patient.aggregate([
                { $match: { is_deleted: false, age_years: { $exists: true, $ne: null } } },
                {
                    $bucket: {
                        groupBy: '$age_years',
                        boundaries: [0, 1, 2, 5, 10, 15],
                        default: '15+',
                        output: { count: { $sum: 1 } }
                    }
                }
            ]),
            Patient.aggregate([
                { $match: { is_deleted: false } },
                {
                    $group: {
                        _id: { year: { $year: '$registered_at' }, month: { $month: '$registered_at' } },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { '_id.year': -1, '_id.month': -1 } },
                { $limit: 12 }
            ]),
            Patient.countDocuments({ is_deleted: false })
        ]);

        const toObj = (arr) => arr.reduce((acc, { _id, count }) => { if (_id) acc[_id] = count; return acc; }, {});

        res.json({
            success: true,
            data: {
                total_patients: total,
                by_city: toObj(byCity),
                by_gender: toObj(byGender),
                by_registration_source: toObj(bySource),
                by_age_group: byAgeGroup,
                registration_trend: registrationTrend.map(r => ({
                    year: r._id.year,
                    month: r._id.month,
                    count: r.count
                }))
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
