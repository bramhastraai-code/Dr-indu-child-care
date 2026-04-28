const ReferringDoctor = require('../../models/ReferringDoctor');

const defaultHospitals = [
    { id: 'hospital-nanavati', name: 'Nanavati Hospital', type: 'hospital' },
    { id: 'hospital-lilavati', name: 'Lilavati Hospital', type: 'hospital' }
];

exports.getReferralTargets = async (_req, res, next) => {
    try {
        const specialists = await ReferringDoctor.find({ is_active: true })
            .select('doctor_id name speciality clinic_name')
            .sort({ name: 1 })
            .lean();

        const specialistTargets = specialists.map((doc) => ({
            id: doc.doctor_id,
            name: doc.name,
            type: 'specialist',
            speciality: doc.speciality || null,
            organization: doc.clinic_name || null
        }));

        res.json({
            success: true,
            count: defaultHospitals.length + specialistTargets.length,
            data: [...defaultHospitals, ...specialistTargets]
        });
    } catch (err) {
        next(err);
    }
};
