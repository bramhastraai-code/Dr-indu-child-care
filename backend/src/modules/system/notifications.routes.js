const express = require('express');
const router = express.Router();
const Appointment = require('../../models/Appointment');

// GET /api/notifications — public
router.get('/', async (req, res) => {
    try {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const dayAfter = new Date(tomorrow);
        dayAfter.setDate(dayAfter.getDate() + 1);

        const upcomingAppts = await Appointment.find({
            appointment_date: { $gte: tomorrow, $lt: dayAfter },
            status: { $in: ['BOOKED', 'CONFIRMED'] }
        }).limit(50);

        const notifications = upcomingAppts.map(appt => ({
            notification_id: `NOT-${appt.appointment_id}`,
            type: 'APPOINTMENT_REMINDER',
            title: 'Appointment Tomorrow',
            message: `Appointment ${appt.appointment_id} with ${appt.doctor_name} is tomorrow at slot ${appt.slot_id}`,
            related_entity_id: appt.appointment_id,
            is_read: appt.reminder_24h_sent || false,
            created_at: appt.created_at
        }));

        res.json({ success: true, total: notifications.length, data: notifications });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PATCH /api/notifications/:notification_id/mark-read — public
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
