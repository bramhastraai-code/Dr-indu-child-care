const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Must be 32 characters
const IV_LENGTH = 16;

/**
 * Encrypt text
 * @param {string} text 
 * @returns {string} iv:encryptedData
 */
const encrypt = (text) => {
    if (!text) return text;
    if (!ENCRYPTION_KEY) {
        console.warn('ENCRYPTION_KEY not set, returning plain text');
        return text;
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return iv.toString('hex') + ':' + encrypted.toString('hex');
};

/**
 * Decrypt text
 * @param {string} text iv:encryptedData
 * @returns {string} plain text
 */
const decrypt = (text) => {
    if (!text || !text.includes(':')) return text;
    if (!ENCRYPTION_KEY) return text;

    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted.toString();
    } catch (err) {
        console.error('Decryption failed:', err.message);
        return text; // Return original if decryption fails
    }
};

/**
 * Generate deterministic hash (SHA-256)
 */
const hashField = (text) => {
    if (!text) return text;
    return crypto.createHash('sha256').update(String(text)).digest('hex');
};

/**
 * Mask data (e.g., mobile) by hiding all but last `visible` characters
 */
const maskData = (value, visible = 4) => {
    if (value === null || value === undefined) return value;
    const s = String(value);
    if (s.length <= visible) return '*'.repeat(s.length);
    return '*'.repeat(s.length - visible) + s.slice(-visible);
};

module.exports = { encrypt, decrypt, maskData, hashField };
