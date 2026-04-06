/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  CSV (from SQL Server) → MongoDB Migration Script
 *  Source: ./sql_export CSVs (pipe-delimited |||)
 *  Target: dr_indu_child_care (MongoDB Atlas)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mongoose = require('mongoose');

// Delimiter used in BCP
const DELIM = '|||';
const EXPORT_DIR = path.join(__dirname, '..', 'sql_export');

// ── Models ────────────────────────────────────────────────────────
const Patient = require('./models/Patient');
const Doctor = require('./models/Doctor');
const Appointment = require('./models/Appointment');
const MRD = require('./models/MRD');
const ReferringDoctor = require('./models/ReferringDoctor');
const DoctorAvailability = require('./models/DoctorAvailability');
const Feedback = require('./models/Feedback');

const { normalizeGender } = require('./utils/helpers');

// Maps for lookups
const doctorMap = {}; // SQL DoctorId -> MongoDB doctor_id
const mrdLinkMap = {}; // SQL PID/MRD -> MRD Number (used for linking)
const pidToMrdMap = {}; // SQL PID -> MRDNo
const vaccineMasterMap = {}; // VaccineID -> VaccineName

// ── Helpers ───────────────────────────────────────────────────────
function normalizePhone(phone) {
    if (!phone) return null;
    let p = String(phone).replace(/\x00/g, '').replace(/[\s\-\(\)\+]/g, '').trim();
    if (p.startsWith('91') && p.length === 12) p = p.slice(2);
    // Return if it looks like a 10-digit number
    return (p && /^\d{10}$/.test(p)) ? p : p; 
}

function trimOrNull(val) {
    if (val === null || val === undefined || val === 'NULL' || val === '') return null;
    // Strip null characters (\x00) and trim
    return String(val).replace(/\x00/g, '').trim() || null;
}

function parseDate(d) {
    if (!d || d === 'NULL' || d === '') return null;
    const dt = new Date(String(d).replace(/\x00/g, ''));
    return isNaN(dt.getTime()) ? null : dt;
}

// ── Progress logger ───────────────────────────────────────────────
function logProgress(label, current) {
    process.stdout.write(`\r  [${label}] Processed: ${current}          `);
}

async function processFile(filename, callback) {
    const filePath = path.join(EXPORT_DIR, filename);
    if (!fs.existsSync(filePath)) {
        console.warn(`\n  ⚠️ Skip: ${filename} (not found)`);
        return;
    }
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let count = 0;
    for await (const line of rl) {
        if (!line.trim()) continue;
        const parts = line.split(DELIM).map(p => trimOrNull(p));
        await callback(parts);
        count++;
        if (count % 100 === 0) logProgress(filename, count);
    }
    logProgress(filename, count);
    console.log(' ✓');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  1. LOAD MAPS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function loadMaps() {
    console.log('\n🗺️  Loading mapping files...');
    
    await processFile('pid_mrd_map.csv', (parts) => {
        const pid = parts[0];
        const mrd = trimOrNull(parts[1]);
        if (pid) pidToMrdMap[pid] = mrd;
    });

    await processFile('vaccine_master.csv', (parts) => {
        const vid = parts[0];
        const vname = trimOrNull(parts[1]);
        if (vid) vaccineMasterMap[vid] = vname;
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  2. MIGRATE DOCTORS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function migrateDoctors() {
    console.log('\n🩺 Migrating Doctors...');
    let count = 0;
    await processFile('doctors.csv', async (parts) => {
        const sqlId = parts[0];
        const firstName = trimOrNull(parts[1]);
        const middleName = trimOrNull(parts[2]);
        const lastName = trimOrNull(parts[3]);
        const qualification = trimOrNull(parts[4]);
        const specialty = trimOrNull(parts[5]);
        const mobile = trimOrNull(parts[6]);
        const email = trimOrNull(parts[7]);
        const isActive = parts[8] === '1';

        const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ') || `Doctor-${sqlId}`;
        const doctorId = `DOC-${sqlId}`;
        
        doctorMap[sqlId] = { doctor_id: doctorId, name: fullName };

        try {
            await Doctor.updateOne(
                { doctor_id: doctorId },
                {
                    $set: {
                        name: fullName,
                        qualification,
                        speciality: specialty,
                        login_email: email && email.toLowerCase(),
                        is_active: isActive,
                        updated_at: new Date()
                    }
                },
                { upsert: true }
            );
            count++;
        } catch (err) {
            console.error(`\n  ❌ Doctor error: ${doctorId}`, err.message);
        }
    });
    console.log(`  ✅ Doctors migrated: ${count}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  3. MIGRATE PATIENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function migratePatients() {
    console.log('\n👶 Migrating Patients...');
    let total = 0;
    let batch = [];
    const BATCH_SIZE = 1000;

    await processFile('patients.csv', async (parts) => {
        const pid = parts[0];
        const mrdNo = trimOrNull(parts[1]);
        
        // Use MRDNo as patient_key, fallback to PID
        const patientKey = mrdNo || pid;
        mrdLinkMap[mrdNo || pid] = patientKey;

        const firstName = trimOrNull(parts[3]);
        const middleName = trimOrNull(parts[4]);
        const lastName = trimOrNull(parts[5]);
        
        // User requested: wa_id is Father, wa_id_2 is Mother
        const waIdFather = normalizePhone(parts[12]) || '0000000000';
        const waIdMother = normalizePhone(parts[16]);

        batch.push({
            updateOne: {
                filter: { patient_key: patientKey },
                update: {
                    $set: {
                        wa_id: waIdFather,
                        wa_id_2: waIdMother,
                        salutation: trimOrNull(parts[2]),
                        first_name: firstName,
                        middle_name: middleName,
                        last_name: lastName,
                        child_name: [firstName, middleName, lastName].filter(Boolean).join(' '),
                        gender: normalizeGender(trimOrNull(parts[6])),
                        dob: parseDate(parts[7]),
                        age_years: parseInt(parts[8]) || null,
                        age_months: parseInt(parts[9]) || null,
                        age_days: parseInt(parts[10]) || null,
                        registration_date: parseDate(parts[32]) || parseDate(parts[33]) || new Date(),
                        father_name: trimOrNull(parts[11]),
                        father_email: trimOrNull(parts[13]),
                        father_occupation: trimOrNull(parts[14]),
                        mother_name: trimOrNull(parts[15]),
                        mother_email: trimOrNull(parts[17]),
                        mother_occupation: trimOrNull(parts[18]),
                        mothers_name: trimOrNull(parts[15]),
                        communication_preference: parts[19] === '1' ? (trimOrNull(parts[20]) || true) : false,
                        residential_address: trimOrNull(parts[21]),
                        city: trimOrNull(parts[22]) || 'Mumbai',
                        state: trimOrNull(parts[24]) || 'Maharashtra',
                        pincode: trimOrNull(parts[23]),
                        source: trimOrNull(parts[27]),
                        referred_by: trimOrNull(parts[28]),
                        account_type: trimOrNull(parts[29]),
                        rating: trimOrNull(parts[30]),
                        remarks: trimOrNull(parts[31]),
                        religion: trimOrNull(parts[26]),
                        home_branch: trimOrNull(parts[36]),
                        is_active: parts[35] === '1',
                        registration_status: 'COMPLETE',
                        registration_source: 'api',
                        last_updated_at: parseDate(parts[34]) || new Date()
                    }
                },
                upsert: true
            }
        });

        if (batch.length >= BATCH_SIZE) {
            await Patient.bulkWrite(batch);
            total += batch.length;
            batch = [];
        }
    });

    if (batch.length > 0) {
        await Patient.bulkWrite(batch);
        total += batch.length;
    }
    console.log(`  ✅ Patients migrated (Upserted/Restructured): ${total}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  4. MIGRATE APPOINTMENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function migrateAppointments() {
    console.log('\n📅 Migrating Appointments...');
    let total = 0;
    let batch = [];
    const BATCH_SIZE = 1000;

    await processFile('appointments.csv', async (parts) => {
        const sqlId = parts[0];
        const mrdNo = trimOrNull(parts[1]);
        const patientLinkKey = mrdLinkMap[mrdNo] || (pidToMrdMap[mrdNo] ? pidToMrdMap[mrdNo] : (mrdNo || sqlId));
        const appointmentId = `APT-${sqlId}`;
        const meetingWithId = parts[11];
        const docInfo = doctorMap[meetingWithId];
        const doctorId = docInfo ? docInfo.doctor_id : null;
        const doctorName = docInfo ? docInfo.name : (trimOrNull(parts[12]) || 'Unknown');

        let status = 'PENDING';
        const s = (trimOrNull(parts[13]) || '').toUpperCase();
        if (s.includes('CANCEL')) status = 'CANCELLED';
        else if (s.includes('COMPLET') || s.includes('DONE')) status = 'COMPLETED';
        else if (s.includes('CONFIRM') || s.includes('APPROVE')) status = 'CONFIRMED';
        else if (s.includes('CHECK')) status = 'CHECKED_IN';
        else if (s.includes('BOOK')) status = 'BOOKED';
        else if (s.includes('NO') && s.includes('SHOW')) status = 'NO_SHOW';

        const start = parseDate(parts[8]);
        let appTimeStr = null;
        if (start) appTimeStr = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;

        batch.push({
            updateOne: {
                filter: { appointment_id: appointmentId },
                update: {
                    $set: {
                        patient_id: patientLinkKey, // Link via clinical key/MRD
                        appointment_mode: parts[14] === '1' ? 'ONLINE' : (trimOrNull(parts[15]) || 'OFFLINE').toUpperCase(),
                        doctor_name: doctorName,
                        doctor_id: doctorId,
                        visit_category: (trimOrNull(parts[6]) || '').toLowerCase().includes('follow') ? 'Follow-up' : 'First visit',
                        token_pool: parts[14] === '1' ? 'ONLINE' : 'WALK_IN',
                        registration_type: parts[14] === '1' ? 'online' : 'walkin',
                        appointment_date: parseDate(parts[7]) || new Date(),
                        appointment_time: appTimeStr,
                        reason: trimOrNull(parts[16]) || trimOrNull(parts[6]),
                        status: status,
                        booking_source: parts[14] === '1' ? 'form' : 'dashboard',
                        cancellation_reason: trimOrNull(parts[19]),
                        cancelled_at: parseDate(parts[21]),
                        is_deleted: parts[17] !== '1',
                        created_at: parseDate(parts[22]) || new Date(),
                        last_updated_at: parseDate(parts[23]) || new Date()
                    }
                },
                upsert: true
            }
        });

        if (batch.length >= BATCH_SIZE) {
            await Appointment.bulkWrite(batch);
            total += batch.length;
            batch = [];
        }
    });

    if (batch.length > 0) {
        await Appointment.bulkWrite(batch);
        total += batch.length;
    }
    console.log(`  ✅ Appointments migrated (Upserted): ${total}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  5. MIGRATE VACCINATIONS → MRD ENTRIES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function migrateVaccinations() {
    console.log('\n💉 Migrating Vaccinations → MRD...');
    
    const patientVaccines = {};
    await processFile('vaccinations.csv', async (parts) => {
        const pid = parts[0];
        const vaccineId = parts[1];
        if (parts[4] !== '1') return;

        const mrdNo = pidToMrdMap[pid];
        const pLink = mrdLinkMap[mrdNo || pid];
        if (!pLink) return;

        if (!patientVaccines[pLink]) patientVaccines[pLink] = [];

        const vName = trimOrNull(parts[3]) || vaccineMasterMap[vaccineId] || 'Unknown';
        patientVaccines[pLink].push({
            visit_date: parseDate(parts[2]) || parseDate(parts[5]) || new Date(),
            visit_type: 'VACCINATION',
            vaccine_given: vName,
            recorded_by: 'SQL-Migration',
            recorded_at: parseDate(parts[5]) || new Date()
        });
    });

    const pIds = Object.keys(patientVaccines);
    let batch = [];
    const BATCH_SIZE = 500;
    let current = 0;

    for (const pLink of pIds) {
        const entries = patientVaccines[pLink];
        batch.push({
            updateOne: {
                filter: { patient_id: pLink },
                update: {
                    $set: { patient_id: pLink },
                    $push: { entries: { $each: entries } }
                },
                upsert: true
            }
        });

        if (batch.length >= BATCH_SIZE) {
            await MRD.bulkWrite(batch);
            current += batch.length;
            logProgress('MRD BulkWrite', current);
            batch = [];
        }
    }

    if (batch.length > 0) {
        await MRD.bulkWrite(batch);
        current += batch.length;
    }
    console.log(`\n  ✅ MRD: ${current} patient records updated.`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  6. MAIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('       Final Restructured Migration Start         ');
    console.log('═══════════════════════════════════════════════════');

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('  ✅ Connected to Database');

        console.log('  🗑️  Dropping collections for fresh start and removing old indexes...');
        await Promise.all([
            Patient.collection.drop().catch(() => {}),
            Appointment.collection.drop().catch(() => {}),
            MRD.collection.drop().catch(() => {}),
            ReferringDoctor.collection.drop().catch(() => {}),
            DoctorAvailability.collection.drop().catch(() => {}),
            Feedback.collection.drop().catch(() => {})
        ]);

        console.log('  🏗️  Recreating indexes...');
        await Promise.all([
            Patient.createIndexes(),
            Appointment.createIndexes(),
            MRD.createIndexes(),
            ReferringDoctor.createIndexes(),
            DoctorAvailability.createIndexes(),
            Feedback.createIndexes()
        ]);

        await loadMaps();
        await migrateDoctors();
        await migratePatients();
        await migrateAppointments();
        await migrateVaccinations();
        
        // Finalizing smaller collections
        console.log('\n🩺 Finalizing Smaller Collections...');

        // Doctor Availability
        let daC = 0;
        const schedulesByDoctor = {};
        await processFile('doctor_schedules.csv', async (parts) => {
            const docId = parts[0];
            const day = parts[1];
            if (!docId || !day) return;
            if (!schedulesByDoctor[docId]) schedulesByDoctor[docId] = {};
            schedulesByDoctor[docId][day.toLowerCase()] = {
                arrival_time: parts[2] || '10:00',
                is_working: parts[4] !== '1'
            };
        });
        const defaultDay = { arrival_time: '10:00', is_working: true };
        for (const [sqlDocId, days] of Object.entries(schedulesByDoctor)) {
            const docInfo = doctorMap[sqlDocId];
            if (docInfo) {
                await DoctorAvailability.updateOne({ doctor_id: docInfo.doctor_id }, {
                    $set: {
                        doctor_name: docInfo.name,
                        schedule: {
                            monday: days.monday || defaultDay,
                            tuesday: days.tuesday || defaultDay,
                            wednesday: days.wednesday || defaultDay,
                            thursday: days.thursday || defaultDay,
                            friday: days.friday || defaultDay,
                            saturday: days.saturday || defaultDay,
                            sunday: days.sunday || { arrival_time: null, is_working: false }
                        }
                    }
                }, { upsert: true });
                daC++;
            }
        }
        console.log(`  ✅ Doctor Availability: ${daC}`);

        // Feedback
        let fbC = 0;
        await processFile('feedback.csv', async (parts) => {
            try {
                await Feedback.create({
                    name: 'SQL migrated - ' + parts[1],
                    doctor_rating: Math.min(5, Math.max(1, parseInt(parts[2]) || 3)),
                    frontdesk_rating: Math.min(5, Math.max(1, parseInt(parts[3]) || 3)),
                    hospital_rating: Math.min(5, Math.max(1, parseInt(parts[4]) || 3)),
                    submitted_at: parseDate(parts[9]) || new Date(),
                    ip_address: '0.0.0.0'
                });
                fbC++;
            } catch (err) {}
        });
        console.log(`  ✅ Feedback records: ${fbC}`);

        // Referring Doctors
        let refC = 0;
        await processFile('referring_doctors.csv', async (parts) => {
            const drId = `REF-${parts[0]}`;
            await ReferringDoctor.updateOne({ doctor_id: drId }, {
                $set: {
                    name: [parts[1], parts[2]].filter(Boolean).join(' ') || `RefDr-${parts[0]}`,
                    speciality: trimOrNull(parts[3]),
                    mobile: normalizePhone(parts[4]),
                    email: trimOrNull(parts[5]),
                    address: trimOrNull(parts[6]),
                    is_active: parts[7] === '1'
                }
            }, { upsert: true });
            refC++;
        });
        console.log(`  ✅ Referring Doctors: ${refC}`);

    } catch (err) {
        console.error('\n  ❌ FATAL:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

main();
