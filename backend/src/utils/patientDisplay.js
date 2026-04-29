const Patient = require('../models/Patient');

/**
 * Stored patient id on Appointment/MRD/etc. matches Patient.patient_key (virtual `patient_id` is not queryable).
 */
const displayNameFromLean = (p) => {
    if (!p) return null;
    const parts = [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ').trim();
    if (parts) {
        const sal = p.salutation && String(p.salutation).trim() ? `${String(p.salutation).trim()} ` : '';
        return `${sal}${parts}`.trim();
    }
    if (p.child_name && String(p.child_name).trim()) return String(p.child_name).trim();
    return null;
};

const displayNameFromDoc = (patientDoc) => {
    if (!patientDoc) return null;
    if (patientDoc.toObject) {
        const o = patientDoc.toObject({ virtuals: true });
        if (o.full_name && String(o.full_name).trim()) return String(o.full_name).trim();
        return displayNameFromLean(o);
    }
    return displayNameFromLean(patientDoc);
};

/**
 * Batch-load display names keyed by patient public id (patient_key).
 */
const fetchPatientNameMap = async (patientPublicIds = []) => {
    const ids = [...new Set((patientPublicIds || []).filter(Boolean))];
    if (!ids.length) return {};
    const patients = await Patient.find({ patient_key: { $in: ids }, is_deleted: false })
        .select('patient_key child_name first_name middle_name last_name salutation')
        .lean();
    const map = {};
    patients.forEach((p) => {
        map[p.patient_key] = displayNameFromLean(p);
    });
    return map;
};

module.exports = {
    displayNameFromLean,
    displayNameFromDoc,
    fetchPatientNameMap
};
