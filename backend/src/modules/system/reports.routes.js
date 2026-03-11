const express = require('express');
const router = express.Router();
const Patient = require('../../models/Patient');
const Appointment = require('../../models/Appointment');
const { toMidnight } = require('../../utils/helpers');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/rbac');
const {
    getDoctorIdFromSession,
    ensureDoctorSessionHasProfile
} = require('../../utils/doctorScope');

const REPORT_ROLES = ['superadmin', 'admin', 'staff', 'secretary', 'doctor'];

// GET /api/reports/dashboard — public
router.get('/dashboard', async (req, res) => {
    try {
        const sessionDoctorId = getDoctorIdFromSession(req);
        const { date_from, date_to, doctor_id } = req.query;

        const filter = { is_deleted: false };
        if (date_from || date_to) {
            filter.appointment_date = {};
            if (date_from) filter.appointment_date.$gte = toMidnight(date_from);
            if (date_to) filter.appointment_date.$lte = toMidnight(new Date(new Date(date_to).getTime() + 86400000)); // End of day
        } else {
            const today = toMidnight(new Date());
            const thirtyDaysAgo = new Date(today);
            thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
            filter.appointment_date = { $gte: thirtyDaysAgo, $lte: new Date(today.getTime() + 86400000) };
        }

        if (sessionDoctorId) {
            filter.doctor_id = sessionDoctorId;
        } else if (doctor_id) {
            filter.doctor_id = doctor_id;
        }

        const statsAgg = await Appointment.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    total_appointments: { $sum: 1 },
                    completed: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } },
                    cancelled: { $sum: { $cond: [{ $eq: ["$status", "CANCELLED"] }, 1, 0] } },
                    no_show: { $sum: { $cond: [{ $eq: ["$status", "NO_SHOW"] }, 1, 0] } },
                    patients: { $addToSet: "$patient_id" }
                }
            }
        ]);

        const stats = statsAgg[0] || { total_appointments: 0, completed: 0, cancelled: 0, no_show: 0, patients: [] };

        const docVisitsAgg = await Appointment.aggregate([
            { $match: filter },
            { $group: { _id: "$doctor_name", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const doctor_visits = docVisitsAgg.map(d => ({ name: d._id || 'Unassigned', count: d.count }));

        const catAgg = await Appointment.aggregate([
            { $match: filter },
            { $group: { _id: "$visit_category", count: { $sum: 1 } } }
        ]);

        const categories = {};
        catAgg.forEach(c => {
            const catStr = c._id || 'General';
            categories[catStr] = c.count;
        });

        // Weekly trends for last 30 days
        const trendStart = filter.appointment_date.$gte || new Date(Date.now() - 30 * 86400000);
        const trendsAgg = await Appointment.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: { $floor: { $divide: [{ $subtract: ["$appointment_date", trendStart] }, 7 * 24 * 60 * 60 * 1000] } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        const trends = [0, 0, 0, 0];
        trendsAgg.forEach(t => {
            if (t._id >= 0 && t._id < 4) {
                trends[t._id] = t.count;
            }
        });

        res.json({
            success: true,
            data: {
                total_appointments: stats.total_appointments,
                completed: stats.completed,
                cancelled: stats.cancelled,
                no_show: stats.no_show,
                unique_patients: stats.patients.length,
                doctor_visits,
                categories,
                trends
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/reports/appointments — public
router.get('/appointments', async (req, res) => {
    try {
        const sessionDoctorId = getDoctorIdFromSession(req);
        const { date_from, date_to, doctor_id, doctor_name, status, booking_source, page = 1, limit = 100 } = req.query;

        const filter = {};
        if (date_from || date_to) {
            filter.appointment_date = {};
            if (date_from) filter.appointment_date.$gte = toMidnight(date_from);
            if (date_to) filter.appointment_date.$lte = toMidnight(date_to);
        }
        if (sessionDoctorId) {
            filter.doctor_id = sessionDoctorId;
        } else {
            if (doctor_id) filter.doctor_id = doctor_id;
            if (doctor_name) filter.doctor_name = new RegExp(doctor_name, 'i');
        }
        if (status) filter.status = status.toUpperCase();
        if (booking_source) filter.booking_source = booking_source.toLowerCase();

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [appointmentsData, statusSummary, total] = await Promise.all([
            Appointment.find(filter).populate('patient_id', 'wa_id wa_hash email')
                .sort({ appointment_date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
            Appointment.aggregate([
                { $match: filter },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            Appointment.countDocuments(filter)
        ]);

        const isSuperadmin = req.user?.role === 'superadmin';

        // Map populated patient data to appointment objects
        const appointments = appointmentsData.map(a => {
            if (a.patient_id && typeof a.patient_id === 'object') {
                const p = a.patient_id;
                // Add decrypted/masked wa_id to appointment object only if superadmin
                a.patient_mobile = (isSuperadmin && p.wa_id) ? require('../../utils/encryption').decrypt(p.wa_id) : '***';
                a.patient_id = p.patient_id || p._id;
            }
            return a;
        });

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
        if (!ensureDoctorSessionHasProfile(req, res)) return;

        const sessionDoctorId = getDoctorIdFromSession(req);
        const patientScope = sessionDoctorId
            ? {
                patient_id: {
                    $in: await Appointment.distinct('patient_id', { doctor_id: sessionDoctorId, is_deleted: false })
                }
            }
            : {};
        const patientMatch = { is_deleted: false, ...patientScope };

        const [byCity, byGender, bySource, byAgeGroup, registrationTrend, total] = await Promise.all([
            Patient.aggregate([{ $match: patientMatch }, { $group: { _id: '$city', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
            Patient.aggregate([{ $match: patientMatch }, { $group: { _id: '$gender', count: { $sum: 1 } } }]),
            Patient.aggregate([{ $match: patientMatch }, { $group: { _id: '$registration_source', count: { $sum: 1 } } }]),
            Patient.aggregate([
                { $match: { ...patientMatch, age_years: { $exists: true, $ne: null } } },
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
                { $match: patientMatch },
                {
                    $group: {
                        _id: { year: { $year: '$registered_at' }, month: { $month: '$registered_at' } },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { '_id.year': -1, '_id.month': -1 } },
                { $limit: 12 }
            ]),
            Patient.countDocuments(patientMatch)
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
