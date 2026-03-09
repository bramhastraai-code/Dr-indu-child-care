const express = require('express');
const router = express.Router();
const Appointment = require('../../models/Appointment');
const auth = require('../../middleware/auth');
const { getDoctorIdFromSession } = require('../../utils/doctorScope');

// GET /api/notifications — public
router.get('/', async (req, res) => {
    try {
        const doctorId = getDoctorIdFromSession(req);

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const dayAfter = new Date(tomorrow);
        dayAfter.setDate(dayAfter.getDate() + 1);

        const query = {
            appointment_date: { $gte: tomorrow, $lt: dayAfter },
            status: { $in: ['BOOKED', 'CONFIRMED'] },
            is_deleted: false
        };

        if (doctorId) {
            query.doctor_id = doctorId;
        }

        const upcomingAppts = await Appointment.find(query).limit(50);

        const notifications = upcomingAppts.map(appt => ({
            notification_id: `NOT-${appt.appointment_id}`,
            type: 'APPOINTMENT_REMINDER',
            title: 'Appointment Tomorrow',
            message: `Appointment ${appt.appointment_id} with ${appt.doctor_name || 'you'} is tomorrow. Your token is ${appt.token_display || appt.token_number}`,
            related_entity_id: appt.appointment_id,
            is_read: appt.reminder_24h_sent || false,
            created_at: appt.created_at
        }));

        res.json({ success: true, total: notifications.length, data: notifications });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PATCH /api/notifications/:notification_id/mark-read
router.patch('/:notification_id/mark-read', async (req, res) => {
    try {
        const { notification_id } = req.params;
        const appointment_id = notification_id.replace(/^NOT-/, '');

        if (appointment_id.startsWith('APT-')) {
            await Appointment.updateOne({ appointment_id }, { $set: { reminder_24h_sent: true } });
        }

        res.json({ success: true, message: 'Notification marked as read' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
