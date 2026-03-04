const isDoctorSession = (req) => {
    return req?.authMethod === 'jwt' && req?.user?.role === 'doctor';
};

const getDoctorIdFromSession = (req) => {
    return isDoctorSession(req) ? (req.user?.doctor_id || null) : null;
};

const ensureDoctorSessionHasProfile = (req, res) => {
    if (!isDoctorSession(req)) return true;

    const doctorId = getDoctorIdFromSession(req);
    if (doctorId) return true;

    res.status(403).json({
        success: false,
        error_code: 'DOCTOR_PROFILE_NOT_LINKED',
        message: 'Doctor account is not linked to a doctor profile'
    });
    return false;
};

const ensureDoctorMatches = (req, res, doctorId, message = 'Access denied for this doctor profile') => {
    if (!isDoctorSession(req)) return true;
    if (!ensureDoctorSessionHasProfile(req, res)) return false;

    if (!doctorId) {
        res.status(403).json({
            success: false,
            error_code: 'DOCTOR_SCOPE_FORBIDDEN',
            message
        });
        return false;
    }

    const sessionDoctorId = getDoctorIdFromSession(req);
    if (String(doctorId) === String(sessionDoctorId)) return true;

    res.status(403).json({
        success: false,
        error_code: 'DOCTOR_SCOPE_FORBIDDEN',
        message
    });
    return false;
};

const withDoctorFilter = (req, filter = {}) => {
    const scopedFilter = { ...filter };
    const doctorId = getDoctorIdFromSession(req);
    if (doctorId) scopedFilter.doctor_id = doctorId;
    return scopedFilter;
};

module.exports = {
    isDoctorSession,
    getDoctorIdFromSession,
    ensureDoctorSessionHasProfile,
    ensureDoctorMatches,
    withDoctorFilter
};
