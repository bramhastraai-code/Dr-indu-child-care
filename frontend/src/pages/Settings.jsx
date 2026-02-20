import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, RefreshCw, AlertCircle, Clock } from 'lucide-react';
import { getSlotConfig, updateSlotConfig } from '../api/index';

const Settings = () => {
    const [slots, setSlots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const loadConfig = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await getSlotConfig();
            setSlots(res.data?.data || []);
        } catch (e) {
            setError(e.response?.data?.message || e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadConfig();
    }, []);

    const handleUpdateActive = (slot_id, is_active) => {
        setSlots(prev => prev.map(s => s.slot_id === slot_id ? { ...s, is_active } : s));
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            await updateSlotConfig(slots);
            setSuccess('Clinic slot configuration updated successfully.');
        } catch (e) {
            setError(e.response?.data?.message || e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <div className="title-section">
                <h1>Settings</h1>
                <p>Manage clinic-wide configurations and slot timings.</p>
            </div>

            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Clock size={20} color="#6366f1" />
                        Slot Master Configuration
                    </h3>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button className="btn btn-outline" onClick={loadConfig} disabled={loading}>
                            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
                        </button>
                        <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading}>
                            <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>

                {error && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.5rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <AlertCircle size={16} /> {error}
                    </div>
                )}

                {success && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.5rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Save size={16} /> {success}
                    </div>
                )}

                {loading ? (
                    <p style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>Loading configuration...</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Slot ID</th>
                                <th>Label</th>
                                <th>Session</th>
                                <th>Timings</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {slots.map((s) => (
                                <tr key={s.slot_id}>
                                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{s.slot_id}</td>
                                    <td style={{ fontWeight: 500 }}>{s.slot_label || s.display_label}</td>
                                    <td>
                                        <span className={`badge ${s.session === 'MORNING' ? 'badge-primary' : 'badge-warning'}`}>
                                            {s.session}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: '0.85rem' }}>{s.start_time} – {s.end_time}</td>
                                    <td>
                                        <span className={`badge ${s.is_active ? 'badge-success' : 'badge-gray'}`} style={!s.is_active ? { background: '#f1f5f9', color: '#94a3b8' } : {}}>
                                            {s.is_active ? 'ACTIVE' : 'INACTIVE'}
                                        </span>
                                    </td>
                                    <td>
                                        <button
                                            className="btn btn-outline"
                                            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', height: 'auto' }}
                                            onClick={() => handleUpdateActive(s.slot_id, !s.is_active)}
                                        >
                                            {s.is_active ? 'Deactivate' : 'Activate'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="card">
                <div className="card-header">
                    <h3>Clinic Information</h3>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', padding: '0.5rem 0' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Clinic Name</label>
                        <div style={{ fontWeight: 600 }}>Dr. Indu Child Care</div>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Location</label>
                        <div style={{ fontWeight: 600 }}>Pune, Maharashtra</div>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Timezone</label>
                        <div style={{ fontWeight: 600 }}>Asia/Kolkata (IST)</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
