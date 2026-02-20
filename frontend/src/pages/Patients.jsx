import React, { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, AlertCircle, UserPlus, X, Edit2, User, Phone, Mail, MapPin, Calendar as CalendarIcon, FileText, Share2, ClipboardCheck, Share } from 'lucide-react';
import { getPatients, registerPatient, updatePatient } from '../api/index';

const EMPTY_FORM = {
    child_name: '', parent_name: '', mobile: '',
    alt_mobile: '', dob: '', gender: 'Male', email: '', address: '', symptoms_notes: '',
    registration_source: 'dashboard'
};

const Patients = () => {
    const [patients, setPatients] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selected, setSelected] = useState(null);   // patient detail panel
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [formErr, setFormErr] = useState(null);
    const [formOk, setFormOk] = useState(null);
    const [saving, setSaving] = useState(false);
    const [editId, setEditId] = useState(null); // If set, we are editing this patient_id

    const [sourceFilter, setSourceFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, pages: 1 });

    const doSearch = useCallback(async (q, p = 1, src = '', st = '') => {
        setLoading(true); setError(null);
        try {
            const res = await getPatients({
                search: q.trim() || undefined,
                page: p,
                source: src || undefined,
                status: st || undefined
            });
            setPatients(res.data.data || []);
            setPagination({
                total: res.data.total || 0,
                ...(res.data.pagination || { page: 1, limit: 20, pages: 1 })
            });
        } catch (e) {
            setPatients([]);
            const msg = e.response?.data?.message || e.response?.data?.error || e.message;
            if (e.response?.status !== 404) setError(msg);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => {
        const t = setTimeout(() => doSearch(search, page, sourceFilter, statusFilter), 450);
        return () => clearTimeout(t);
    }, [search, page, sourceFilter, statusFilter, doSearch]);

    const handleRegister = async (e) => {
        e.preventDefault();
        setSaving(true); setFormErr(null); setFormOk(null);
        try {
            if (editId) {
                const res = await updatePatient(editId, form);
                setFormOk(`✅ Patient verified and updated!`);
                // Update local status
                await doSearch(search);
                if (selected?.patient_id === editId) {
                    setSelected(res.data.data);
                }
            } else {
                const res = await registerPatient(form);
                setFormOk(`✅ Patient registered! ID: ${res.data.data.patient_id}`);
                setForm(EMPTY_FORM);
                setSearch(form.mobile);
            }
        } catch (e) {
            setFormErr(e.response?.data?.message || e.response?.data?.error || e.message);
        } finally { setSaving(false); }
    };

    const startEdit = (p) => {
        setEditId(p.patient_id);
        // Format DOB for input type="text" or handle date conversion
        let dobStr = p.dob ? new Date(p.dob).toISOString().split('T')[0] : '';
        setForm({
            child_name: p.child_name || '',
            parent_name: p.parent_name || '',
            mobile: p.parent_mobile || '',
            alt_mobile: p.alt_mobile || '',
            dob: dobStr,
            gender: p.gender || 'Male',
            email: p.email || '',
            address: p.address || '',
            symptoms_notes: p.symptoms_notes || '',
            registration_source: p.registration_source || 'dashboard'
        });
        setFormErr(null);
        setFormOk(null);
        setShowModal(true);
    };

    const dobDisplay = (d) => {
        if (!d) return '—';
        try {
            const date = new Date(d);
            if (isNaN(date)) return d;
            const years = Math.floor((Date.now() - date) / (365.25 * 24 * 3600 * 1000));
            return `${date.toLocaleDateString('en-IN')} (${years}y)`;
        } catch { return d; }
    };

    return (
        <div>
            <div className="title-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                    <div>
                        <h1>Registered Patients</h1>
                        <p>Search by name, mobile number or patient ID (e.g. DICC-2026-0001).</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button className="btn btn-primary" onClick={() => { setEditId(null); setForm(EMPTY_FORM); setShowModal(true); setFormErr(null); setFormOk(null); }}>
                            <UserPlus size={18} /> Register Patient
                        </button>
                        <button
                            className="btn btn-outline"
                            onClick={() => {
                                const link = window.location.origin + '/register-form';
                                navigator.clipboard.writeText(link);
                                setFormOk('Registration link copied to clipboard!');
                                setTimeout(() => setFormOk(null), 3000);
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Share2 size={18} /> Share Form
                        </button>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="search-box">
                        <Search className="search-icon" size={20} />
                        <input
                            type="text"
                            placeholder="Search by name, mobile or ID..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        />
                    </div>

                    <select
                        value={sourceFilter}
                        onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
                        style={{ padding: '0.6rem 1rem', borderRadius: '12px', border: '1px solid var(--border-color)', outline: 'none', background: '#fff', fontSize: '0.85rem' }}
                    >
                        <option value="">All Sources</option>
                        <option value="dashboard">Dashboard</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="form">Online Form</option>
                        <option value="api">External API</option>
                    </select>

                    <select
                        value={statusFilter}
                        onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                        style={{ padding: '0.6rem 1rem', borderRadius: '12px', border: '1px solid var(--border-color)', outline: 'none', background: '#fff', fontSize: '0.85rem' }}
                    >
                        <option value="">All Status</option>
                        <option value="COMPLETE">Complete</option>
                        <option value="PENDING">Pending</option>
                    </select>

                    <button className="btn btn-outline" onClick={() => doSearch(search, page, sourceFilter, statusFilter)} disabled={loading}>
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {
                error && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.5rem', color: '#dc2626', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <AlertCircle size={16} /> {error}
                    </div>
                )
            }

            {/* Results */}
            <div className="card">
                <div className="card-header">
                    <h3>Patient List {pagination.total > 0 && `(${pagination.total} result${pagination.total > 1 ? 's' : ''})`}</h3>
                </div>
                {!loading && patients.length === 0 ? (
                    <p style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                        {search.trim() || sourceFilter || statusFilter ? `No patient found matching the criteria.` : 'No patients registered yet.'}
                    </p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Patient ID</th>
                                <th>Child Name</th>
                                <th>Parent Name</th>
                                <th>MOBILE</th>
                                <th>DOB / AGE</th>
                                <th>SOURCE</th>
                                <th>STATUS</th>
                                <th>ACTION</th>
                            </tr>
                        </thead>
                        <tbody>
                            {patients.map((p) => p && (
                                <React.Fragment key={p.patient_id}>
                                    <tr style={{ background: selected?.patient_id === p.patient_id ? 'var(--primary-light)' : 'transparent', transition: 'var(--transition)' }}>
                                        <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.82rem', color: '#6366f1' }}>{p.patient_id}</td>
                                        <td style={{ fontWeight: 600, color: '#1e293b' }}>{p.child_name}</td>
                                        <td>{p.parent_name}</td>
                                        <td>{p.parent_mobile}</td>
                                        <td style={{ fontSize: '0.85rem' }}>{dobDisplay(p.dob)}</td>
                                        <td>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '6px', background: p.registration_source === 'WHATSAPP' ? '#dcfce7' : p.registration_source === 'FORM' ? '#fef9c3' : '#f1f5f9', color: p.registration_source === 'WHATSAPP' ? '#15803d' : p.registration_source === 'FORM' ? '#a16207' : '#64748b', border: '1px solid currentColor', opacity: 0.8 }}>
                                                {p.registration_source || 'DASHBOARD'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`badge ${p.registration_status === 'COMPLETE' ? 'badge-success' : 'badge-warning'}`}>
                                                {p.registration_status || 'COMPLETE'}
                                            </span>
                                        </td>
                                        <td>
                                            <button
                                                className="btn btn-outline"
                                                style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', height: 'auto' }}
                                                onClick={() => setSelected(selected?.patient_id === p.patient_id ? null : p)}
                                            >
                                                {selected?.patient_id === p.patient_id ? 'Hide Detail' : 'View Detail'}
                                            </button>
                                        </td>
                                    </tr>
                                    {selected?.patient_id === p.patient_id && (
                                        <tr>
                                            <td colSpan={8} style={{ padding: '0', borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(99, 102, 241, 0.02)' }}>
                                                <div className="animate-in" style={{ padding: '2rem 2.5rem' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <User size={18} />
                                                            </div>
                                                            <h4 style={{ margin: 0, color: '#1e293b', fontSize: '1rem', fontWeight: 800 }}>Comprehensive Patient Profile</h4>
                                                        </div>
                                                        <button className="btn btn-outline" style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', height: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff', borderRadius: '10px' }} onClick={() => startEdit(p)}>
                                                            <Edit2 size={14} /> Edit Patient Info
                                                        </button>
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
                                                        {[
                                                            { label: 'Child Name', val: p.child_name, icon: User },
                                                            { label: 'Parent Name', val: p.parent_name, icon: User },
                                                            { label: 'Primary Mobile', val: p.parent_mobile, icon: Phone },
                                                            { label: 'Alt Mobile', val: p.alt_mobile || 'None provided', icon: Phone },
                                                            { label: 'Gender', val: p.gender || 'Not specified', icon: User },
                                                            { label: 'Date of Birth', val: dobDisplay(p.dob), icon: CalendarIcon },
                                                            { label: 'Email', val: p.email || 'None provided', icon: Mail },
                                                            { label: 'Registered On', val: new Date(p.registered_at || p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }), icon: CalendarIcon },
                                                            { label: 'Reg. Source', val: (p.registration_source || 'dashboard').toUpperCase(), icon: Share2 },
                                                            { label: 'Home Address', val: p.address || 'No address recorded', icon: MapPin },
                                                        ].map(({ label, val, icon: Icon }) => (
                                                            <div key={label} style={{ background: '#fff', padding: '1rem 1.25rem', borderRadius: '14px', border: '1px solid var(--border-color)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                                    <Icon size={13} style={{ color: 'var(--text-muted)' }} />
                                                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                                                                </div>
                                                                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155' }}>{val}</div>
                                                            </div>
                                                        ))}

                                                        <div style={{ gridColumn: '1 / -1', background: 'linear-gradient(to right, #fff, #f8faff)', padding: '1rem 1.25rem', borderRadius: '14px', border: '1px solid var(--primary-light)', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                                            <div style={{ padding: '0.5rem', borderRadius: '10px', background: 'var(--primary-light)', color: 'var(--primary)' }}>
                                                                <FileText size={18} />
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '0.65rem', color: 'var(--primary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>Medical Symptoms / Internal Notes</div>
                                                                <div style={{ fontSize: '0.95rem', color: '#475569', fontWeight: 600, lineHeight: 1.5 }}>{p.symptoms_notes || 'No symptoms or special notes recorded for this patient.'}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                )}

                {pagination.pages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '2rem', padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
                        <button
                            className="btn btn-outline"
                            disabled={page === 1}
                            onClick={() => setPage(p => p - 1)}
                            style={{ padding: '0.5rem 1rem', height: 'auto' }}
                        >
                            Previous
                        </button>
                        <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>
                            Page {page} of {pagination.pages}
                        </span>
                        <button
                            className="btn btn-outline"
                            disabled={page === pagination.pages}
                            onClick={() => setPage(p => p + 1)}
                            style={{ padding: '0.5rem 1rem', height: 'auto' }}
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>

            {/* Register modal */}
            {
                showModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: '#fff', borderRadius: '16px', padding: '2rem', width: '560px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{editId ? 'Edit Patient Information' : 'Register New Patient'}</h2>
                                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                                    <X size={22} />
                                </button>
                            </div>

                            {formErr && (
                                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' }}>
                                    {formErr}
                                </div>
                            )}
                            {formOk && (
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', color: '#16a34a', fontSize: '0.875rem' }}>
                                    {formOk}
                                </div>
                            )}

                            <form onSubmit={handleRegister}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    {[
                                        { id: 'child_name', label: "Child's Full Name *", required: true },
                                        { id: 'gender', label: "Gender *", type: 'select', options: ['Male', 'Female', 'Other'] },
                                        { id: 'parent_name', label: "Parent's Full Name *", required: true },
                                        { id: 'mobile', label: 'Mobile Number *', required: true, placeholder: '10-digit mobile' },
                                        { id: 'alt_mobile', label: 'Alternate Mobile', placeholder: 'Numeric or SKIP' },
                                        { id: 'dob', label: 'Date of Birth *', required: true, placeholder: 'YYYY-MM-DD' },
                                        { id: 'email', label: 'Email ID *', required: true, placeholder: 'name@example.com' },
                                    ].map(({ id, label, required, placeholder, type, options }) => (
                                        <div key={id}>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: '#374151' }}>{label}</label>
                                            {type === 'select' ? (
                                                <select
                                                    value={form[id]}
                                                    onChange={e => setForm(f => ({ ...f, [id]: e.target.value }))}
                                                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '12px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box', transition: 'var(--transition)' }}
                                                >
                                                    {options.map(opt => typeof opt === 'string' ? (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ) : (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    id={`reg-${id}`}
                                                    type="text"
                                                    required={required}
                                                    placeholder={placeholder || ''}
                                                    value={form[id]}
                                                    onChange={e => setForm(f => ({ ...f, [id]: e.target.value }))}
                                                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '12px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box', transition: 'var(--transition)' }}
                                                />
                                            )}
                                        </div>
                                    ))}

                                    <div style={{ gridColumn: 'span 2' }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: '#374151' }}>Residential Address *</label>
                                        <input id="reg-address" type="text" required value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                                            placeholder="Full address include Area and City"
                                            style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '12px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: '#374151' }}>Symptoms / Reason for Visit</label>
                                        <textarea id="reg-symptoms" rows={3} value={form.symptoms_notes} onChange={e => setForm(f => ({ ...f, symptoms_notes: e.target.value }))}
                                            placeholder="Describe symptoms or type VACCINATION"
                                            style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '12px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' }} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                                    <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={saving}>
                                        {saving ? 'Saving…' : editId ? 'Update Information' : 'Register'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
        </div >
    );
};

export default Patients;
