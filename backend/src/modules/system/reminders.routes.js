const express = require('express');
const router = express.Router();
const Appointment = require('../../models/Appointment');
const auth = require('../../middleware/auth');

// POST /api/reminders/schedule — public (auth middleware allows public by default)
router.post('/schedule', auth, async (req, res) => {
    try {
        const { appointment_id, reminder_type, send_at, message } = req.body || {};

        if (!appointment_id) {
            return res.status(400).json({ success: false, message: 'appointment_id is required' });
        }

        const appt = await Appointment.findOne({ appointment_id });
        if (!appt) {
            return res.status(404).json({ success: false, message: 'Appointment not found' });
        }

        await Appointment.updateOne(
            { appointment_id },
            {
                $set: {
                    manual_reminder_scheduled: true,
                    manual_reminder_type: reminder_type || 'whatsapp',
                    manual_reminder_send_at: send_at ? new Date(send_at) : new Date(),
                    manual_reminder_message: message || null,
                    last_updated_at: new Date()
                }
            }
        );

        res.status(201).json({
            success: true,
            data: {
                reminder_id: `REM-${appointment_id}`,
                appointment_id,
                reminder_type: reminder_type || 'whatsapp',
                send_at: send_at || new Date().toISOString()
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
