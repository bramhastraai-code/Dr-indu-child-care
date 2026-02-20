/**
 * Centralized helper functions for the Dr. Indu Child Care API.
 */

/**
 * Normalizes a date to midnight UTC.
 * @param {Date|string} d 
 * @returns {Date}
 */
const toMidnight = (d) => {
    const date = new Date(d);
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

module.exports = {
    toMidnight,
    normalizeWaId,
    extractMobile,
    normalizePhone
};
