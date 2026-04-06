const mongoose = require('mongoose');
const fs = require('fs');
const readline = require('readline');
const path = require('path');
require('dotenv').config();

// Models
const Patient = require('../src/models/Patient');
const Appointment = require('../src/models/Appointment');
const MRD = require('../src/models/MRD');

const SQL_EXPORT_DIR = path.join(__dirname, '../sql_export');

async function syncData() {
    try {
        console.log('--- Starting Clinical Data Sync ---');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Load PID-MRD Map (SQL_ID -> Clinical_ID)
        console.log('Loading PID-MRD Map...');
        const pidMap = new Map();
        const pidFile = path.join(SQL_EXPORT_DIR, 'pid_mrd_map.csv');
        const pidStream = readline.createInterface({
            input: fs.createReadStream(pidFile),
            crlfDelay: Infinity
        });

        for await (const line of pidStream) {
            const parts = line.split('|||');
            if (parts.length >= 2) {
                const sqlId = parts[0].trim();
                const clinicalId = parts[1].trim();
                pidMap.set(sqlId, clinicalId);
            }
        }
        console.log(`Loaded ${pidMap.size} PID mappings.`);

        // 2. Load Vaccine Master
        console.log('Loading Vaccine Master...');
        const vaccineMap = new Map();
        const vacMasterFile = path.join(SQL_EXPORT_DIR, 'vaccine_master.csv');
        const vacMasterStream = readline.createInterface({
            input: fs.createReadStream(vacMasterFile),
            crlfDelay: Infinity
        });
        for await (const line of vacMasterStream) {
            const parts = line.split('|||');
            if (parts.length >= 2) {
                vaccineMap.set(parts[0].trim(), parts[1].trim());
            }
        }

        // 3. Process Vaccinations
        console.log('Processing Vaccinations...');
        const vacFile = path.join(SQL_EXPORT_DIR, 'vaccinations.csv');
        const vacStream = readline.createInterface({
            input: fs.createReadStream(vacFile),
            crlfDelay: Infinity
        });

        let vacCount = 0;
        const patientVaccines = new Map(); // ClinicalID -> Array of vaccines

        for await (const line of vacStream) {
            const parts = line.split('|||');
            if (parts.length < 4) continue;

            const sqlPatientId = parts[0]?.trim();
            const vaccineId = parts[1]?.trim();
            const dateStr = parts[2]?.trim();
            const vaccineName = parts[3]?.trim() || vaccineMap.get(vaccineId) || 'Unknown Vaccine';
            const status = parts[4]?.trim() === '1' ? 'Given' : 'Pending';

            const clinicalId = pidMap.get(sqlPatientId);
            if (!clinicalId) continue;

            if (!patientVaccines.has(clinicalId)) {
                patientVaccines.set(clinicalId, []);
            }

            patientVaccines.get(clinicalId).push({
                visit_type: 'VACCINATION',
                visit_date: dateStr ? new Date(dateStr) : new Date(),
                vaccine_given: vaccineName,
                clinical_notes: `Status: ${status}`,
                appointment_id: `SQL-VAC-${vacCount}`,
                recorded_by: 'MIGRATION_SYSTEM'
            });
            vacCount++;
            if (vacCount % 5000 === 0) console.log(`Processed ${vacCount} vaccinations...`);
        }
        console.log(`Grouped ${vacCount} vaccinations for ${patientVaccines.size} patients.`);

        // 4. Update MRDs with vaccinations
        console.log('Updating MRD records with vaccinations...');
        let mrdUpdates = 0;
        for (const [clinicalId, entries] of patientVaccines.entries()) {
            await MRD.updateOne(
                { patient_id: clinicalId },
                { $set: { entries } },
                { upsert: true }
            );
            mrdUpdates++;
            if (mrdUpdates % 1000 === 0) console.log(`Updated ${mrdUpdates} MRDs...`);
        }

        // 5. Process Appointments
        console.log('Processing Appointments...');
        const appFile = path.join(SQL_EXPORT_DIR, 'appointments.csv');
        const appStream = readline.createInterface({
            input: fs.createReadStream(appFile),
            crlfDelay: Infinity
        });

        let appLinked = 0;
        let appTotal = 0;
        
        for await (const line of appStream) {
            appTotal++;
            const parts = line.split('|||');
            if (parts.length < 13) continue;

            const sqlAppId = parts[0].trim();
            let clinicalId = parts[1]?.trim();
            const firstName = parts[2]?.trim() || '';
            const lastName = parts[4]?.trim() || '';
            const mobile = parts[5]?.trim() || '';
            const appDateStr = parts[8]?.trim();
            const doctorNameRaw = parts[12]?.trim() || 'Dr. Indu Khosla';
            const statusFlag = parts[14]?.trim(); 

            // Standardize doctor names to match our DB if possible
            let doctorName = 'Dr. Indu';
            if (doctorNameRaw.includes('Vishal')) doctorName = 'Dr Vishal Mukhija';
            else if (doctorNameRaw.includes('Shabnam')) doctorName = 'Dr Shabnam Husain';
            else if (doctorNameRaw.includes('Suyog')) doctorName = 'Dr Suyog Phadke';

            // FALLBACK: Match by name/mobile if clinicalId is empty
            if (!clinicalId && (firstName || mobile)) {
                const fullName = `${firstName} ${lastName}`.trim();
                const possiblePatient = await Patient.findOne({
                    $or: [
                        { child_name: { $regex: new RegExp(`^${fullName}$`, 'i') } },
                        { parent_mobile: mobile },
                        { wa_id: { $regex: new RegExp(`${mobile.slice(-10)}$`) } }
                    ]
                }).select('patient_key').lean();
                
                if (possiblePatient) {
                    clinicalId = possiblePatient.patient_key;
                }
            }

            if (!clinicalId) continue;

            const appointmentDate = appDateStr ? new Date(appDateStr) : new Date();
            
            await Appointment.updateOne(
                { appointment_id: `SQL-${sqlAppId}` },
                {
                    appointment_id: `SQL-${sqlAppId}`,
                    patient_id: clinicalId,
                    doctor_name: doctorName,
                    appointment_date: appointmentDate,
                    status: statusFlag === '1' ? 'COMPLETED' : 'PENDING',
                    registration_type: 'walkin',
                    booking_source: 'dashboard',
                    visit_category: 'Follow-up'
                },
                { upsert: true }
            );

            appLinked++;
            if (appLinked % 1000 === 0) console.log(`Linked ${appLinked} appointments...`);
        }


        console.log('--- Sync Complete ---');
        console.log(`Final Stats: ${vacCount} vaccinations, ${appLinked} appointments.`);
        process.exit(0);
    } catch (err) {
        console.error('Fatal Sync Error:', err);
        process.exit(1);
    }
}

syncData();
