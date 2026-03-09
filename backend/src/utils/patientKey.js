/**
 * Patient Key Generator
 * Generates a unique, human-readable patient key in the format:
 *   YY-FL-NN  (e.g. "26-AA-01", "26-RK-12")
 *
 *   YY = 2-digit year of registration
 *   FL = First initial of first_name + First initial of last_name (uppercase)
 *   NN = Zero-padded 2-digit sequence for that YY+FL combination
 *
 * Rules:
 *  - If last_name is missing, the second letter of first_name is used (or first letter repeated).
 *  - If first_name is also missing, falls back to child_name parts.
 *  - Sequence resets per year (so "26-AA-01" and "27-AA-01" can both exist).
 */

const Patient = require('../models/Patient');

/**
 * @param {string} firstName
 * @param {string} lastName
 * @param {string} [childName]   — fallback when first/last are missing
 * @returns {Promise<string>}    — e.g. "26-RK-01"
 */
const generatePatientKey = async (firstName, lastName, childName) => {
    const year = String(new Date().getFullYear()).slice(-2); // "26"

    // Resolve first initial
    let fInitial = 'A';
    let lInitial = 'A';

    const fn = (firstName || '').trim();
    const ln = (lastName || '').trim();
    const cn = (childName || '').trim();

    if (fn) {
        fInitial = fn.charAt(0).toUpperCase();
    } else if (cn) {
        const parts = cn.split(/\s+/);
        fInitial = parts[0].charAt(0).toUpperCase();
    }

    if (ln) {
        lInitial = ln.charAt(0).toUpperCase();
    } else if (fn && fn.length > 1) {
        // Use second letter of first name
        lInitial = fn.charAt(1).toUpperCase();
    } else if (cn) {
        const parts = cn.split(/\s+/);
        lInitial = parts.length >= 2
            ? parts[parts.length - 1].charAt(0).toUpperCase()
            : (parts[0].length > 1 ? parts[0].charAt(1).toUpperCase() : parts[0].charAt(0).toUpperCase());
    }

    const initials = `${fInitial}${lInitial}`;
    const prefix = `${year}-${initials}-`;

    // Find the highest existing sequence for this year+initials combo
    const existing = await Patient.find({
        patient_key: { $regex: `^${prefix}\\d+$` }
    }).select('patient_key').lean();

    let maxSeq = 0;
    for (const p of existing) {
        const seqPart = p.patient_key.slice(prefix.length);
        const num = parseInt(seqPart, 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
    }

    const nextSeq = maxSeq + 1;
    // Zero-pad to at least 2 digits (e.g. "01", "12", "100")
    const seqStr = String(nextSeq).padStart(2, '0');

    return `${prefix}${seqStr}`;
};

module.exports = { generatePatientKey };
