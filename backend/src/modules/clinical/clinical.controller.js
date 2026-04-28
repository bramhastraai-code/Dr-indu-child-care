const pickQuery = (req) => String(req.query.q || req.query.search || '').trim().toLowerCase();

const filterByQuery = (items, query, key = 'name') => {
    if (!query) return items.slice(0, 50);
    return items.filter((item) => String(item[key] || '').toLowerCase().includes(query)).slice(0, 50);
};

const ICD10 = [
    { code: 'J45.909', name: 'Asthma, unspecified, uncomplicated' },
    { code: 'R50.9', name: 'Fever, unspecified' },
    { code: 'J06.9', name: 'Acute upper respiratory infection, unspecified' },
    { code: 'K52.9', name: 'Noninfective gastroenteritis and colitis, unspecified' },
    { code: 'L20.9', name: 'Atopic dermatitis, unspecified' }
];
const MEDICINES = ['Paracetamol', 'Ibuprofen', 'Cetirizine', 'Azithromycin', 'Amoxicillin'].map((name) => ({ name }));
const INVESTIGATIONS = ['CBC', 'CRP', 'Chest X-Ray', 'Urine Routine', 'Dengue NS1'].map((name) => ({ name }));
const PROCEDURES = ['Nebulization', 'Wound Dressing', 'Suturing', 'Ear Syringing'].map((name) => ({ name }));
const COMPLAINTS = ['Fever', 'Cough', 'Cold', 'Vomiting', 'Loose Motions', 'Rash'].map((name) => ({ name }));
const ALLERGIES = ['Penicillin', 'Peanuts', 'Dust', 'Seafood', 'Pollen'].map((name) => ({ name }));
const DIAGRAM_TEMPLATES = [
    { id: 'body-front', name: 'Body Front', image_url: '/assets/clinical-diagrams/body-front.png' },
    { id: 'body-back', name: 'Body Back', image_url: '/assets/clinical-diagrams/body-back.png' },
    { id: 'head', name: 'Head', image_url: '/assets/clinical-diagrams/head.png' }
];

exports.getICD10 = async (req, res) => {
    const q = pickQuery(req);
    const data = q
        ? ICD10.filter((row) => `${row.code} ${row.name}`.toLowerCase().includes(q)).slice(0, 50)
        : ICD10;
    res.json({ success: true, count: data.length, data });
};

exports.getMedicines = async (req, res) => {
    const data = filterByQuery(MEDICINES, pickQuery(req));
    res.json({ success: true, count: data.length, data });
};

exports.getInvestigations = async (req, res) => {
    const data = filterByQuery(INVESTIGATIONS, pickQuery(req));
    res.json({ success: true, count: data.length, data });
};

exports.getProcedures = async (req, res) => {
    const data = filterByQuery(PROCEDURES, pickQuery(req));
    res.json({ success: true, count: data.length, data });
};

exports.getComplaints = async (req, res) => {
    const data = filterByQuery(COMPLAINTS, pickQuery(req));
    res.json({ success: true, count: data.length, data });
};

exports.getAllergies = async (req, res) => {
    const data = filterByQuery(ALLERGIES, pickQuery(req));
    res.json({ success: true, count: data.length, data });
};

exports.getDiagramTemplates = async (_req, res) => {
    res.json({ success: true, count: DIAGRAM_TEMPLATES.length, data: DIAGRAM_TEMPLATES });
};
