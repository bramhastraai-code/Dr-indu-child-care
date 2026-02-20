import React, { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, AlertCircle, MessageSquare, Clock, ArrowRight } from 'lucide-react';
import { getUnregisteredInteractions } from '../api/index';

const BotInteractions = () => {
    const [interactions, setInteractions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await getUnregisteredInteractions();
            setInteractions(res.data.data || []);
        } catch (e) {
            setError(e.response?.data?.message || e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const getTimeAgo = (date) => {
        if (!date) return '—';
        const now = new Date();
        const past = new Date(date);
        const diffMs = now - past;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        return past.toLocaleDateString();
    };

    return (
        <div>
            <div className="title-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                        <h1>Bot Interactions (Leads)</h1>
                        <p>Track interactions from people who Haven't registered as patients yet.</p>
                    </div>
                    <button className="btn btn-outline" onClick={fetchData} disabled={loading}>
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        Refresh List
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.5rem', color: '#dc2626', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            <div className="card">
                <div className="card-header">
                    <h3>Recent Interactions {interactions.length > 0 && `(${interactions.length})`}</h3>
                </div>
                {!loading && interactions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                        <div style={{ background: '#f8fafc', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: '#94a3b8' }}>
                            <MessageSquare size={32} />
                        </div>
                        <h3 style={{ color: '#64748b', marginBottom: '0.5rem' }}>No anonymous interactions found</h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>When someone sends a message to the bot but hasn't registered, they will appear here.</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>WhatsApp ID / Number</th>
                                <th>Source</th>
                                <th>Current Bot State</th>
                                <th>Last Activity</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {interactions.map((it) => (
                                <tr key={it.session_id}>
                                    <td style={{ fontWeight: 600, color: '#1e293b' }}>{it.wa_number}</td>
                                    <td>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '6px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>
                                            {it.session_data?.source || 'WATI'}
                                        </span>
                                    </td>
                                    <td>
                                        <code style={{ fontSize: '0.8rem', background: '#f8fafc', padding: '0.2rem 0.4rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                            {it.current_state}
                                        </code>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748b', fontSize: '0.85rem' }}>
                                            <Clock size={14} />
                                            {getTimeAgo(it.last_activity_at)}
                                        </div>
                                    </td>
                                    <td>
                                        <button
                                            className="btn btn-outline"
                                            style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', height: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                            onClick={() => {
                                                // Pre-fill patient registration maybe?
                                                window.location.href = `/patients?prefill_mobile=${it.wa_number}`;
                                            }}
                                        >
                                            Register <ArrowRight size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <style>{`
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default BotInteractions;
