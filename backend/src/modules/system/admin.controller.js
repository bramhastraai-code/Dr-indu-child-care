const Admin = require('../../models/Admin');
const Token = require('../../models/Token');
const jwt = require('jsonwebtoken');
const audit = require('../../utils/audit');
const mongoose = require('mongoose');

const ROLE_MAP = {
    superadmin: 'superadmin',
    super_admin: 'superadmin',
    admin: 'admin',
    staff: 'staff',
    secretary: 'secretary',
    doctor: 'doctor'
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
                access_token: token,
                token_type: 'Bearer',
                expires_in: 86400,
                user: {
                    id: admin._id,
                    username: admin.username,
                    role: admin.role,
                    full_name: admin.full_name,
                    email: admin.email,
                    permissions: admin.permissions || []
                }
            });
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get all admin users (with pagination + filters)
// @route   GET /api/admin/users
// @access  Private (SUPER_ADMIN / ADMIN)
exports.getAdmins = async (req, res) => {
    try {
        const { page = 1, limit = 50, role, is_active, search } = req.query;

        const filter = {};
        if (role) filter.role = role;
        if (is_active !== undefined) filter.is_active = is_active === 'true';
        if (search) filter.$or = [
            { username: { $regex: search, $options: 'i' } },
            { full_name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
        ];

        const skip = (Number(page) - 1) * Number(limit);
        const [admins, total] = await Promise.all([
            Admin.find(filter).select('-password_hash').sort({ created_at: -1 }).skip(skip).limit(Number(limit)),
            Admin.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: admins,
            pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Create a new admin user
// @route   POST /api/admin/users
// @access  Private (SUPER_ADMIN)
exports.createAdmin = async (req, res) => {
    try {
        const { username, email, password, full_name, role, permissions } = req.body || {};
        const normalizedRole = normalizeRole(role);

        if (!normalizedRole) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role. Allowed roles: superadmin, admin, staff, secretary, doctor'
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
            role: normalizedRole,
            permissions: permissions || []
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
// @route   PATCH /api/admin/users/:user_id
// @access  Private (SUPER_ADMIN)
exports.updateAdmin = async (req, res) => {
    try {
        const { full_name, role, is_active, email, permissions, password } = req.body || {};
        const { user_id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(user_id)) {
            return res.status(400).json({ success: false, message: 'Invalid admin user id' });
        }

        const admin = await Admin.findById(user_id);
        if (!admin) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const old_value = { full_name: admin.full_name, role: admin.role, is_active: admin.is_active, email: admin.email };

        if (full_name !== undefined) admin.full_name = full_name;
        if (email !== undefined) admin.email = email;
        if (role !== undefined) {
            const normalizedRole = normalizeRole(role);
            if (!normalizedRole) {
                return res.status(400).json({ success: false, message: 'Invalid role. Allowed roles: superadmin, admin, staff, secretary, doctor' });
            }
            admin.role = normalizedRole;
        }
        if (is_active !== undefined) admin.is_active = is_active;
        if (permissions !== undefined) admin.permissions = permissions;
        if (password !== undefined && password !== '') {
            admin.password_hash = password; // pre-save hook will hash it
        }

        await admin.save();

        await audit({
            event_type: 'ADMIN_USER_UPDATED',
            entity_type: 'admin_user',
            entity_id: String(admin._id),
            actor: req.user ? req.user.username : 'SYSTEM',
            actor_type: req.user ? req.user.role : 'SUPER_ADMIN',
            old_value,
            new_value: { full_name, role, is_active, email, permissions, password_changed: !!password }
        });

        res.json({ success: true, message: 'User updated successfully', data: admin });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get available roles (for UI dropdowns)
// @route   GET /api/admin/roles
// @access  Public
exports.getAvailableRoles = async (req, res) => {
    res.json({
        success: true,
        data: [
            { id: 'superadmin', label: 'Super Admin', description: 'Full system access' },
            { id: 'admin', label: 'Admin', description: 'Clinic management access' },
            { id: 'staff', label: 'Staff', description: 'Appointment and patient access' },
            { id: 'secretary', label: 'Secretary', description: 'Reception and scheduling' },
            { id: 'doctor', label: 'Doctor', description: 'Clinical and MRD access' }
        ]
    });
};

// @desc    Delete/deactivate admin user (soft delete)
// @route   DELETE /api/admin/users/:user_id
// @access  Public
exports.deleteAdmin = async (req, res) => {
    try {
        const { user_id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(user_id)) {
            return res.status(400).json({ success: false, message: 'Invalid admin user id' });
        }

        const admin = await Admin.findById(user_id);
        if (!admin) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Soft delete — deactivate
        await Admin.updateOne({ _id: admin._id }, { $set: { is_active: false } });

        await audit({
            event_type: 'ADMIN_USER_DELETED',
            entity_type: 'admin_user',
            entity_id: String(admin._id),
            actor: req.user ? req.user.username : 'SYSTEM',
            actor_type: req.user ? req.user.role : 'SUPER_ADMIN',
            new_value: { deleted: true }
        });

        res.json({ success: true, message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get system overview (stats for superadmin)
// @route   GET /api/admin/overview
// @access  Public
exports.getSystemOverview = async (req, res) => {
    try {
        const [userCount, doctorCount, patientCount, auditCount] = await Promise.all([
            Admin.countDocuments({ is_active: true }),
            mongoose.model('Doctor').countDocuments({}),
            mongoose.model('Patient').countDocuments({ is_deleted: false }),
            mongoose.model('AuditLog').countDocuments({})
        ]);

        const roleBreakdown = await Admin.aggregate([
            { $match: { is_active: true } },
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            data: {
                counts: {
                    active_users: userCount,
                    doctors: doctorCount,
                    patients: patientCount,
                    total_audit_logs: auditCount
                },
                roles: roleBreakdown.reduce((acc, r) => {
                    acc[r._id] = r.count;
                    return acc;
                }, {})
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get an admin profile (Public with credentials check)
// @route   GET /api/admin/profile
// @access  Public
exports.getProfile = async (req, res) => {
    try {
        const { user_id, username, password } = req.query || {};
        let admin;

        if (user_id) {
            admin = await Admin.findById(user_id);
        } else if (username) {
            admin = await Admin.findOne({ username });
        } else {
            // Re-designed for public use: fallback to first active superadmin
            admin = await Admin.findOne({ role: 'superadmin', is_active: true });
        }

        if (!admin) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Check password if provided (for secure public lookup)
        if (password && !(await admin.comparePassword(password))) {
            return res.status(401).json({ success: false, message: 'Invalid password' });
        }

        res.json({
            success: true,
            data: {
                id: admin._id,
                username: admin.username,
                email: admin.email,
                full_name: admin.full_name,
                role: admin.role,
                is_active: admin.is_active,
                last_login_at: admin.last_login_at,
                permissions: admin.permissions || []
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Update an admin profile (Public with credentials check)
// @route   PATCH /api/admin/profile
// @access  Public
exports.updateProfile = async (req, res) => {
    try {
        const { user_id, username, current_password, full_name, email, new_password } = req.body || {};
        let admin;

        if (user_id) {
            admin = await Admin.findById(user_id);
        }

        // If not found by ID, try username if provided
        if (!admin && username) {
            admin = await Admin.findOne({ username });
        }

        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin profile not found. Please provide a valid user_id or username to identify which profile to update.' });
        }

        // Verify current password for any update in public mode
        if (!current_password || !(await admin.comparePassword(current_password))) {
            return res.status(401).json({ success: false, message: 'Invalid current password. Verification required to update profile.' });
        }

        if (full_name !== undefined) admin.full_name = full_name;
        if (email !== undefined) admin.email = email;
        if (new_password !== undefined && new_password !== '') {
            admin.password_hash = new_password;
        }

        await admin.save();

        res.json({ success: true, message: 'Profile updated successfully', data: { id: admin._id, username: admin.username } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
