const Admin = require('../../models/Admin');
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

/**
 * Generate Access Token
 */
const generateAccessToken = (user) => {
    const payload = { id: user._id, username: user.username, role: user.role };
    if (ACCESS_TOKEN_EXPIRES_IN.toLowerCase() === 'never') {
        return jwt.sign(payload, process.env.JWT_SECRET);
    }
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
};

/**
 * Generate Refresh Token
 */
const generateRefreshToken = async (user, ipAddress) => {
    const token = crypto.randomBytes(40).toString('hex');
    const expiresAt = getRefreshTokenExpiry();

    const refreshToken = new Token({
        user_id: user._id,
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
const sendTokenResponse = async (user, ipAddress, res) => {
    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user, ipAddress);

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
        user: {
            id: user._id,
            username: user.username,
            role: user.role,
            full_name: user.full_name
        }
    });
};

/**
 * @desc    Login admin
 * @route   POST /api/admin/login
 */
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const ipAddress = req.ip;

        if (!username || !password) {
            return res.status(400).json({ success: false, error_code: 'VALIDATION_ERROR', message: 'Username and password are required' });
        }

        const admin = await Admin.findOne({ $or: [{ username }, { email: username }], is_active: true });

        if (!admin || !(await admin.comparePassword(password))) {
            return res.status(401).json({ success: false, error_code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
        }

        await Admin.updateOne({ _id: admin._id }, { $set: { last_login_at: new Date() } });

        await audit({
            event_type: 'LOGIN_SUCCESS',
            entity_type: 'admin_user',
            entity_id: String(admin._id),
            actor: admin.username,
            actor_type: admin.role,
            ip: ipAddress
        });

        await sendTokenResponse(admin, ipAddress, res);
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

        const admin = await Admin.findById(refreshToken.user_id);
        if (!admin || !admin.is_active) {
            return res.status(401).json({ success: false, error_code: 'USER_NOT_FOUND', message: 'User associated with token no longer exists or is inactive' });
        }

        // Rotate token
        const newToken = crypto.randomBytes(40).toString('hex');
        refreshToken.revoked_at = Date.now();
        refreshToken.revoked_by_ip = ipAddress;
        refreshToken.replaced_by_token = newToken;
        await refreshToken.save();

        const newRefreshToken = new Token({
            user_id: admin._id,
            token: newToken,
            expires_at: getRefreshTokenExpiry(),
            created_by_ip: ipAddress
        });
        await newRefreshToken.save();

        const accessToken = generateAccessToken(admin);

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
