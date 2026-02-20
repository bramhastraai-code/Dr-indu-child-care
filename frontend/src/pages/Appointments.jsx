import React, { useState, useEffect, useRef } from 'react';
import { Plus, RefreshCw, AlertCircle, X, Calendar, Search, CheckCircle, Users } from 'lucide-react';
import {
    getAppointmentsByDate, getAvailableSlots, getSlotConfig,
    bookAppointment, cancelAppointment, registerPatient, searchPatients, getPatients
} from '../api/index';

const today = () => new Date().toISOString().split('T')[0];

const EMPTY_BOOK = {
    patient_id: '',
    doctor_type: 'PULMONARY',
    visit_type: 'CONSULTATION',
    appointment_mode: 'OFFLINE',
    appointment_date: today(),
    slot_id: ''
};

const statusClass = (s) => {
    switch (s) {
        case 'CONFIRMED': return 'badge-success';
        case 'PENDING': return 'badge-warning';
        case 'CANCELLED': return 'badge-danger';
        case 'COMPLETED': return 'badge-primary';
        default: return 'badge-gray';
    }
};

const Appointments = () => {
    const [appointments, setAppts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [date, setDate] = useState(today());

    // Booking State
    const [showBooking, setShowBooking] = useState(false);
    const [form, setForm] = useState(EMPTY_BOOK);
    const [slots, setSlots] = useState([]);
    const [slotsLoading, setSlotsLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formErr, setFormErr] = useState(null);
    const [formOk, setFormOk] = useState(null);

    // Patient Lookup State
    const [patientQuery, setPatientQuery] = useState('');
    const [patientList, setPatientList] = useState([]);
    const [patientLoading, setPatientLoading] = useState(false);
    const [patientFound, setPatientFound] = useState(null); // Full patient obj
    const [patientErr, setPatientErr] = useState(null);
    const [recentPatients, setRecentPatients] = useState([]);
    const patientInputRef = useRef(null);

    // Register State
    const [showRegister, setShowRegister] = useState(false);
    const [regForm, setRegForm] = useState({
        child_name: '', parent_name: '', parent_mobile: '', alt_mobile: '',
        dob: '', email: '', gender: 'Male',
        address: '', symptoms_notes: '', registration_source: 'dashboard'
    });
    const [regLoading, setRegLoading] = useState(false);

    // Cancel State
    const [cancelId, setCancelId] = useState(null);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelling, setCancelling] = useState(false);

    const lookupPatient = async (q) => {
        const query = q.trim();
        if (!query) return;
        setPatientLoading(true); setPatientErr(null); setPatientFound(null); setPatientList([]); setShowRegister(false);
        try {
            const res = await searchPatients(query);
            const list = res.data.data;
            if (list.length === 0) {
                setPatientErr('No patients found.');
            } else {
                setPatientList(list);
            }
        } catch (e) {
            setPatientErr(e.response?.data?.message || e.message);
        } finally { setPatientLoading(false); }
    };

    const selectPatient = (p) => {
        setPatientFound(p);
        setPatientList([]);
        setForm(f => ({ ...f, patient_id: p.patient_id }));
    };

    useEffect(() => {
        getPatients().then(res => setRecentPatients(res.data.data || [])).catch(() => { });
    }, []);

    useEffect(() => {
        if (patientFound) return;
        const timer = setTimeout(() => {
            if (patientQuery.trim()) {
                lookupPatient(patientQuery);
            } else {
                setPatientList(recentPatients);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [patientQuery, recentPatients, patientFound]);

    const handleQuickRegister = async (e) => {
        e.preventDefault();
        setRegLoading(true); setPatientErr(null);
        try {
            const res = await registerPatient({ ...regForm, mobile: regForm.parent_mobile });
            const newPatient = res.data.data;
            setPatientFound(newPatient);
            setForm(f => ({ ...f, patient_id: newPatient.patient_id }));
            setShowRegister(false); // Back to booking
            setFormOk('✅ Patient registered! Continue booking.');
        } catch (e) {
            setPatientErr(e.response?.data?.message || e.message);
        } finally { setRegLoading(false); }
    };

    const clearPatient = () => {
        setPatientFound(null); setPatientErr(null);
        setPatientQuery(''); setShowRegister(false);
        setForm(f => ({ ...f, patient_id: '' }));
        setTimeout(() => patientInputRef.current?.focus(), 50);
    };

    const loadAppointments = async (d) => {
        setLoading(true); setError(null);
        try {
            const res = await getAppointmentsByDate(d);
            setAppts(res.data?.data || []);
        } catch (e) {
            if (e.response?.status === 404) setAppts([]);
            else setError(e.response?.data?.message || e.message);
        } finally { setLoading(false); }
    };

    useEffect(() => { loadAppointments(date); }, [date]);

    // Load slots only when ALL prerequisite fields are selected
    const canLoadSlots = form.appointment_date && form.doctor_type && form.visit_type && form.appointment_mode;

    const loadSlots = async (doctor_type, appt_date) => {
        if (!doctor_type || !appt_date) return;
        setSlotsLoading(true);
        setSlots([]);
        setForm(f => ({ ...f, slot_id: '' })); // reset stale selection
        try {
            const res = await getAvailableSlots(doctor_type, appt_date);
            setSlots(res.data?.data || []);
        } catch (e) {
            console.error('Error loading slots:', e);
            setSlots([]);
        } finally { setSlotsLoading(false); }
    };

    useEffect(() => {
        if (showBooking && canLoadSlots) {
            loadSlots(form.doctor_type, form.appointment_date);
        } else {
            setSlots([]);
            setForm(f => ({ ...f, slot_id: '' }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.doctor_type, form.appointment_date, form.visit_type, form.appointment_mode, showBooking]);

    const handleBook = async (e) => {
        e.preventDefault();
        setFormErr(null); setFormOk(null);

        // Client-side validation
        const patient_id = patientFound?.patient_id || form.patient_id;
        if (!patient_id) { setFormErr('Please search and select a patient first.'); return; }
        if (!form.slot_id) { setFormErr('Please select an available slot.'); return; }
        if (!form.appointment_date) { setFormErr('Please select an appointment date.'); return; }

        // All channels use POST /api/appointments — booking_source tells backend which channel
        const payload = {
            patient_id,
            appointment_mode: form.appointment_mode || 'OFFLINE',
            doctor_type: form.doctor_type || 'PULMONARY',
            visit_type: form.visit_type || 'CONSULTATION',
            appointment_date: form.appointment_date,
            slot_id: form.slot_id,
            booking_source: 'dashboard'
        };

        setSaving(true);
        try {
            const res = await bookAppointment(payload);
            const appt = res.data.data;
            setFormOk(`✅ Booked! ID: ${appt.appointment_id}`);
            setForm({ ...EMPTY_BOOK, appointment_date: date });
            setPatientFound(null);
            setPatientQuery('');
            loadAppointments(date);
            // Notify other parts of the app (e.g. Scheduling) that appointments changed
            try { window.dispatchEvent(new CustomEvent('appointments:changed', { detail: { type: 'booked', appointment: appt } })); } catch (e) { /* ignore */ }
        } catch (e) {
            setFormErr(e.response?.data?.message || e.response?.data?.error || e.message);
        } finally { setSaving(false); }
    };

    const handleCancel = async () => {
        if (!cancelId) return;
        setCancelling(true);
        try {
            await cancelAppointment(cancelId, {
                cancellation_reason: cancelReason || 'Cancelled by secretary',
                cancelled_by: 'dashboard'
            });
            setCancelId(null); setCancelReason('');
            loadAppointments(date);
            try { window.dispatchEvent(new CustomEvent('appointments:changed', { detail: { type: 'cancelled', appointment_id: cancelId } })); } catch (e) { /* ignore */ }
        } catch (e) {
            setError(e.response?.data?.message || e.message);
        } finally { setCancelling(false); }
    };

    const toggleBooking = () => {
        if (!showBooking) {
            setForm({ ...EMPTY_BOOK, appointment_date: date });
            setPatientQuery(''); setPatientFound(null); setPatientErr(null);
            setFormErr(null); setFormOk(null);
        }
        setShowBooking(!showBooking);
    };

    return (
        <div>
            <div className="title-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1>Appointments</h1>
                        <p>Manage clinic schedule and upcoming visits. can be booked through whatsapp, form, admin and also book.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <button className="btn btn-outline" onClick={() => loadAppointments(date)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <RefreshCw size={14} /> Refresh
                        </button>
                        <button className={`btn ${showBooking ? 'btn-outline' : 'btn-primary'}`} onClick={toggleBooking} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {showBooking ? <X size={18} /> : <Plus size={18} />}
                            {showBooking ? 'Close Form' : 'New Appointment'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Inline Booking Form Card */}
            {showBooking && (
                <div className="card" style={{ marginBottom: '1.5rem', border: '1px solid var(--primary-light)', overflow: 'hidden' }}>
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--primary-light)', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', margin: 0 }}>
                        <h3 style={{ color: '#4338ca', margin: 0, fontSize: '1.1rem' }}>{showRegister ? 'Register New Patient' : 'Book New Appointment'}</h3>
                        <button onClick={() => setShowBooking(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.9rem', fontWeight: 600 }}>
                            <X size={18} /> Close
                        </button>
                    </div>
                    <div style={{ padding: '1.5rem' }}>
                        {showRegister ? (
                            <form onSubmit={handleQuickRegister}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    {/* Register Fields */}
                                    <div style={{ gridColumn: 'span 2' }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Child's Full Name *</label>
                                        <input required value={regForm.child_name} onChange={e => setRegForm(f => ({ ...f, child_name: e.target.value }))}
                                            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                                    </div>
                                    <div style={{ gridColumn: 'span 2' }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Gender *</label>
                                        <select value={regForm.gender} onChange={e => setRegForm(f => ({ ...f, gender: e.target.value }))}
                                            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box' }}>
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                    <div style={{ gridColumn: 'span 2' }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Parent's Full Name *</label>
                                        <input required value={regForm.parent_name} onChange={e => setRegForm(f => ({ ...f, parent_name: e.target.value }))}
                                            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Mobile Number *</label>
                                        <input required type="tel" maxLength={10} pattern="[0-9]{10}" placeholder="10-digit mobile"
                                            value={regForm.parent_mobile} onChange={e => setRegForm(f => ({ ...f, parent_mobile: e.target.value.replace(/\D/g, '') }))}
                                            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Alternate Mobile</label>
                                        <input type="tel" maxLength={10} placeholder="Numeric or SKIP"
                                            value={regForm.alt_mobile} onChange={e => setRegForm(f => ({ ...f, alt_mobile: e.target.value.replace(/\D/g, '') }))}
                                            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Date of Birth *</label>
                                        <input required type="date" value={regForm.dob} onChange={e => setRegForm(f => ({ ...f, dob: e.target.value }))} onClick={(e) => e.target.showPicker && e.target.showPicker()}
                                            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Email ID *</label>
                                        <input required type="email" placeholder="name@example.com" value={regForm.email} onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))}
                                            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                                    </div>
                                    <div style={{ gridColumn: 'span 2' }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Residential Address *</label>
                                        <input required value={regForm.address} onChange={e => setRegForm(f => ({ ...f, address: e.target.value }))}
                                            placeholder="Full address include Area and City"
                                            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                                    </div>
                                    <div style={{ gridColumn: 'span 2' }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Symptoms / Reason for Visit</label>
                                        <textarea rows={2} value={regForm.symptoms_notes} onChange={e => setRegForm(f => ({ ...f, symptoms_notes: e.target.value }))}
                                            placeholder="Describe symptoms or type VACCINATION"
                                            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box', resize: 'vertical' }} />
                                    </div>
                                </div>
                                {patientErr && <div style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: '1rem' }}>{patientErr}</div>}
                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                                    <button type="button" className="btn btn-outline" onClick={() => setShowRegister(false)}>Back to Booking</button>
                                    <button type="submit" className="btn btn-primary" disabled={regLoading}>{regLoading ? 'Registering…' : 'Register & Select'}</button>
                                </div>
                            </form>
                        ) : (
                            <>
                                {formErr && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' }}>{formErr}</div>}
                                {formOk && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', color: '#16a34a', fontSize: '0.875rem' }}>{formOk}</div>}

                                <form onSubmit={handleBook}>
                                    <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
                                        {/* Patient Lookup - Full Width */}
                                        <div style={{ gridColumn: 'span 2' }}>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                                                Patient * <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: '0.4rem' }}>— search by mobile number</span>
                                            </label>
                                            {!patientFound && (
                                                <div style={{ position: 'relative' }}>
                                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                                        <div className="search-box">
                                                            <Search className="search-icon" size={20} />
                                                            <input
                                                                ref={patientInputRef}
                                                                type="text"
                                                                placeholder="Enter mobile number, name, or ID…"
                                                                value={patientQuery}
                                                                onChange={e => setPatientQuery(e.target.value)}
                                                                onFocus={() => !patientQuery && setPatientList(recentPatients)}
                                                                onBlur={() => setTimeout(() => setPatientList([]), 200)}
                                                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), lookupPatient(patientQuery))}
                                                                style={{ border: patientErr ? '1px solid #fca5a5 !important' : '' }}
                                                            />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="btn btn-primary"
                                                            onClick={() => lookupPatient(patientQuery)}
                                                            disabled={patientLoading || !patientQuery.trim()}
                                                            style={{ padding: '0 1.5rem', height: '48px', borderRadius: '14px', whiteSpace: 'nowrap' }}
                                                        >
                                                            {patientLoading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                                                            <span style={{ marginLeft: '0.5rem' }}>Find</span>
                                                        </button>
                                                    </div>
                                                    {patientList.length > 0 && (
                                                        <div style={{ position: 'absolute', top: '105%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto', zIndex: 10 }}>
                                                            {patientList.map(p => (
                                                                <div key={p.patient_id} onMouseDown={() => selectPatient(p)}
                                                                    style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                                    <div>
                                                                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.child_name} <span style={{ fontWeight: 400, color: '#64748b' }}>(Par: {p.parent_name})</span></div>
                                                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{p.parent_mobile}</div>
                                                                    </div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#4f46e5', fontWeight: 600, background: '#e0e7ff', padding: '2px 6px', borderRadius: '4px' }}>{p.patient_id}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {patientErr && (
                                                <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#dc2626' }}>
                                                    <span>⚠ {patientErr}</span>
                                                    {patientErr.includes('not found') && (
                                                        <button type="button" onClick={() => { setRegForm(f => ({ ...f, parent_mobile: patientQuery })); setShowRegister(true); setPatientErr(null); }}
                                                            style={{ border: 'none', background: 'none', color: '#4f46e5', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>Register now?</button>
                                                    )}
                                                </div>
                                            )}
                                            {patientFound && (
                                                <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem', background: '#f8fafc', border: '1px solid var(--primary-light)' }}>
                                                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Users size={24} />
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Patient Found</div>
                                                        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>{patientFound.child_name}</div>
                                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{patientFound.patient_id} • {patientFound.parent_mobile}</div>
                                                    </div>
                                                    <button className="btn btn-outline" style={{ padding: '0.4rem 0.8rem', height: 'auto', fontSize: '0.75rem' }} onClick={() => { setPatientFound(null); setForm(f => ({ ...f, patient_id: '' })); }}>
                                                        Change
                                                    </button>
                                                </div>
                                            )}
                                            <input type="hidden" value={form.patient_id} />
                                        </div>

                                        {/* Date */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Appointment Date *</label>
                                            <input type="date" required value={form.appointment_date} onChange={e => setForm(f => ({ ...f, appointment_date: e.target.value }))}
                                                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '12px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box', transition: 'var(--transition)' }} />
                                        </div>

                                        {/* Doctor Type */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Doctor Type *</label>
                                            <select required value={form.doctor_type} onChange={e => setForm(f => ({ ...f, doctor_type: e.target.value }))}
                                                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '12px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box', transition: 'var(--transition)' }}>
                                                <option value="PULMONARY">Pulmonary</option>
                                                <option value="NON_PULMONARY">Non-Pulmonary</option>
                                                <option value="VACCINATION">Vaccination</option>
                                            </select>
                                        </div>

                                        {/* Visit Type */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Visit Type *</label>
                                            <select required value={form.visit_type} onChange={e => setForm(f => ({ ...f, visit_type: e.target.value }))}
                                                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '12px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box', transition: 'var(--transition)' }}>
                                                <option value="CONSULTATION">Consultation</option>
                                                <option value="VACCINATION">Vaccination</option>
                                                <option value="PULMONARY">Pulmonary Assessment</option>
                                                <option value="FOLLOWUP">Follow-up</option>
                                            </select>
                                        </div>

                                        {/* Mode */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Mode *</label>
                                            <select required value={form.appointment_mode} onChange={e => setForm(f => ({ ...f, appointment_mode: e.target.value }))}
                                                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '12px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box', transition: 'var(--transition)' }}>
                                                <option value="OFFLINE">Offline (In-Clinic)</option>
                                                <option value="ONLINE">Online (Video)</option>
                                            </select>
                                        </div>

                                        {/* Slot - Full Width */}
                                        <div style={{ gridColumn: 'span 2' }}>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                                                Available Slot *
                                                {slotsLoading && <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: '0.5rem' }}>(checking availability…)</span>}
                                                {!slotsLoading && canLoadSlots && slots.length > 0 && (
                                                    <span style={{ color: '#16a34a', fontWeight: 500, marginLeft: '0.5rem' }}>({slots.length} available)</span>
                                                )}
                                            </label>
                                            {!canLoadSlots ? (
                                                <div style={{ padding: '0.75rem 1rem', borderRadius: '12px', border: '1px dashed #e2e8f0', background: '#f8fafc', color: '#94a3b8', fontSize: '0.875rem' }}>
                                                    ⬆ Please select Appointment Date, Doctor Type, Visit Type and Mode first
                                                </div>
                                            ) : (
                                                <select
                                                    required
                                                    value={form.slot_id}
                                                    onChange={e => setForm(f => ({ ...f, slot_id: e.target.value }))}
                                                    disabled={slotsLoading || slots.length === 0}
                                                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '12px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box', transition: 'var(--transition)' }}
                                                >
                                                    {slotsLoading ? (
                                                        <option value="">Checking available slots…</option>
                                                    ) : slots.length === 0 ? (
                                                        <option value="" disabled>— No slots available for this date / doctor type —</option>
                                                    ) : (
                                                        <>
                                                            <option value="">— Select a slot —</option>
                                                            {slots.map(s => (
                                                                <option key={s.slot_id} value={s.slot_id}>
                                                                    {s.label} ({s.session})
                                                                </option>
                                                            ))}
                                                        </>
                                                    )}
                                                </select>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                                        <button type="button" className="btn btn-outline" onClick={() => setShowBooking(false)}>Cancel</button>
                                        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Booking…' : 'Confirm Booking'}</button>
                                    </div>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Date picker */}
            <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Calendar size={18} color="#4f46e5" />
                <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Viewing date:</label>
                <input id="appt-date-picker" type="date" value={date} onChange={e => setDate(e.target.value)}
                    style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.9rem' }} />
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{appointments.length} appointment{appointments.length !== 1 ? 's' : ''} found</span>
            </div>

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.5rem', color: '#dc2626', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            <div className="card">
                <div className="card-header"><h3>Schedule for {date}</h3></div>
                {loading ? (
                    <p style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>Loading…</p>
                ) : appointments.length === 0 ? (
                    <p style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>No appointments found for this date. Book one using the button above.</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Appt ID</th>
                                <th>Patient Name</th>
                                <th>Slot</th>
                                <th>Mode</th>
                                <th>Doctor Type</th>
                                <th>Visit Type</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {appointments.map((a) => (
                                <tr key={a.appointment_id}>
                                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600 }}>{a.appointment_id}</td>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{a.child_name || '—'}</div>
                                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>{a.patient_id}</div>
                                    </td>
                                    <td style={{ fontWeight: 600, color: '#4338ca' }}>{a.slot_label || a.slot_id}</td>
                                    <td><span className={`badge ${a.appointment_mode === 'ONLINE' ? 'badge-primary' : 'badge-warning'}`}>{a.appointment_mode}</span></td>
                                    <td style={{ fontSize: '0.8rem' }}>{a.doctor_type}</td>
                                    <td style={{ fontSize: '0.8rem' }}>{a.visit_type}</td>
                                    <td><span className={`badge ${statusClass(a.status)}`}>{a.status}</span></td>
                                    <td>
                                        {a.status === 'CONFIRMED' && (
                                            <button onClick={() => { setCancelId(a.appointment_id); setCancelReason(''); }}
                                                style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Cancel confirmation modal (Still a modal, which is fine) */}
            {cancelId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: '16px', padding: '2rem', width: '420px', maxWidth: '95vw', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ marginTop: 0 }}>Cancel Appointment</h3>
                        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Cancelling <strong>{cancelId}</strong>. This will free the slot immediately.</p>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Reason (optional)</label>
                        <input id="cancel-reason" type="text" value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="e.g. Patient requested rescheduling"
                            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.875rem', boxSizing: 'border-box', marginBottom: '1.5rem' }} />
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-outline" onClick={() => setCancelId(null)}>Back</button>
                            <button className="btn btn-primary" style={{ background: '#ef4444', borderColor: '#ef4444' }} onClick={handleCancel} disabled={cancelling}>{cancelling ? 'Cancelling…' : 'Confirm Cancel'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Appointments;
