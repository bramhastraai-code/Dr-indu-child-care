const Admin = require('../../models/Admin');
const Doctor = require('../../models/Doctor');
const Token = require('../../models/Token');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const audit = require('../../utils/audit');

// Session/token lifetime configuration
// ACCESS_TOKEN_EXPIRES_IN:
// - set to "never" (default) for no auto logout until explicit logout
// - or any jsonwebtoken value like "15m", "24h", "7d"
const ACCESS_TOKEN_EXPIRES_IN = (process.env.ACCESS_TOKEN_EXPIRES_IN || 'never').trim();
const REFRESH_TOKEN_TTL_DAYS = Number.parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '3650', 10);

const getRefreshTokenExpiry = () => {
    const ttlDays = Number.isFinite(REFRESH_TOKEN_TTL_DAYS) && REFRESH_TOKEN_TTL_DAYS > 0
        ? REFRESH_TOKEN_TTL_DAYS
        : 3650;
    return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
};

const normalizeIdentifier = (identifier) => String(identifier || '').trim();

const buildTokenPayload = (user, userType = 'admin') => {
    if (userType === 'doctor') {
        return {
            id: user._id,
            username: user.login_username || user.login_email || user.doctor_id,
            role: 'doctor',
            user_type: 'doctor',
            doctor_id: user.doctor_id
        };
    }

    return {
        id: user._id,
        username: user.username,
        role: user.role,
        user_type: 'admin'
    };
};

const buildUserResponse = (user, userType = 'admin') => {
    if (userType === 'doctor') {
        return {
            id: user._id,
            doctor_id: user.doctor_id,
            username: user.login_username || user.login_email || user.doctor_id,
            role: 'doctor',
            full_name: user.name,
            permissions: []
        };
    }

    return {
        id: user._id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        permissions: user.permissions || []
    };
};

/**
 * Generate Access Token
 */
const generateAccessToken = (user, userType = 'admin') => {
    const payload = buildTokenPayload(user, userType);
    if (ACCESS_TOKEN_EXPIRES_IN.toLowerCase() === 'never') {
        return jwt.sign(payload, process.env.JWT_SECRET);
    }
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
};

/**
 * Generate Refresh Token
 */
const generateRefreshToken = async (user, ipAddress, userType = 'admin') => {
    const token = crypto.randomBytes(40).toString('hex');
    const expiresAt = getRefreshTokenExpiry();

    const refreshToken = new Token({
        user_id: String(user._id),
        user_type: userType,
        token: token,
        expires_at: expiresAt,
        created_by_ip: ipAddress
    });

    await refreshToken.save();
    return token;
};

/**
 * Send tokens in response and cookie
 */
const sendTokenResponse = async (user, ipAddress, res, userType = 'admin') => {
    const accessToken = generateAccessToken(user, userType);
    const refreshToken = await generateRefreshToken(user, ipAddress, userType);

    const cookieOptions = {
        httpOnly: true,
        expires: getRefreshTokenExpiry(),
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict'
    };

    res.cookie('refreshToken', refreshToken, cookieOptions);

    res.json({
        success: true,
        access_token: accessToken,
        user: buildUserResponse(user, userType)
    });
};

const findAdminByLogin = async (identifier) => {
    return Admin.findOne({
        $or: [{ username: identifier }, { email: identifier }],
        is_active: true
    });
};

const findDoctorByLogin = async (identifier) => {
    const normalized = identifier.toLowerCase();
    return Doctor.findOne({
        $or: [{ login_username: normalized }, { login_email: normalized }],
        is_active: true
    }).select('+password_hash');
};

/**
 * @desc    Login user (admin or doctor)
 * @route   POST /api/auth/login
 */
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body || {};
        const identifier = normalizeIdentifier(username);
        const ipAddress = req.ip;

        if (!identifier || !password) {
            return res.status(400).json({ success: false, error_code: 'VALIDATION_ERROR', message: 'Username and password are required' });
        }

        const admin = await findAdminByLogin(identifier);
        if (admin && (await admin.comparePassword(password))) {
            await Admin.updateOne({ _id: admin._id }, { $set: { last_login_at: new Date() } });

            await audit({
                event_type: 'LOGIN_SUCCESS',
                entity_type: 'admin_user',
                entity_id: String(admin._id),
                actor: admin.username,
                actor_type: admin.role,
                ip: ipAddress
            });

            await sendTokenResponse(admin, ipAddress, res, 'admin');
            return;
        }

        const doctor = await findDoctorByLogin(identifier);
        if (!doctor || !(await doctor.comparePassword(password))) {
            return res.status(401).json({ success: false, error_code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
        }

        await Doctor.updateOne({ _id: doctor._id }, { $set: { last_login_at: new Date() } });

        await audit({
            event_type: 'DOCTOR_LOGIN_SUCCESS',
            entity_type: 'doctor',
            entity_id: String(doctor.doctor_id),
            actor: doctor.login_username || doctor.login_email || doctor.doctor_id,
            actor_type: 'doctor',
            ip: ipAddress
        });

        await sendTokenResponse(doctor, ipAddress, res, 'doctor');
    } catch (err) {
        res.status(500).json({ success: false, error_code: 'INTERNAL_ERROR', message: err.message });
    }
};

/**
 * @desc    Refresh access token
 * @route   POST /api/admin/refresh-token
 */
exports.refreshToken = async (req, res) => {
    try {
        const token = req.cookies.refreshToken;
        const ipAddress = req.ip;

        if (!token) {
            return res.status(401).json({ success: false, error_code: 'UNAUTHORIZED', message: 'Refresh token missing' });
        }

        const refreshToken = await Token.findOne({ token, revoked_at: { $exists: false } });

        if (!refreshToken || refreshToken.is_expired) {
            return res.status(401).json({ success: false, error_code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired' });
        }

        const userType = refreshToken.user_type || 'admin';
        const user = userType === 'doctor'
            ? await Doctor.findById(refreshToken.user_id).select('+password_hash')
            : await Admin.findById(refreshToken.user_id);

        if (!user || !user.is_active) {
            return res.status(401).json({ success: false, error_code: 'USER_NOT_FOUND', message: 'User associated with token no longer exists or is inactive' });
        }

        // Rotate token
        const newToken = crypto.randomBytes(40).toString('hex');
        refreshToken.revoked_at = Date.now();
        refreshToken.revoked_by_ip = ipAddress;
        refreshToken.replaced_by_token = newToken;
        await refreshToken.save();

        const newRefreshToken = new Token({
            user_id: String(user._id),
            user_type: userType,
            token: newToken,
            expires_at: getRefreshTokenExpiry(),
            created_by_ip: ipAddress
        });
        await newRefreshToken.save();

        const accessToken = generateAccessToken(user, userType);

        const cookieOptions = {
            httpOnly: true,
            expires: getRefreshTokenExpiry(),
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict'
        };

        res.cookie('refreshToken', newToken, cookieOptions);
        res.json({ success: true, access_token: accessToken });

    } catch (err) {
        res.status(500).json({ success: false, error_code: 'INTERNAL_ERROR', message: err.message });
    }
};

/**
 * @desc    Logout admin
 * @route   POST /api/admin/logout
 */
exports.logout = async (req, res) => {
    try {
        const token = req.cookies.refreshToken;
        if (token) {
            await Token.updateOne({ token }, { $set: { revoked_at: Date.now(), revoked_by_ip: req.ip } });
        }

        res.clearCookie('refreshToken');
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error_code: 'INTERNAL_ERROR', message: err.message });
    }
};

/**
 * @desc    Change current user password
 * @route   POST /api/auth/change-password
 */
exports.changePassword = async (req, res) => {
    try {
        const { old_password, new_password } = req.body || {};
        const userType = req.user?.user_type || (req.user?.role === 'doctor' ? 'doctor' : 'admin');

        if (!old_password || !new_password) {
            return res.status(400).json({ success: false, error_code: 'VALIDATION_ERROR', message: 'old_password and new_password are required' });
        }

        if (new_password.length < 6) {
            return res.status(400).json({ success: false, error_code: 'VALIDATION_ERROR', message: 'new_password must be at least 6 characters' });
        }

        if (userType === 'doctor') {
            const doctor = await Doctor.findById(req.user.id).select('+password_hash');
            if (!doctor || !doctor.is_active) {
                return res.status(404).json({ success: false, error_code: 'NOT_FOUND', message: 'User not found' });
            }

            const isMatch = await doctor.comparePassword(old_password);
            if (!isMatch) {
                return res.status(400).json({ success: false, error_code: 'INVALID_CREDENTIALS', message: 'Old password is incorrect' });
            }

            doctor.password_hash = new_password;
            await doctor.save();

            return res.json({ success: true, message: 'Password updated successfully' });
        }

        const admin = await Admin.findById(req.user.id);
        if (!admin) {
            return res.status(404).json({ success: false, error_code: 'NOT_FOUND', message: 'User not found' });
        }

        const isMatch = await admin.comparePassword(old_password);
        if (!isMatch) {
            return res.status(400).json({ success: false, error_code: 'INVALID_CREDENTIALS', message: 'Old password is incorrect' });
        }

        // Set new password — pre-save hook will hash it
        admin.password_hash = new_password;
        await admin.save();

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error_code: 'INTERNAL_ERROR', message: err.message });
    }
};
