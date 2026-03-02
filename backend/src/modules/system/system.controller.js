const SystemConfig = require('../../models/SystemConfig');
const AuditLog = require('../../models/AuditLog');
const audit = require('../../utils/audit');

// @desc    Health check endpoint
// @route   GET /api/system/health
exports.getHealth = async (req, res) => {
    try {
        // Minimal DB check
        await AuditLog.findOne().limit(1);

        res.status(200).json({
            status: "ok",
            success: true,
            timestamp: new Date().toISOString(),
            database: "connected",
            version: "1.0.0",
            uptime: process.uptime()
        });
    } catch (err) {
        res.status(503).json({
            status: "error",
            success: false,
            database: "disconnected",
            error: err.message
        });
    }
};

// @desc    Fetch clinic configuration
// @route   GET /api/config
exports.getConfig = async (req, res) => {
    try {
        const configs = await SystemConfig.find().sort({ config_key: 1 });

        // Convert to object format if requested or keep as array
        const configMap = {};
        configs.forEach(c => configMap[c.config_key] = c.config_value);

        res.json({
            success: true,
            data: configs,
            map: configMap
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Modify clinic configuration
// @route   PATCH /api/config
exports.updateConfig = async (req, res) => {
    try {
        const body = req.body;
        const actor = req.user ? req.user.username : 'ADMIN';
        const actor_type = req.user ? req.user.role : 'ADMIN';

        const keys = Object.keys(body);
        const updates = [];

        for (const key of keys) {
            const oldConfig = await SystemConfig.findOne({ config_key: key });

            const updated = await SystemConfig.findOneAndUpdate(
                { config_key: key },
                {
                    config_value: body[key],
                    updated_by: actor,
                    updated_at: new Date()
                },
                { upsert: true, new: true }
            );

            updates.push(updated);

            // Audit each change
            await audit({
                event_type: 'CONFIG_UPDATED',
                entity_type: 'clinic_config',
                entity_id: key,
                actor,
                actor_type,
                old_value: oldConfig ? { [key]: oldConfig.config_value } : null,
                new_value: { [key]: body[key] }
            });
        }

        res.json({ success: true, message: 'Configuration updated', data: updates });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Fetch audit logs
// @route   GET /api/audit/logs
exports.getAuditLogs = async (req, res) => {
    try {
        const { entity_type, from, to, actor_type, limit = 50, page = 1 } = req.query;

        const filter = {};
        if (entity_type) filter.entity_type = entity_type;
        if (actor_type) filter.actor_type = actor_type;
        if (from || to) {
            filter.occurred_at = {};
            if (from) filter.occurred_at.$gte = new Date(from);
            if (to) filter.occurred_at.$lte = new Date(to);
        }

        const skip = (Number(page) - 1) * Number(limit);

        const logs = await AuditLog.find(filter)
            .sort({ occurred_at: -1 })
            .limit(Number(limit))
            .skip(skip);

        res.json({
            success: true,
            data: logs,
            query: { limit, page, total: await AuditLog.countDocuments(filter) }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Fetch workflow stages
// @route   GET /api/system/workflow-stages
exports.getWorkflowStages = async (req, res) => {
    try {
        const stages = [
            { stage_number: 1, name: "General Talk", key: "GENERAL_TALK" },
            { stage_number: 2, name: "Patient Registration", key: "PATIENT_REGISTRATION" },
            { stage_number: 3, name: "Appointment Booking", key: "APPOINTMENT_BOOKING" },
            { stage_number: 4, name: "Appointment Reminder", key: "APPOINTMENT_REMINDER" },
            { stage_number: 5, name: "Appointment Completed", key: "APPOINTMENT_COMPLETED" }
        ];

        res.status(200).json({
            success: true,
            count: stages.length,
            data: stages
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

