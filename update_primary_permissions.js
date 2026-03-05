const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, './backend/.env') });

const STAFF_PERMISSIONS = [
    'VIEW_PATIENTS',
    'EDIT_PATIENTS',
    'VIEW_APPOINTMENTS',
    'EDIT_APPOINTMENTS',
    'VIEW_QUEUES',
    'EDIT_QUEUES'
];

const DOCTOR_PERMISSIONS = [
    ...STAFF_PERMISSIONS,
    'VIEW_MRD',
    'EDIT_MRD',
    'EDIT_AVAILABILITY'
];

async function updatePermissions() {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        const db = client.db();
        const adminsColl = db.collection('admins');

        console.log('UPDATING STAFF PERMISSIONS...');
        const staffRes = await adminsColl.updateMany(
            { role: { $in: ['staff', 'secretary'] } },
            { $set: { permissions: STAFF_PERMISSIONS } }
        );
        console.log(`Updated ${staffRes.modifiedCount} staff/secretary accounts.`);

        console.log('\nUPDATING DOCTOR PERMISSIONS...');
        const docRes = await adminsColl.updateMany(
            { role: 'doctor' },
            { $set: { permissions: DOCTOR_PERMISSIONS } }
        );
        console.log(`Updated ${docRes.modifiedCount} doctor accounts.`);

        console.log('\nPermissions update completed.');
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

updatePermissions();
