const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const { assignTokensForDate } = require('../modules/appointments/appointment.controller');
const { toMidnight } = require('../utils/helpers');
const { triggerWebhook } = require('./webhookService');
const { startQueueProcessor } = require('./messageQueueService');

function initCronJobs() {
    // 1. Start the simple message queue processor built-in
    startQueueProcessor();

    // 2. Daily Cron Job to run the 24hr reminders automatically
    // Currently set to run every day at 08:00 AM server time
    // cron syntax: minute(0-59) hour(0-23) dayOfMonth(1-31) month(1-12) dayOfWeek(0-7)
    cron.schedule('0 8 * * *', async () => {
        console.log('[CRON] Running automated daily 24h reminders job...');
        try {
            const tomorrow = new Date();
            tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
            const queryDate = toMidnight(tomorrow);

            // Assign tokens for tomorrow beforehand
            await assignTokensForDate(queryDate);

            // Fetch pending appointments for tomorrow
            const appointments = await Appointment.find({
                appointment_date: queryDate,
                status: { $in: ['BOOKED', 'CONFIRMED'] },
                reminder_24h_sent: false,
                is_deleted: false
            }).sort({ token_number: 1 });

            if (appointments.length === 0) {
                console.log('[CRON] No pending 24h reminders for tomorrow.');
                return;
            }

            const appointmentIds = appointments.map(a => a._id);
            
            // Mark them as sent so we don't spam
            await Appointment.updateMany(
                { _id: { $in: appointmentIds } },
                {
                    $set: {
                        reminder_24h_sent: true,
                        reminder_24h_sent_at: new Date(),
                        last_updated_at: new Date(),
                        last_updated_by: 'SYSTEM_CRON_REMINDER'
                    }
                }
            );

            // Send Out the Webhooks
            for (const appt of appointments) {
                const patient = await Patient.findOne({ patient_id: appt.patient_id }).lean();
                
                const payload = {
                    appointment_id: appt.appointment_id,
                    patient_id: appt.patient_id,
                    child_name: patient?.child_name || patient?.full_name || 'Child',
                    parent_name: patient?.parent_name || patient?.father_name || 'Parent',
                    status: appt.status,
                    appointment_date: appt.appointment_date.toISOString().split('T')[0],
                    appointment_time: appt.appointment_time || '10:00',
                    doctor_name: appt.doctor_name,
                    token_number: appt.token_number,
                    event_type: 'APPOINTMENT_REMINDER_24H'
                };
                
                // Wait for n8n to receive reminder
                await triggerWebhook('24hr-Message', payload);
            }

            console.log(`[CRON] Successfully processed ${appointments.length} daily 24h reminders.`);
        } catch (error) {
            console.error('[CRON] Error during 24h reminders job:', error.message);
        }
    });

    console.log('✅ Automated Background CRON Jobs started (24h reminders scheduled for 8:00 AM everyday).');
}

module.exports = { initCronJobs };
