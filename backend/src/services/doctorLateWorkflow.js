/**
 * Doctor Late Workflow
 * Orchestrates the full flow when a doctor marks themselves RUNNING_LATE or AVAILABLE.
 *
 * RUNNING_LATE flow:
 *  1. Find all WAITING appointments for that doctor today within next 2 hours
 *  2. Shift appointment_time forward by minutes_late
 *  3. Queue "DOCTOR_RUNNING_LATE" + "APPOINTMENT_RESCHEDULED" messages
 *
 * AVAILABLE (after LATE) flow:
 *  1. Find all appointments that were shifted today
 *  2. Queue "DOCTOR_ARRIVED" messages
 */
const DoctorAvailability = require('../models/DoctorAvailability');
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const { decrypt } = require('../utils/encryption');
const { toMidnight } = require('../utils/helpers');
const { triggerWebhook } = require('./webhookService');
const audit = require('../utils/audit');

// Helper: add minutes to a "HH:MM" string → "HH:MM"
function addMinutesToTime(timeStr, minutes) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    const total = h * 60 + m + minutes;
    const nh = Math.floor(total / 60) % 24;
    const nm = total % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

// Format Date to friendly string e.g. "February 27, 2026"
function friendlyDate(d) {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Format HH:MM to "10:30 AM"
function to12h(timeStr) {
    if (!timeStr) return timeStr;
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * handleDoctorLate
 * Runs when POST /api/doctor/availability/update is called with status=LATE
 */
async function handleDoctorLate(doctorId, doctorName, minutesLate, etaTime) {
    console.log(`[DoctorLate] Starting for ${doctorName} (${doctorId}), minutes: ${minutesLate}`);
    const today = toMidnight(new Date());

    const batchId = `BATCH-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
    const CLINIC_NAME = process.env.CLINIC_NAME || 'Dr. Indu Child Care Clinic';
    const CLINIC_ADDRESS = process.env.CLINIC_ADDRESS || 'Dr. Indu Child Care Clinic';

    // Find all WAITING appointments for this doctor today (next 3 hours)
    const affectedAppointments = await Appointment.find({
        $or: [{ doctor_id: doctorId }, { doctor_name: doctorName }],
        appointment_date: today,
        token_status: 'WAITING',
        is_deleted: false
    }).sort({ token_number: 1 });

    if (affectedAppointments.length === 0) {
        console.log(`[DoctorLate] No waiting appointments for ${doctorName} today`);
        return { affected: 0, batchId, messages_queued: 0 };
    }

    // Get all patient records in one query
    const patientIds = [...new Set(affectedAppointments.map(a => a.patient_id))];
    const patients = await Patient.find({ patient_id: { $in: patientIds } })
        .select('patient_id wa_id child_name parent_name mother_name father_name')
        .lean();
    const patientMap = {};
    patients.forEach(p => { patientMap[p.patient_id] = p; });

    let messagesQueued = 0;
    const affected = [];

    for (const appt of affectedAppointments) {
        const patient = patientMap[appt.patient_id];
        if (!patient) continue;

        const originalTime = appt.appointment_time;
        const newTime = addMinutesToTime(originalTime, minutesLate);

        // Update the appointment's time  
        await Appointment.updateOne(
            { appointment_id: appt.appointment_id },
            {
                $set: {
                    appointment_time: newTime,
                    last_updated_at: new Date(),
                    last_updated_by: 'SYSTEM_LATE_WORKFLOW'
                }
            }
        );

        // Get recipient wa_id (decrypt if encrypted)
        let waId;
        try { waId = decrypt(patient.wa_id); } catch { waId = patient.wa_id; }
        if (!waId) continue;

        const parentName = patient.parent_name || patient.father_name || patient.mother_name || 'Parent';
        const childName = patient.child_name || 'Your child';
        const token = appt.token_number ? `Token #${appt.token_number}` : appt.appointment_id;
        const dateStr = friendlyDate(appt.appointment_date);

        const vars = {
            parent_name: parentName,
            child_name: childName,
            doctor_name: doctorName,
            minutes: minutesLate,
            date: dateStr,
            original_time: to12h(originalTime),
            new_time: etaTime || to12h(newTime),
            token,
            clinic_name: CLINIC_NAME,
            clinic_address: CLINIC_ADDRESS
        };

        // Trigger n8n webhook for Doctor late delay (using lowercase for consistency)
        await triggerWebhook('Doctor-update', {
            batch_id: batchId,
            parent_wa_id: waId,
            parent_name: parentName,
            child_name: childName,
            doctor_name: doctorName,
            delay_minutes: minutesLate,
            original_time: to12h(originalTime),
            new_time: etaTime || to12h(newTime),
            token: token,
            appointment_id: appt.appointment_id,
            clinic_name: CLINIC_NAME,
            clinic_address: CLINIC_ADDRESS,
            event_type: 'DOCTOR_RUNNING_LATE'
        });
        messagesQueued++;

        affected.push({
            appointment_id: appt.appointment_id,
            patient_id: appt.patient_id,
            parent_wa_id: waId,
            parent_name: parentName,
            child_name: childName,
            original_time: to12h(originalTime),
            new_time: etaTime || to12h(newTime),
            token
        });
    }

    await audit({
        event_type: 'DOCTOR_LATE_WORKFLOW_RUN',
        entity_type: 'doctor_availability',
        entity_id: doctorId,
        actor: 'SYSTEM',
        actor_type: 'SYSTEM',
        new_value: { minutes_late: minutesLate, affected: affected.length, messages_queued: messagesQueued, batch_id: batchId }
    });

    console.log(`[DoctorLate] Batch ${batchId}: ${affected.length} appointments updated, ${messagesQueued} messages queued`);
    return { affected: affected.length, batchId, messages_queued: messagesQueued, appointments: affected };
}

/**
 * handleDoctorArrived
 * Runs when POST /api/doctor/availability/update is called with status=PRESENT (after LATE)
 */
async function handleDoctorArrived(doctorId, doctorName) {
    const today = toMidnight(new Date());
    const batchId = `BATCH-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
    const CLINIC_NAME = process.env.CLINIC_NAME || 'Dr. Indu Child Care Clinic';
    const CLINIC_ADDRESS = process.env.CLINIC_ADDRESS || 'Dr. Indu Child Care Clinic';

    // Find all WAITING appointments for today (those would have been rescheduled)
    const appointments = await Appointment.find({
        $or: [{ doctor_id: doctorId }, { doctor_name: doctorName }],
        appointment_date: today,
        token_status: 'WAITING',
        is_deleted: false
    }).sort({ token_number: 1 });

    if (appointments.length === 0) return { queued: 0, batchId };

    const patientIds = [...new Set(appointments.map(a => a.patient_id))];
    const patients = await Patient.find({ patient_id: { $in: patientIds } })
        .select('patient_id wa_id parent_name father_name mother_name child_name')
        .lean();
    const patientMap = {};
    patients.forEach(p => { patientMap[p.patient_id] = p; });

    let queued = 0;
    for (const appt of appointments) {
        const patient = patientMap[appt.patient_id];
        if (!patient) continue;

        let waId;
        try { waId = decrypt(patient.wa_id); } catch { waId = patient.wa_id; }
        if (!waId) continue;

        const token = appt.token_number ? `Token #${appt.token_number}` : appt.appointment_id;
        
        // Trigger n8n webhook for Doctor Arrived
        await triggerWebhook('Doctor-update', {
            batch_id: batchId,
            parent_wa_id: waId,
            parent_name: patient.parent_name || patient.father_name || patient.mother_name || 'Parent',
            doctor_name: doctorName,
            token,
            appointment_time: to12h(appt.appointment_time),
            clinic_name: CLINIC_NAME,
            clinic_address: CLINIC_ADDRESS,
            event_type: 'DOCTOR_ARRIVED'
        });
        queued++;
    }

    await audit({
        event_type: 'DOCTOR_ARRIVED_WORKFLOW_RUN',
        entity_type: 'doctor_availability',
        entity_id: doctorId,
        actor: 'SYSTEM',
        actor_type: 'SYSTEM',
        new_value: { queued, batch_id: batchId }
    });

    console.log(`[DoctorArrived] Batch ${batchId}: ${queued} messages queued`);
    return { queued, batchId };
}

module.exports = { handleDoctorLate, handleDoctorArrived, addMinutesToTime, to12h, friendlyDate };
