const AuditLog = require('../models/AuditLog');

/**
 * Write a single audit log entry.
 * @param {object} opts
 * @param {string} opts.event_type  e.g. 'APPOINTMENT_BOOKED'
 * @param {string} opts.entity_type e.g. 'appointment'
 * @param {string} [opts.entity_id]
 * @param {string} [opts.actor]     username or 'BOT'
 * @param {string} [opts.actor_type]
 * @param {*}      [opts.old_value]
 * @param {*}      [opts.new_value]
 */
const audit = async (opts) => {
    try {
        await AuditLog.create({
            event_type: opts.event_type,
            entity_type: opts.entity_type,
            entity_id: opts.entity_id || null,
            actor: opts.actor || 'SYSTEM',
            actor_type: opts.actor_type || 'SYSTEM',
            old_value: opts.old_value || null,
            new_value: opts.new_value || null,
        });
    } catch (err) {
        // Never let an audit failure crash an API call
        console.error('[AUDIT ERROR]', err.message);
    }
};

module.exports = audit;
