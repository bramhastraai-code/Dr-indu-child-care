/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  CSV (from SQL Server) → MongoDB Migration Script
 *  Source: ./sql_export CSVs
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
const doctorMap = {}; // SQL DoctorId -> MongoDB doctor_id (and name)
const patientMap = {}; // SQL PID/MRD -> MongoDB patient_id
const pidToMrdMap = {}; // SQL PID -> MRDNo
const vaccineMasterMap = {}; // VaccineID -> VaccineName

// ── Helpers ───────────────────────────────────────────────────────
function normalizePhone(phone) {
    if (!phone) return null;
    let p = String(phone).replace(/[\s\-\(\)\+]/g, '').trim();
    if (p.startsWith('91') && p.length === 12) p = p.slice(2);
    return (p && /^\d{10}$/.test(p)) ? p : p; // Return if 10 digits or original
}

function pickPhone(fatherMobile, motherMobile) {
    let p1 = normalizePhone(fatherMobile);
    let p2 = normalizePhone(motherMobile);
    return p1 || p2 || '0000000000';
}

function trimOrNull(val) {
    if (val === null || val === undefined) return null;
    const s = String(val).trim();
    return s.length > 0 ? s : null;
}

function parseDate(d) {
    if (!d || d === 'NULL' || d === '') return null;
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? null : dt;
}

function makePatientId(mrdNo, pid) {
    if (mrdNo && String(mrdNo).trim() && String(mrdNo).trim() !== 'NULL') {
        return `PAT-${String(mrdNo).trim()}`;
    }
    return `PAT-${pid}`;
}

// ── Progress logger ───────────────────────────────────────────────
function logProgress(label, current) {
    process.stdout.write(`\r  [${label}] Processed: ${current}`);
}

async function processFile(filename, callback) {
    const filePath = path.join(EXPORT_DIR, filename);
    if (!fs.existsSync(filePath)) {
        console.warn(`\n  ⚠️  Warning: ${filename} not found, skipping.`);
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
        const parts = line.split(DELIM);
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
    
    // PID to MRDNo mapping
    await processFile('pid_mrd_map.csv', (parts) => {
        const pid = parts[0];
        const mrd = trimOrNull(parts[1]);
        if (pid) pidToMrdMap[pid] = mrd;
    });

    // Vaccine ID mapping
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
    let inserted = 0;
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
            await Doctor.findOneAndUpdate(
                { doctor_id: doctorId },
                {
                    name: fullName,
                    qualification,
                    speciality: specialty,
                    login_email: email && email.toLowerCase(),
                    is_active: isActive,
                    updated_at: new Date()
                },
                { upsert: true, new: true }
            );
            inserted++;
        } catch (err) {
            console.error(`\n  ❌ Error inserting doctor ${doctorId}:`, err.message);
        }
    });
    console.log(`  ✅ Doctors migrated: ${inserted}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  3. MIGRATE PATIENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function migratePatients() {
    console.log('\n👶 Migrating Patients...');
    let inserted = 0, skipped = 0;
    
    // Process in batches for better performance
    let batch = [];
    const BATCH_SIZE = 100;

    await processFile('patients.csv', async (parts) => {
        const pid = parts[0];
        const mrdNo = trimOrNull(parts[1]);
        const prefix = trimOrNull(parts[2]);
        const firstName = trimOrNull(parts[3]);
        const middleName = trimOrNull(parts[4]);
        const lastName = trimOrNull(parts[5]);
        const gender = trimOrNull(parts[6]);
        const birthDate = parseDate(parts[7]);
        const age = parts[8];
        const ageMonth = parts[9];
        const ageDay = parts[10];
        const fatherName = trimOrNull(parts[11]);
        const mobileFather = trimOrNull(parts[12]);
        const emailFather = trimOrNull(parts[13]);
        const occuFather = trimOrNull(parts[14]);
        const motherName = trimOrNull(parts[15]);
        const mobileMother = trimOrNull(parts[16]);
        const emailMother = trimOrNull(parts[17]);
        const occuMother = trimOrNull(parts[18]);
        const isAgreeComm = parts[19] === '1';
        const commPref = trimOrNull(parts[20]);
        const address = trimOrNull(parts[21]);
        const city = trimOrNull(parts[22]);
        const pin = trimOrNull(parts[23]);
        const state = trimOrNull(parts[24]);
        const country = trimOrNull(parts[25]);
        const religion = trimOrNull(parts[26]);
        const source = trimOrNull(parts[27]);
        const refBy = trimOrNull(parts[28]);
        const accType = trimOrNull(parts[29]);
        const rating = trimOrNull(parts[30]);
        const comment = trimOrNull(parts[31]);
        const visitDate = parseDate(parts[32]);
        const createdOn = parseDate(parts[33]);
        const modifiedOn = parseDate(parts[34]);
        const isActive = parts[35] === '1';
        const branchId = trimOrNull(parts[36]);

        const patientId = makePatientId(mrdNo, pid);
        const patientUid = `UID-${pid}`;
        const waId = pickPhone(mobileFather, mobileMother);

        patientMap[mrdNo || pid] = patientId;

        batch.push({
            patient_id: patientId,
            patient_uid: patientUid,
            patient_key: mrdNo,
            wa_id: waId,
            salutation: prefix,
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            child_name: [firstName, middleName, lastName].filter(Boolean).join(' '),
            gender: normalizeGender(gender),
            dob: birthDate,
            age_years: parseInt(age) || null,
            age_months: parseInt(ageMonth) || null,
            age_days: parseInt(ageDay) || null,
            registration_date: visitDate || createdOn || new Date(),
            father_name: fatherName,
            father_email: emailFather,
            father_occupation: occuFather,
            mother_name: motherName,
            mother_email: emailMother,
            mother_occupation: occuMother,
            mothers_name: motherName,
            communication_preference: isAgreeComm ? (commPref || true) : false,
            residential_address: address,
            city: city || 'Mumbai',
            state: state || 'Maharashtra',
            pincode: pin,
            source: source,
            referred_by: refBy,
            account_type: accType,
            rating: rating,
            remarks: comment,
            religion: religion,
            home_branch: branchId,
            is_active: isActive,
            registration_status: 'COMPLETE',
            registration_source: 'api',
            is_deleted: false,
            registered_at: createdOn || new Date(),
            last_updated_at: modifiedOn || new Date()
        });

        if (batch.length >= BATCH_SIZE) {
            try {
                // Using bulkWrite or insertMany with ordered: false to skip existing
                await Patient.insertMany(batch, { ordered: false });
                inserted += batch.length;
            } catch (err) {
                if (err.code === 11000) {
                    inserted += (err.insertedDocs ? err.insertedDocs.length : 0);
                    skipped += (batch.length - (err.insertedDocs ? err.insertedDocs.length : 0));
                } else {
                    console.error('\n  ❌ Bulk patient error:', err.message);
                }
            }
            batch = [];
        }
    });

    if (batch.length > 0) {
        try {
            await Patient.insertMany(batch, { ordered: false });
            inserted += batch.length;
        } catch (err) {
            if (err.code === 11000) {
                inserted += (err.insertedDocs ? err.insertedDocs.length : 0);
            }
        }
    }
    console.log(`  ✅ Patients migrated: ${inserted} (Skipped duplicates: ${skipped})`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  4. MIGRATE APPOINTMENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function migrateAppointments() {
    console.log('\n📅 Migrating Appointments...');
    let inserted = 0;
    let batch = [];
    const BATCH_SIZE = 100;

    await processFile('appointments.csv', async (parts) => {
        const sqlId = parts[0];
        const mrdNo = trimOrNull(parts[1]);
        const firstName = trimOrNull(parts[2]);
        const middleName = trimOrNull(parts[3]);
        const lastName = trimOrNull(parts[4]);
        const mobileNo = trimOrNull(parts[5]);
        const appointType = trimOrNull(parts[6]);
        const appointDate = parseDate(parts[7]);
        const startTime = parseDate(parts[8]);
        const inTime = parts[9];
        const outTime = parts[10];
        const meetingWithId = parts[11];
        const meetingWithName = trimOrNull(parts[12]);
        const sqlStatus = trimOrNull(parts[13]);
        const isOnline = parts[14] === '1';
        const appMode = trimOrNull(parts[15]);
        const remark = trimOrNull(parts[16]);
        const isActive = parts[17] === '1';
        const rating = trimOrNull(parts[18]);
        const cancelReason = trimOrNull(parts[19]);
        const cancelBy = parts[20];
        const cancelOn = parseDate(parts[21]);
        const createdOn = parseDate(parts[22]);
        const modifiedOn = parseDate(parts[23]);

        const patientId = patientMap[mrdNo] || `PAT-${mrdNo || sqlId}`;
        const appointmentId = `APT-${sqlId}`;
        const docInfo = doctorMap[meetingWithId];
        const doctorId = docInfo ? docInfo.doctor_id : null;
        const doctorName = docInfo ? docInfo.name : (meetingWithName || 'Unknown');

        let status = 'PENDING';
        if (sqlStatus) {
            const s = sqlStatus.toUpperCase();
            if (s.includes('CANCEL')) status = 'CANCELLED';
            else if (s.includes('COMPLET') || s.includes('DONE')) status = 'COMPLETED';
            else if (s.includes('CONFIRM') || s.includes('APPROVE')) status = 'CONFIRMED';
            else if (s.includes('CHECK')) status = 'CHECKED_IN';
            else if (s.includes('BOOK')) status = 'BOOKED';
            else if (s.includes('NO') && s.includes('SHOW')) status = 'NO_SHOW';
        }

        let visitCategory = 'First visit';
        if (appointType) {
            const at = appointType.toLowerCase();
            if (at.includes('follow')) visitCategory = 'Follow-up';
            else if (at.includes('vaccin')) visitCategory = 'Vaccination';
            else if (at.includes('fresh') || at.includes('first')) visitCategory = 'First visit';
            else visitCategory = 'Other';
        }

        let appTimeStr = null;
        if (startTime) {
            appTimeStr = `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`;
        }

        batch.push({
            appointment_id: appointmentId,
            patient_id: patientId,
            appointment_mode: isOnline ? 'ONLINE' : (appMode || 'OFFLINE').toUpperCase(),
            doctor_name: doctorName,
            doctor_id: doctorId,
            visit_category: visitCategory,
            token_pool: isOnline ? 'ONLINE' : 'WALK_IN',
            registration_type: isOnline ? 'online' : 'walkin',
            appointment_date: appointDate || new Date(),
            appointment_time: appTimeStr,
            reason: remark || appointType,
            status: status,
            booking_source: isOnline ? 'form' : 'dashboard',
            cancellation_reason: cancelReason,
            cancelled_at: cancelOn,
            cancelled_by: cancelBy ? 'dashboard' : null,
            is_deleted: !isActive,
            created_at: createdOn || new Date(),
            last_updated_at: modifiedOn || new Date()
        });

        if (batch.length >= BATCH_SIZE) {
            try {
                await Appointment.insertMany(batch, { ordered: false });
                inserted += batch.length;
            } catch (err) {
                if (err.code === 11000) inserted += (err.insertedDocs ? err.insertedDocs.length : 0);
            }
            batch = [];
        }
    });

    if (batch.length > 0) {
        try {
            await Appointment.insertMany(batch, { ordered: false });
            inserted += batch.length;
        } catch (err) {
            if (err.code === 11000) inserted += (err.insertedDocs ? err.insertedDocs.length : 0);
        }
    }
    console.log(`  ✅ Appointments migrated: ${inserted}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  5. MIGRATE VACCINATIONS → MRD ENTRIES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function migrateVaccinations() {
    console.log('\n💉 Migrating Vaccinations → MRD entries...');
    const patientVaccines = {};

    await processFile('vaccinations.csv', async (parts) => {
        const pid = parts[0];
        const vaccineId = parts[1];
        const givenDate = parseDate(parts[2]);
        const givenVaccine = trimOrNull(parts[3]);
        const isGiven = parts[4] === '1';
        const createdOn = parseDate(parts[5]);

        if (!isGiven) return;

        const mrdNo = pidToMrdMap[pid];
        const patientId = patientMap[mrdNo || pid];
        if (!patientId) return;

        if (!patientVaccines[patientId]) patientVaccines[patientId] = [];

        const vName = givenVaccine || vaccineMasterMap[vaccineId] || 'Unknown';
        patientVaccines[patientId].push({
            visit_date: givenDate || createdOn || new Date(),
            visit_type: 'VACCINATION',
            vaccine_given: vName,
            recorded_by: 'SQL-Migration',
            recorded_at: createdOn || new Date()
        });
    });

    let docsInserted = 0, entriesAdded = 0;
    const pIds = Object.keys(patientVaccines);
    let processed = 0;

    for (const pId of pIds) {
        const entries = patientVaccines[pId];
        try {
            await MRD.findOneAndUpdate(
                { patient_id: pId },
                { $push: { entries: { $each: entries } } },
                { upsert: true, new: true }
            );
            docsInserted++;
            entriesAdded += entries.length;
        } catch (err) {
            console.error(`\n  ❌ MRD error for ${pId}:`, err.message);
        }
        processed++;
        if (processed % 100 === 0) logProgress('MRD Writes', processed);
    }
    logProgress('MRD Writes', processed);
    console.log(`\n  ✅ MRD: ${docsInserted} documents updated, ${entriesAdded} entries added.`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  6. MIGRATE REFERRING DOCTORS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function migrateReferringDoctors() {
    console.log('\n🔗 Migrating Referring Doctors...');
    let inserted = 0;
    await processFile('referring_doctors.csv', async (parts) => {
        const sqlId = parts[0];
        const prefix = trimOrNull(parts[1]);
        const docName = trimOrNull(parts[2]);
        const specialty = trimOrNull(parts[3]);
        const mobile = trimOrNull(parts[4]);
        const email = trimOrNull(parts[5]);
        const address = trimOrNull(parts[6]);
        const isActive = parts[7] === '1';
        const createdOn = parseDate(parts[8]);
        const modifiedOn = parseDate(parts[9]);

        const doctorId = `REF-${sqlId}`;
        const name = [prefix, docName].filter(Boolean).join(' ') || `Referring Doc ${sqlId}`;

        try {
            await ReferringDoctor.findOneAndUpdate(
                { doctor_id: doctorId },
                {
                    name,
                    speciality: specialty,
                    mobile: normalizePhone(mobile),
                    email: email && email.toLowerCase(),
                    address,
                    is_active: isActive,
                    created_at: createdOn || new Date(),
                    updated_at: modifiedOn || new Date()
                },
                { upsert: true }
            );
            inserted++;
        } catch (err) {
            console.error(`\n  ❌ Referring Doctor error:`, err.message);
        }
    });
    console.log(`  ✅ Referring Doctors: ${inserted}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  7. MIGRATE DOCTOR SCHEDULES → DoctorAvailability
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function migrateDoctorSchedules() {
    console.log('\n🗓️  Migrating Doctor Availability...');
    const schedulesByDoctor = {};

    await processFile('doctor_schedules.csv', async (parts) => {
        const docId = parts[0];
        const day = trimOrNull(parts[1]);
        const start = trimOrNull(parts[2]);
        const end = trimOrNull(parts[3]);
        const holiday = parts[4] === '1';

        if (!docId || !day) return;
        if (!schedulesByDoctor[docId]) schedulesByDoctor[docId] = {};
        
        schedulesByDoctor[docId][day.toLowerCase()] = {
            arrival_time: start || '10:00',
            is_working: !holiday
        };
    });

    let created = 0;
    const defaultDay = { arrival_time: '10:00', is_working: true };
    const defaultSun = { arrival_time: null, is_working: false };

    for (const [sqlDocId, days] of Object.entries(schedulesByDoctor)) {
        const docInfo = doctorMap[sqlDocId];
        if (!docInfo) continue;

        try {
            await DoctorAvailability.findOneAndUpdate(
                { doctor_id: docInfo.doctor_id },
                {
                    doctor_name: docInfo.name,
                    schedule: {
                        monday: days.monday || defaultDay,
                        tuesday: days.tuesday || defaultDay,
                        wednesday: days.wednesday || defaultDay,
                        thursday: days.thursday || defaultDay,
                        friday: days.friday || defaultDay,
                        saturday: days.saturday || defaultDay,
                        sunday: days.sunday || defaultSun
                    },
                    updated_at: new Date()
                },
                { upsert: true }
            );
            created++;
        } catch (err) {
            console.error(`\n  ❌ DoctorAvailability error:`, err.message);
        }
    }
    console.log(`  ✅ DoctorAvailability: ${created} docs updated`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  8. MIGRATE FEEDBACK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function migrateFeedback() {
    console.log('\n⭐ Migrating Feedback...');
    let inserted = 0;
    await processFile('feedback.csv', async (parts) => {
        const sid = parts[0];
        const pid = parts[1];
        const q1 = parseInt(parts[2]) || 3;
        const q2 = parseInt(parts[3]) || 3;
        const q3 = parseInt(parts[4]) || 3;
        const q4 = parseInt(parts[5]) || 3;
        const q5 = parseInt(parts[6]) || 3;
        const suggestion = trimOrNull(parts[7]);
        const experience = trimOrNull(parts[8]);
        const createdOn = parseDate(parts[9]);
        const nps = parseInt(parts[10]) || 0;

        try {
            // Mapping Q scores to our simpler 3-rating feedback model
            await Feedback.create({
                name: 'SQL Migrated - PID ' + pid,
                doctor_rating: Math.min(5, Math.max(1, q1)),
                frontdesk_rating: Math.min(5, Math.max(1, q2)),
                hospital_rating: Math.min(5, Math.max(1, q3)),
                submitted_at: createdOn || new Date(),
                ip_address: '0.0.0.0'
            });
            inserted++;
        } catch (err) {
            // Ignore small errors
        }
    });
    console.log(`  ✅ Feedback: ${inserted}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MAIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('         CSV → MongoDB Migration Start');
    console.log('═══════════════════════════════════════════════════');

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('  ✅ MongoDB Connected');

        const start = Date.now();

        await loadMaps();
        await migrateDoctors();
        await migratePatients();
        await migrateAppointments();
        await migrateVaccinations();
        await migrateReferringDoctors();
        await migrateDoctorSchedules();
        await migrateFeedback();

        const end = Date.now();
        console.log(`\n═══════════════════════════════════════════════════`);
        console.log(`  Migration successful in ${((end - start)/1000).toFixed(1)}s`);
        console.log(`═══════════════════════════════════════════════════\n`);

    } catch (err) {
        console.error('\n  ❌ FATAL ERROR:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

main();
