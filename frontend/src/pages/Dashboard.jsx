import React, { useState, useEffect } from 'react';
import { Users, Calendar, Clock, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { getSystemHealth, getAppointmentsByDate, getAppointmentStats, getPatients } from '../api/index';

const StatCard = ({ title, value, icon: Icon, color, loading }) => (
    <div className="stat-card">
        <div className="stat-icon" style={{ backgroundColor: `${color}15`, color }}>
            <Icon size={24} />
        </div>
        <div className="stat-value">
            {loading ? <span style={{ fontSize: '1rem', color: '#94a3b8' }}>…</span> : value}
        </div>
        <div className="stat-label">{title}</div>
    </div>
);

const statusClass = (s) => {
    if (!s) return 'badge-primary';
    s = s.toUpperCase();
    if (s === 'CONFIRMED') return 'badge-primary';
    if (s === 'BOOKED') return 'badge-primary';
    if (s === 'COMPLETED') return 'badge-success';
    if (s === 'CANCELLED') return 'badge-danger';
    if (s === 'NO_SHOW') return 'badge-warning';
    return 'badge-primary';
};

const Dashboard = () => {
    const today = new Date().toISOString().split('T')[0];
    const [stats, setStats] = useState({ total: '—', today: '—', pending: '—', completed: '—' });
    const [appointments, setAppointments] = useState([]);
    const [dbStatus, setDbStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastRefresh, setLastRefresh] = useState(null);

    const load = async () => {
        setLoading(true); setError(null);
        try {
            const [hRes, apptRes, statsRes, patientRes] = await Promise.all([
                getSystemHealth(),
                getAppointmentsByDate(today),
                getAppointmentStats(today),
                getPatients({ limit: 1 })
            ]);

            setDbStatus(hRes.data.database);

            const todayAppts = apptRes.data?.data || [];
            const s = statsRes.data?.data || {};   // { total_today, confirmed, completed, ... }
            const totalPatients = patientRes.data?.total ?? patientRes.data?.data?.length ?? '—';

            setStats({
                total: totalPatients,
                today: s.total_today ?? todayAppts.length,
                pending: s.confirmed ?? todayAppts.filter(a => a.status === 'CONFIRMED').length,
                completed: s.completed ?? todayAppts.filter(a => a.status === 'COMPLETED').length,
            });

            setAppointments(todayAppts.slice(0, 10));
            setLastRefresh(new Date());
        } catch (e) {
            setError(e.response?.data?.message || e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const user = JSON.parse(localStorage.getItem('user') || '{}');

    return (
        <div>
            <div className="title-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>Overview</h1>
                    <p>Welcome back, {user.full_name || user.username || 'Admin'}! Here's what's happening today ({today}).</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {dbStatus && (
                        <span style={{
                            fontSize: '0.75rem', padding: '0.25rem 0.75rem',
                            borderRadius: '999px', fontWeight: 600,
                            background: dbStatus === 'connected' ? '#dcfce7' : '#fee2e2',
                            color: dbStatus === 'connected' ? '#16a34a' : '#dc2626'
                        }}>
                            DB: {dbStatus}
                        </span>
                    )}
                    <button className="btn btn-outline" onClick={load} style={{ gap: '0.4rem', display: 'flex', alignItems: 'center' }}>
                        <RefreshCw size={14} className={loading ? 'spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.5rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            <div className="stats-grid">
                <StatCard title="Total Patients" value={stats.total} icon={Users} color="#6366f1" loading={loading} />
                <StatCard title="Today's Visits" value={stats.today} icon={Calendar} color="#0ea5e9" loading={loading} />
                <StatCard title="Pending Appointments" value={stats.pending} icon={Clock} color="#f59e0b" loading={loading} />
                <StatCard title="Completed Today" value={stats.completed} icon={CheckCircle} color="#10b981" loading={loading} />
            </div>

            <div className="card">
                <div className="card-header">
                    <h3>Today's Appointments</h3>
                    {lastRefresh && (
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            Last updated {lastRefresh.toLocaleTimeString()}
                        </span>
                    )}
                </div>
                {loading ? (
                    <p style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Loading appointments…</p>
                ) : appointments.length === 0 ? (
                    <p style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>No appointments booked today yet.</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Appt ID</th>
                                <th>Patient</th>
                                <th>Slot</th>
                                <th>Doctor Type</th>
                                <th>Source</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {appointments.map((apt) => (
                                <tr key={apt.appointment_id}>
                                    <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem' }}>{apt.appointment_id}</td>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{apt.child_name || '—'}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>{apt.patient_id}</div>
                                    </td>
                                    <td style={{ fontWeight: 600, color: '#6366f1' }}>{apt.slot_label || apt.appointment_time || apt.slot_id}</td>
                                    <td style={{ fontSize: '0.85rem' }}>{apt.doctor_type}</td>
                                    <td style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'capitalize' }}>{apt.booking_source || '—'}</td>
                                    <td>
                                        <span className={`badge ${statusClass(apt.status)}`}>{apt.status}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default Dashboard;
