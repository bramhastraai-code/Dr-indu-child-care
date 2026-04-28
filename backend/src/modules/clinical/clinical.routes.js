const express = require('express');
const router = express.Router();
const {
    getICD10,
    getMedicines,
    getInvestigations,
    getProcedures,
    getComplaints,
    getAllergies,
    getDiagramTemplates
} = require('./clinical.controller');

router.get('/icd10', getICD10);
router.get('/medicines', getMedicines);
router.get('/investigations', getInvestigations);
router.get('/procedures', getProcedures);
router.get('/complaints', getComplaints);
router.get('/allergies', getAllergies);
router.get('/diagram-templates', getDiagramTemplates);

module.exports = router;
