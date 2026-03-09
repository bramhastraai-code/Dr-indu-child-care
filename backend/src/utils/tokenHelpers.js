const { toMidnight } = require('./helpers');
const DoctorTokenConfig = require('../models/DoctorTokenConfig');
const Doctor = require('../models/Doctor');

/**
 * Helper: Resolve doctor shift limits and start time for a specific date.
 * Priority order for start_time:
 *   1. DoctorAvailability.today_start_time  (doctor sets actual arrival today)
 *   2. DoctorTokenConfig.date_overrides     (specific date override)
 *   3. DoctorTokenConfig.weekly_config      (regular weekly schedule)
 *   4. Doctor model defaults / hardcoded fallback
 */
const getDoctorShiftConfig = async (doctorId, date) => {
    const targetDate = toMidnight(date);
    const dayOfWeek = new Date(targetDate).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const today = toMidnight(new Date());
    const isToday = targetDate.getTime() === today.getTime();

    // 0. If this is TODAY — highest priority: doctor's live today_start_time
    let liveStartTime = null;
    if (isToday) {
        try {
            const DoctorAvailability = require('../models/DoctorAvailability');
            const avail = await DoctorAvailability.findOne({ doctor_id: doctorId }).lean();
            if (avail && avail.today_start_time) {
                liveStartTime = avail.today_start_time;
            }
        } catch (_) { /* non-critical */ }
    }

    // 1. Check for specific date override (date_overrides in DoctorTokenConfig)
    const config = await DoctorTokenConfig.findOne({ doctor_id: doctorId });
    if (config) {
        const override = config.date_overrides.find(d => toMidnight(d.date).getTime() === targetDate.getTime());
        if (override) {
            const online = override.online_limit || 20;
            return {
                total: online + 999,
                online: online,
                walkin: 999,
                start_time: liveStartTime || override.start_time,
                is_holiday: override.is_holiday
            };
        }

        // 2. Check weekly config
        const dayConfig = config.weekly_config[dayOfWeek];
        if (dayConfig && dayConfig.is_active) {
            const online = dayConfig.online_limit || 20;
            return {
                total: online + 999,
                online: online,
                walkin: 999,
                start_time: liveStartTime || dayConfig.start_time,
                is_holiday: false
            };
        }
    }

    // 3. Fallback to Doctor model or hardcoded defaults
    const doctor = await Doctor.findOne({ doctor_id: doctorId });
    const onlineLimit = doctor?.online_token_limit || 20;
    return {
        total: onlineLimit + 999,
        online: onlineLimit,
        walkin: 999,
        start_time: liveStartTime || '10:00',
        is_holiday: false
    };
};

/**
 * Helper: Calculate appointment time based on token number and 10min interval
 */
const calculateTokenTime = (startTime, tokenNumber) => {
    if (!startTime || !tokenNumber) return startTime;
    const [h, m] = startTime.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m + (tokenNumber - 1) * 10, 0, 0);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

/**
 * Helper: Generate display token like O-1 or W-2
 */
const generateTokenDisplay = (pool, number) => {
    const prefix = pool === 'WALK_IN' ? 'W' : 'O';
    return `${prefix}-${number}`;
};

module.exports = { getDoctorShiftConfig, calculateTokenTime, generateTokenDisplay };
