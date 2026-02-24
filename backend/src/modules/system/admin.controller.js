const Admin = require('../../models/Admin');
const Token = require('../../models/Token');
const jwt = require('jsonwebtoken');
const audit = require('../../utils/audit');
const mongoose = require('mongoose');

const ROLE_MAP = {
    superadmin: 'superadmin',
    super_admin: 'superadmin',
    admin: 'admin',
    staff: 'staff'
};

function normalizeRole(role) {
    if (typeof role !== 'string') return null;
    const key = role.trim().toLowerCase().replace(/[\s-]+/g, '_');
    return ROLE_MAP[key] || null;
}

// @desc    Admin login — issues JWT, updates last_login_at, writes audit log
// @route   POST /api/admin/login
// @access  Public
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body || {};

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }

        // Allow login by username OR email
        const admin = await Admin.findOne({
            $or: [{ username }, { email: username }],
            is_active: true
        });

        if (!admin) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }

        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }

        // Update last_login_at using updateOne to bypass the pre-save bcrypt hook
        await Admin.updateOne({ _id: admin._id }, { $set: { last_login_at: new Date() } });

        // Audit log
        await audit({
            event_type: 'DASHBOARD_LOGIN',
            entity_type: 'admin_user',
            entity_id: String(admin._id),
            actor: admin.username,
            actor_type: admin.role
        });

        const payload = { admin: { id: admin._id, username: admin.username, role: admin.role } };

        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' }, (err, token) => {
            if (err) throw err;
            res.json({
                success: true,
                token,
                user: {
                    user_id: admin._id,
                    username: admin.username,
                    email: admin.email,
                    role: admin.role,
                    full_name: admin.full_name
                }
            });
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get all admin users
// @route   GET /api/admin/users
// @access  Private (SUPER_ADMIN / ADMIN)
exports.getAdmins = async (req, res) => {
    try {
        const admins = await Admin.find().select('-password_hash').sort({ created_at: -1 });
        res.json({ success: true, data: admins });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Create a new admin user
// @route   POST /api/admin/users
// @access  Private (SUPER_ADMIN)
exports.createAdmin = async (req, res) => {
    try {
        const { username, email, password, full_name, role } = req.body || {};
        const normalizedRole = normalizeRole(role);

        if (!normalizedRole) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role. Allowed roles: superadmin, admin, staff'
            });
        }

        let adminExists = await Admin.findOne({ $or: [{ username }, { email }] });
        if (adminExists) {
            return res.status(400).json({ success: false, message: 'User already exists' });
        }

        const admin = new Admin({
            username,
            email,
            password_hash: password, // Pre-save hook will hash it
            full_name,
            role: normalizedRole
        });

        await admin.save();

        await audit({
            event_type: 'ADMIN_USER_CREATED',
            entity_type: 'admin_user',
            entity_id: String(admin._id),
            actor: req.user ? req.user.username : 'SYSTEM',
            actor_type: req.user ? req.user.role : 'ADMIN',
            new_value: { username, email, role: normalizedRole, full_name }
        });

        res.status(201).json({
            success: true,
            data: {
                user_id: admin._id,
                username: admin.username,
                email: admin.email,
                full_name: admin.full_name,
                role: admin.role
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Update an admin user
// @route   PATCH /api/admin/users/:id
// @access  Private (SUPER_ADMIN)
exports.updateAdmin = async (req, res) => {
    try {
        const { full_name, role, is_active, email } = req.body || {};
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid admin user id'
            });
        }

        const admin = await Admin.findById(id);

        if (!admin) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const old_value = { full_name: admin.full_name, role: admin.role, is_active: admin.is_active, email: admin.email };

        // Build update object — use direct DB update to avoid re-triggering bcrypt hook
        const updateFields = {};
        if (full_name !== undefined) updateFields.full_name = full_name;
        if (email !== undefined) updateFields.email = email;
        if (role !== undefined) {
            const normalizedRole = normalizeRole(role);
            if (!normalizedRole) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid role. Allowed roles: superadmin, admin, staff'
                });
            }
            updateFields.role = normalizedRole;
        }
        if (is_active !== undefined) updateFields.is_active = is_active;

        await Admin.updateOne({ _id: admin._id }, { $set: updateFields });
        Object.assign(admin, updateFields); // sync local object

        const new_value = { full_name: admin.full_name, role: admin.role, is_active: admin.is_active, email: admin.email };

        await audit({
            event_type: 'ADMIN_USER_UPDATED',
            entity_type: 'admin_user',
            entity_id: String(admin._id),
            actor: req.user ? req.user.username : 'SYSTEM',
            actor_type: req.user ? req.user.role : 'SUPER_ADMIN',
            old_value,
            new_value
        });

        res.json({ success: true, data: admin });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
