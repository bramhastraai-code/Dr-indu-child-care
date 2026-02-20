import React, { useState } from 'react';
import { Search, RefreshCw, AlertCircle, Plus, X, FileText, Download } from 'lucide-react';
import { getPatientByWa, getPatientById, getMRDByPatientId, addMRDEntry, exportMRD } from '../api/index';

const today = () => new Date().toISOString().split('T')[0];

const EMPTY_ENTRY = {
    patient_id: '', appointment_id: '', visit_date: today(),
    visit_type: 'CONSULTATION', attending_doctor: 'Dr. Indu',
    chief_complaint: '', clinical_notes: '', diagnosis: '',
    prescription: '', investigations: '', next_visit_due: '', recorded_by: 'Dr. Indu'
};

const MRD = () => {
    const [search, setSearch] = useState('');
    const [patient, setPatient] = useState(null);
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState(EMPTY_ENTRY);
    const [saving, setSaving] = useState(false);
    const [formErr, setFormErr] = useState(null);
    const [formOk, setFormOk] = useState(null);
    const [expanded, setExpanded] = useState(null);
    const [exporting, setExporting] = useState(false);

    const doSearch = async () => {
        const q = search.trim();
        if (!q) return;
        setLoading(true); setError(null); setPatient(null); setRecords([]);
        try {
            let pat;
            if (q.startsWith('DICC-')) {
                pat = (await getPatientById(q)).data.data;
            } else {
                pat = (await getPatientByWa(q)).data.data;
            }
            setPatient(pat);
            // Load MRD
            const mrdRes = await getMRDByPatientId(pat.patient_id);
            setRecords(mrdRes.data?.data?.mrd_entries || []);
            setForm(f => ({ ...f, patient_id: pat.patient_id }));
        } catch (e) {
            if (e.response?.status === 404) setError('Patient not found. Check the mobile number or patient ID.');
            else setError(e.response?.data?.message || e.message);
        } finally { setLoading(false); }
    };

    const handleAddEntry = async (e) => {
        e.preventDefault();
        setSaving(true); setFormErr(null); setFormOk(null);
        try {
            await addMRDEntry(form);
            setFormOk('✅ MRD entry added successfully.');
            setForm(EMPTY_ENTRY);
            // Reload records
            const mrdRes = await getMRDByPatientId(patient.patient_id);
            setRecords(mrdRes.data?.data?.mrd_entries || []);
        } catch (e) {
            setFormErr(e.response?.data?.message || e.response?.data?.error || e.message);
        } finally { setSaving(false); }
    };

    const handleExport = async () => {
        if (!patient) return;
        setExporting(true);
        try {
            const res = await exportMRD(patient.patient_id);
            const blob = new Blob([JSON.stringify(res.data.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `MRD_${patient.patient_id}_${today()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            setError('Export failed: ' + (e.response?.data?.message || e.message));
        } finally { setExporting(false); }
    };

    const dobDisplay = (d) => {
        if (!d) return '—';
        try {
            const date = new Date(d);
            if (isNaN(date)) return d;
            const y = Math.floor((Date.now() - date) / (365.25 * 24 * 3600 * 1000));
            return `${date.toLocaleDateString('en-IN')} (${y}y)`;
        } catch { return d; }
    };

    return (
        <div>
            <div className="title-section">
                <h1>Medical Records (MRD)</h1>
                <p>Search a patient to view or update their longitudinal health file.</p>
            </div>

            {/* Search */}
            <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <div className="search-box">
                        <Search className="search-icon" size={20} />
                        <input
                            id="mrd-search"
                            type="text"
                            placeholder="Search by mobile number or Patient ID (DICC-2026-XXXX)…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && doSearch()}
                        />
                    </div>
                    <button className="btn btn-primary" onClick={doSearch} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
                        {loading ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />}
                        Search
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.5rem', color: '#dc2626', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {/* Patient summary card */}
            {patient && (
                <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #4f46e5' }}>
                    <div className="card-header">
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FileText size={18} color="#4f46e5" />
                            {patient.child_name} — <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#4f46e5' }}>{patient.patient_id}</span>
                        </h3>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button className="btn btn-outline" onClick={handleExport} disabled={exporting} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                                <Download size={14} /> {exporting ? 'Exporting…' : 'Export JSON'}
                            </button>
                            <button className="btn btn-primary" onClick={() => { setShowModal(true); setFormErr(null); setFormOk(null); setForm(f => ({ ...EMPTY_ENTRY, patient_id: patient.patient_id })); }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                                <Plus size={14} /> Add Entry
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem', paddingTop: '1rem' }}>
                        {[
                            ['Parent Name', patient.parent_name],
                            ['Mobile Number', patient.parent_mobile],
                            ['Date of Birth', dobDisplay(patient.dob)],
                            ['MRD Status', patient.registration_status || 'COMPLETE'],
                        ].map(([label, val]) => (
                            <div key={label}>
                                <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>{label}</div>
                                <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#1e293b' }}>{val}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* MRD entries */}
            {patient && (
                <div className="card">
                    <div className="card-header">
                        <h3>Medical History ({records.length} {records.length === 1 ? 'entry' : 'entries'})</h3>
                    </div>
                    {records.length === 0 ? (
                        <p style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                            No medical records yet. Click "Add Entry" to record the first visit.
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0' }}>
                            {records.map((rec, i) => (
                                <div key={rec._id || i} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                    {/* Row header */}
                                    <div
                                        onClick={() => setExpanded(expanded === i ? null : i)}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', cursor: 'pointer', background: expanded === i ? '#f8fafc' : '#fff', transition: 'all 0.2s' }}
                                    >
                                        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                                            <div style={{ width: '80px' }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#6366f1' }}>
                                                    {new Date(rec.visit_date || rec.createdAt).toLocaleDateString('en-IN')}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>{rec.visit_type}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>{rec.chief_complaint || 'General Checkup'}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Attending: <span style={{ fontWeight: 600 }}>{rec.attending_doctor}</span></div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            {rec.diagnosis && <span style={{ fontSize: '0.7rem', background: '#f0f9ff', color: '#0369a1', borderRadius: '6px', padding: '0.25rem 0.6rem', fontWeight: 600, border: '1px solid #bae6fd' }}>{rec.diagnosis.substring(0, 30)}{rec.diagnosis.length > 30 ? '…' : ''}</span>}
                                            <span style={{ color: '#94a3b8', fontSize: '0.8rem', transition: 'transform 0.2s', transform: expanded === i ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                                        </div>
                                    </div>
                                    {/* Expanded detail */}
                                    {expanded === i && (
                                        <div style={{ borderTop: '1px solid #f1f5f9', padding: '1.5rem', background: '#fafafa' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                                                {[
                                                    ['Clinical Notes', rec.clinical_notes],
                                                    ['Diagnosis', rec.diagnosis],
                                                    ['Prescription', rec.prescription],
                                                    ['Investigations', rec.investigations],
                                                    ['Next Visit Due', rec.next_visit_due ? new Date(rec.next_visit_due).toLocaleDateString('en-IN') : 'None set'],
                                                    ['Recorded by', rec.recorded_by],
                                                ].map(([label, val]) => (
                                                    <div key={label} style={{ background: '#fff', padding: '1rem', borderRadius: '10px', border: '1px solid #f1f5f9', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>{label}</div>
                                                        <div style={{ fontSize: '0.875rem', color: '#334155', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{val || '—'}</div>
                                                    </div>
                                                ))}
                                                <div style={{ gridColumn: '1 / -1', fontSize: '0.7rem', color: '#cbd5e1', fontStyle: 'italic', textAlign: 'right' }}>
                                                    Entry ID: {rec._id} {rec.appointment_id ? `| Linked Appt: ${rec.appointment_id}` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {!patient && !loading && !error && (
                <div className="card">
                    <p style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                        Search for a patient above to view their medical record.
                    </p>
                </div>
            )}

            {/* Add Entry Modal */}
            {showModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: '16px', padding: '2rem', width: '600px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Add MRD Entry — {patient?.patient_id}</h2>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={22} /></button>
                        </div>

                        {formErr && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' }}>{formErr}</div>}
                        {formOk && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', color: '#16a34a', fontSize: '0.875rem' }}>{formOk}</div>}

                        <form onSubmit={handleAddEntry}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Appointment ID</label>
                                    <input id="mrd-appt-id" value={form.appointment_id} onChange={e => setForm(f => ({ ...f, appointment_id: e.target.value }))} placeholder="APT-2026-XXXXX (optional)"
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Visit Date *</label>
                                    <input id="mrd-visit-date" type="date" required value={form.visit_date} onChange={e => setForm(f => ({ ...f, visit_date: e.target.value }))}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Visit Type</label>
                                    <select id="mrd-visit-type" value={form.visit_type} onChange={e => setForm(f => ({ ...f, visit_type: e.target.value }))}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem' }}>
                                        <option value="CONSULTATION">Consultation</option>
                                        <option value="VACCINATION">Vaccination</option>
                                        <option value="PULMONARY">Pulmonary Assessment</option>
                                        <option value="FOLLOWUP">Follow-up</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Attending Doctor *</label>
                                    <input id="mrd-doctor" required value={form.attending_doctor} onChange={e => setForm(f => ({ ...f, attending_doctor: e.target.value }))}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                                </div>
                                {[
                                    { id: 'chief_complaint', label: 'Chief Complaint *', required: true },
                                    { id: 'diagnosis', label: 'Diagnosis' },
                                ].map(({ id, label, required }) => (
                                    <div key={id}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>{label}</label>
                                        <input id={`mrd-${id}`} required={required} value={form[id]} onChange={e => setForm(f => ({ ...f, [id]: e.target.value }))}
                                            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                                    </div>
                                ))}
                                {['clinical_notes', 'prescription', 'investigations'].map(id => (
                                    <div key={id} style={{ gridColumn: '1 / -1' }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', textTransform: 'capitalize' }}>{id.replace('_', ' ')}</label>
                                        <textarea id={`mrd-${id}`} rows={2} value={form[id]} onChange={e => setForm(f => ({ ...f, [id]: e.target.value }))}
                                            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' }} />
                                    </div>
                                ))}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Next Visit Due</label>
                                    <input id="mrd-next-visit" type="date" value={form.next_visit_due} onChange={e => setForm(f => ({ ...f, next_visit_due: e.target.value }))}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Recorded By *</label>
                                    <input id="mrd-recorded-by" required value={form.recorded_by} onChange={e => setForm(f => ({ ...f, recorded_by: e.target.value }))}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Entry'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
        </div>
    );
};

export default MRD;
