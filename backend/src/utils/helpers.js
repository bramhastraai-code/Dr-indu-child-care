/**
 * Centralized helper functions for the Dr. Indu Child Care API.
 */

/**
 * Normalizes a date to midnight UTC.
 * @param {Date|string} d 
 * @returns {Date}
 */
const toMidnight = (d) => {
    let date;
    if (d === 'today') {
        date = new Date();
    } else {
        date = new Date(d);
    }
    date.setUTCHours(0, 0, 0, 0);
    return date;
};

/**
 * Normalizes a WhatsApp ID by stripping the @suffix.
 * @param {string} wa_id 
 * @returns {string}
 */
const normalizeWaId = (wa_id = '') => String(wa_id).replace(/@.*$/, '').trim();

/**
 * Extracts a 10-digit local mobile number from various formats.
 * @param {string} wa_id 
 * @returns {string}
 */
const extractMobile = (wa_id = '') => {
    let id = normalizeWaId(wa_id);
    id = id.replace(/^\+/, '');
    if (/^91\d{10}$/.test(id)) return id.slice(2);
    if (/^\d{10}$/.test(id)) return id;
    return id;
};

/**
 * Normalizes a phone number for consistent lookup.
 * @param {string} phone 
 * @returns {string}
 */
const normalizePhone = (phone) => extractMobile(phone);

/**
 * Canonicalizes doctor names: strip extra spaces and handle prefixes ("Dr." vs "Dr ") consistently for lookups.
 * @param {string} name 
 * @returns {string}
 */
const canonicalizeDoctorName = (name) => {
    if (!name) return null;
    let n = name.trim().replace(/\s+/g, ' ');
    // Handle "Dr ", "Dr.", "dr ", "dr." prefixes
    const drRegex = /^(dr\.?\s+)(.*)$/i;
    const match = n.match(drRegex);
    if (match) {
        n = 'Dr. ' + match[2].trim();
    } else if (!n.toLowerCase().startsWith('dr.')) {
        n = 'Dr. ' + n;
    }
    return n;
};

/**
 * Generates the next token number for a doctor on a given date.
 * @param {Object} Appointment - The Mongoose Appointment model.
 * @param {string} doctor_id 
 * @param {Date} date 
 * @returns {Promise<number>}
 */
const getNextToken = async (Appointment, doctor_id, date) => {
    const last = await Appointment.findOne({
        doctor_id,
        appointment_date: date,
        token_number: { $ne: null }
    }).sort({ token_number: -1 }).select('token_number');
    return (last?.token_number || 0) + 1;
};

module.exports = {
    toMidnight,
    normalizeWaId,
    extractMobile,
    normalizePhone,
    canonicalizeDoctorName,
    getNextToken
};
