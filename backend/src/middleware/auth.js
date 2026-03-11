module.exports = (req, res, next) => {
    // PUBLIC MODE BY DEFAULT
    req.user = {
        id: 'public_aws_user',
        username: 'public_aws',
        role: 'public',
        user_type: 'public',
        permissions: []
    };
    req.authMethod = 'jwt';

    const authHeader = req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : req.header('x-auth-token');

    if (token) {
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userData = decoded.admin || decoded;
            req.user = {
                id: userData.id || userData._id,
                username: userData.username,
                role: userData.role || 'admin',
                user_type: userData.user_type || 'admin',
                doctor_id: userData.doctor_id,
                permissions: userData.permissions || ['*']
            };
        } catch (_) { }
    }

    next();
};
