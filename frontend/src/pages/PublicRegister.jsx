import React, { useState } from 'react';
import { UserPlus, CheckCircle, AlertCircle, Calendar, User, Phone, Mail, MapPin, FileText, Share2, ClipboardCheck } from 'lucide-react';
import { registerPatient } from '../api/index';

const EMPTY_FORM = {
    child_name: '', parent_name: '', mobile: '',
    alt_mobile: '', dob: '', gender: 'Male', email: '', address: '', symptoms_notes: '',
    registration_source: 'form'
};

const PublicRegister = () => {
    const [form, setForm] = useState(EMPTY_FORM);
    const [status, setStatus] = useState('idle'); // idle, saving, success, error
    const [message, setMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('saving');
        try {
            await registerPatient(form);
            setStatus('success');
            setMessage('Registration successful! You may now close this page or contact the clinic for appointments.');
        } catch (err) {
            setStatus('error');
            setMessage(err.response?.data?.message || 'Something went wrong. Please try again.');
        }
    };

    if (status === 'success') {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '2rem' }}>
                <div style={{ maxWidth: '420px', width: '100%', background: '#fff', borderRadius: '24px', padding: '3rem 2rem', boxShadow: '0 20px 50px rgba(0,0,0,0.05)', textAlign: 'center' }}>
                    <div style={{ width: '64px', height: '64px', background: '#f0fdf4', color: '#22c55e', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                        <CheckCircle size={32} />
                    </div>
                    <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Thank You!</h1>
                    <p style={{ color: '#64748b', lineHeight: '1.6', marginBottom: '2rem' }}>{message}</p>
                    <button
                        className="btn btn-primary"
                        onClick={() => { setForm(EMPTY_FORM); setStatus('idle'); }}
                        style={{ width: '100%' }}
                    >
                        Register Another Child
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 1rem' }}>
            <div style={{ maxWidth: '600px', width: '100%' }}>
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🩺</div>
                    <h1 style={{ fontSize: '1.8rem', color: '#0f172a', marginBottom: '0.5rem' }}>Dr. Indu Child Care</h1>
                    <p style={{ color: '#64748b', fontSize: '1.1rem' }}>Online Patient Registration Form</p>
                </div>

                <div style={{ background: '#fff', borderRadius: '24px', padding: '2.5rem', boxShadow: '0 10px 30px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
                    {status === 'error' && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '1rem', marginBottom: '2rem', color: '#dc2626', display: 'flex', gap: '0.75rem' }}>
                            <AlertCircle size={20} />
                            <span>{message}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                            gap: '1.25rem'
                        }}>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>Child's Full Name *</label>
                                <input required type="text" value={form.child_name} onChange={e => setForm({ ...form, child_name: e.target.value })}
                                    placeholder="Enter full name" style={inputStyle} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>Gender *</label>
                                <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} style={inputStyle}>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>Date of Birth *</label>
                                <input required type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} style={inputStyle} />
                            </div>

                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>Parent's Full Name *</label>
                                <input required type="text" value={form.parent_name} onChange={e => setForm({ ...form, parent_name: e.target.value })}
                                    placeholder="Father or Mother name" style={inputStyle} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>Mobile Number *</label>
                                <input required type="tel" maxLength={10} value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '') })}
                                    placeholder="10-digit primary mobile" style={inputStyle} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>Alternate Mobile</label>
                                <input type="tel" maxLength={10} value={form.alt_mobile} onChange={e => setForm({ ...form, alt_mobile: e.target.value.replace(/\D/g, '') })}
                                    placeholder="Optional" style={inputStyle} />
                            </div>

                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>Email ID *</label>
                                <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                                    placeholder="name@example.com" style={inputStyle} />
                            </div>

                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>Residential Address *</label>
                                <input required type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                                    placeholder="Full address include Area and City" style={inputStyle} />
                            </div>

                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>Symptoms / Reason for Visit (Optional)</label>
                                <textarea rows={3} value={form.symptoms_notes} onChange={e => setForm({ ...form, symptoms_notes: e.target.value })}
                                    placeholder="Describe current symptoms or type VACCINATION" style={inputStyle} />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={status === 'saving'}
                            className="btn btn-primary"
                            style={{ width: '100%', marginTop: '2rem', height: '56px', fontSize: '1rem', borderRadius: '16px' }}
                        >
                            {status === 'saving' ? 'Submitting...' : 'Complete Registration'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

const inputStyle = {
    width: '100%',
    padding: '0.85rem 1rem',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    outline: 'none',
    fontSize: '0.95rem',
    transition: 'all 0.2s ease',
    background: '#fff',
    fontFamily: 'inherit'
};

export default PublicRegister;
