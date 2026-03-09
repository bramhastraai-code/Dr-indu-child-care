const DoctorTokenConfig = require('../../models/DoctorTokenConfig');
const audit = require('../../utils/audit');

// @desc    Get token configuration for a doctor
// @route   GET /api/system/token-config/:doctor_id
exports.getTokenConfig = async (req, res) => {
    try {
        const { doctor_id } = req.params;
        let config = await DoctorTokenConfig.findOne({ doctor_id });

        if (!config) {
            // Return default config if not found
            config = {
                doctor_id,
                weekly_config: {
                    monday: { total_tokens: 40, online_limit: 20, walkin_limit: 20, start_time: '10:00', is_active: true },
                    tuesday: { total_tokens: 40, online_limit: 20, walkin_limit: 20, start_time: '10:00', is_active: true },
                    wednesday: { total_tokens: 40, online_limit: 20, walkin_limit: 20, start_time: '10:00', is_active: true },
                    thursday: { total_tokens: 40, online_limit: 20, walkin_limit: 20, start_time: '10:00', is_active: true },
                    friday: { total_tokens: 40, online_limit: 20, walkin_limit: 20, start_time: '10:00', is_active: true },
                    saturday: { total_tokens: 40, online_limit: 20, walkin_limit: 20, start_time: '10:00', is_active: true },
                    sunday: { total_tokens: 40, online_limit: 20, walkin_limit: 20, start_time: '10:00', is_active: false }
                },
                date_overrides: []
            };
        }

        res.json({ success: true, data: config });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Update token configuration
// @route   POST /api/system/token-config
exports.updateTokenConfig = async (req, res) => {
    try {
        const { doctor_id, weekly_config, date_overrides } = req.body || {};

        if (!doctor_id) {
            return res.status(400).json({ success: false, message: 'doctor_id is required' });
        }

        const config = await DoctorTokenConfig.findOneAndUpdate(
            { doctor_id },
            {
                $set: {
                    weekly_config,
                    date_overrides,
                    updated_at: new Date()
                }
            },
            { upsert: true, new: true }
        );

        await audit({
            event_type: 'TOKEN_CONFIG_UPDATED',
            entity_type: 'doctor_token_config',
            entity_id: doctor_id,
            actor: req.user?.username || 'ADMIN',
            actor_type: req.user?.role || 'ADMIN'
        });

        res.json({ success: true, data: config });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Add a date override
// @route   POST /api/system/token-config/override
exports.addDateOverride = async (req, res) => {
    try {
        const { doctor_id, date, total_tokens, online_limit, walkin_limit, start_time, is_holiday } = req.body || {};

        if (!doctor_id || !date) {
            return res.status(400).json({ success: false, message: 'doctor_id and date are required' });
        }

        const override = {
            date: new Date(date),
            total_tokens,
            online_limit,
            walkin_limit,
            start_time,
            is_holiday
        };

        const config = await DoctorTokenConfig.findOneAndUpdate(
            { doctor_id },
            { $push: { date_overrides: override }, $set: { updated_at: new Date() } },
            { upsert: true, new: true }
        );

        res.json({ success: true, data: config });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
