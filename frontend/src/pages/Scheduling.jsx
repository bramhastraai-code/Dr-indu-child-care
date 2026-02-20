import React, { useState, useEffect, useCallback } from 'react';
import {
    Clock, Plus, Trash2, Edit2, Check, X,
    RefreshCw, AlertCircle, Lock, Unlock, Calendar as CalIcon, Grid
} from 'lucide-react';
import {
    getSlotConfig, createSlot, deleteSlot, updateSlotConfig,
    getDailyStatus, blockSlots, unblockSlots
} from '../api/index';

// ── constants ─────────────────────────────────────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SESSION_OPTIONS = ['MORNING', 'AFTERNOON', 'EVENING'];
const SESSION_COLOR = { MORNING: '#f59e0b', AFTERNOON: '#0ea5e9', EVENING: '#8b5cf6' };
const SESSION_BG = { MORNING: '#fffbeb', AFTERNOON: '#f0f9ff', EVENING: '#f5f3ff' };

const fmt12 = (t = '') => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
};

const todayStr = () => new Date().toISOString().split('T')[0];

const EMPTY_FORM = { slot_label: '', start_time: '', end_time: '', session: 'MORNING', sort_order: '' };

const inputStyle = {
    width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px',
    border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.85rem', boxSizing: 'border-box'
};
const labelStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem', color: '#475569' };

// ── Component ─────────────────────────────────────────────────────────────────
const Scheduling = () => {
    const [tab, setTab] = useState('master');
    const [slots, setSlots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);
    const [ok, setOk] = useState(null);

    // Add form
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    // Inline edit (master)
    const [editId, setEditId] = useState(null);
    const [editForm, setEditForm] = useState({});

    // Weekly template
    // weekDays: { [slot_id]: { [doctor_type]: Set<dayNumber> } }
    const [weekDocType, setWeekDocType] = useState('PULMONARY');
    const [weekDays, setWeekDays] = useState({});
    const [weekSaving, setWeekSaving] = useState(false);
    const [weekDirty, setWeekDirty] = useState(false);

    const DOCTOR_TYPES = [
        { value: 'PULMONARY', label: 'Pulmonary', color: '#6366f1', bg: '#eef2ff' },
        { value: 'NON_PULMONARY', label: 'Non-Pulmonary', color: '#0ea5e9', bg: '#f0f9ff' },
        { value: 'VACCINATION', label: 'Vaccination', color: '#10b981', bg: '#ecfdf5' },
    ];

    // Daily view — week grid
    const [docType, setDocType] = useState('PULMONARY');
    const [weekStart, setWeekStart] = useState(() => {
        // Start of current week (Sunday)
        const d = new Date();
        d.setDate(d.getDate() - d.getDay());
        return d.toISOString().split('T')[0];
    });
    // weekGrid: { [slot_id]: { [dateStr]: { is_booked, blocked_by_admin } } }
    const [weekGrid, setWeekGrid] = useState({});
    const [dailyLoading, setDailyLoading] = useState(false);
    // blocking: { [slot_id_date]: true }
    const [blocking, setBlocking] = useState({});

    // Compute the 7 date strings for the displayed week (defensive: handle invalid weekStart)
    const weekDates = (() => {
        try {
            const base = new Date(weekStart);
            if (Number.isNaN(base.getTime())) {
                // fallback to current week starting today
                const today = new Date();
                const start = new Date(today);
                start.setDate(today.getDate() - today.getDay());
                return Array.from({ length: 7 }, (_, i) => {
                    const d = new Date(start);
                    d.setDate(start.getDate() + i);
                    return d.toISOString().split('T')[0];
                });
            }
            return Array.from({ length: 7 }, (_, i) => {
                const d = new Date(base);
                d.setDate(base.getDate() + i);
                return d.toISOString().split('T')[0];
            });
        } catch (err) {
            const t = new Date();
            const s = new Date(t);
            s.setDate(t.getDate() - t.getDay());
            return Array.from({ length: 7 }, (_, i) => {
                const d = new Date(s);
                d.setDate(s.getDate() + i);
                return d.toISOString().split('T')[0];
            });
        }
    })();

    const shiftWeek = (dir) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + dir * 7);
        setWeekStart(d.toISOString().split('T')[0]);
    };

    // ── loaders ──────────────────────────────────────────────────────────────
    const flash = (msg, isErr = false) => {
        if (isErr) { setErr(msg); setOk(null); }
        else { setOk(msg); setErr(null); }
        setTimeout(() => { setOk(null); setErr(null); }, 4000);
    };

    const loadMaster = useCallback(async () => {
        setLoading(true); setErr(null);
        try {
            const res = await getSlotConfig();
            const data = res.data?.data || [];
            setSlots(data);
            // Initialise weekDays per doctor_type from each slot's days_by_doctor + days_of_week fallback
            const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
            const wd = {};
            data.forEach(s => {
                wd[s.slot_id] = {};
                ['PULMONARY', 'NON_PULMONARY', 'VACCINATION'].forEach(dt => {
                    const perDoc = s.days_by_doctor?.[dt];
                    const base = (perDoc && perDoc.length > 0) ? perDoc : (s.days_of_week ?? ALL_DAYS);
                    wd[s.slot_id][dt] = new Set(base);
                });
            });
            setWeekDays(wd);
            setWeekDirty(false);
        } catch (e) { setErr(e.response?.data?.message || e.message); }
        finally { setLoading(false); }
    }, []);


    useEffect(() => { loadMaster(); }, [loadMaster]);

    const loadWeekGrid = useCallback(async () => {
        if (!slots.length) return;
        setDailyLoading(true);
        try {
            // Fetch all 7 days in parallel
            const results = await Promise.all(
                weekDates.map(d => getDailyStatus(docType, d).catch(() => ({ data: { data: [] } })))
            );
            const grid = {};
            results.forEach((res, i) => {
                const dateStr = weekDates[i];
                const daySlots = res.data?.data || [];
                daySlots.forEach(s => {
                    if (!grid[s.slot_id]) grid[s.slot_id] = {};
                    const isBooked = typeof s.is_booked === 'boolean'
                        ? s.is_booked
                        : Boolean(s.status?.is_booked);
                    const isBlocked = typeof s.blocked_by_admin === 'boolean'
                        ? s.blocked_by_admin
                        : Boolean(s.status?.blocked_by_admin);
                    grid[s.slot_id][dateStr] = {
                        is_booked: isBooked,
                        blocked_by_admin: isBlocked
                    };
                });
            });
            setWeekGrid(grid);
        } catch (e) { setErr(e.response?.data?.message || e.message); }
        finally { setDailyLoading(false); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [docType, weekStart, slots]);

    useEffect(() => { if (tab === 'daily') loadWeekGrid(); }, [tab, loadWeekGrid]);

    // Listen for global appointment changes (book/cancel) and refresh daily grid when visible
    useEffect(() => {
        const handler = (e) => { if (tab === 'daily') loadWeekGrid(); };
        window.addEventListener('appointments:changed', handler);
        return () => window.removeEventListener('appointments:changed', handler);
    }, [tab, loadWeekGrid]);

    // Keep Daily View in sync with bookings from other channels (WhatsApp/form/API)
    useEffect(() => {
        if (tab !== 'daily') return undefined;
        const id = window.setInterval(() => { loadWeekGrid(); }, 30000);
        return () => window.clearInterval(id);
    }, [tab, loadWeekGrid]);

    // ── master CRUD ──────────────────────────────────────────────────────────
    const handleAdd = async (e) => {
        e.preventDefault(); setSaving(true);
        try {
            await createSlot({ ...form, sort_order: Number(form.sort_order) || 99 });
            flash('✅ Slot added successfully!');
            setForm(EMPTY_FORM); setShowAdd(false);
            loadMaster();
        } catch (e) { flash(e.response?.data?.message || e.message, true); }
        finally { setSaving(false); }
    };

    const handleDelete = async (slot_id) => {
        if (!window.confirm(`Delete slot ${slot_id}? If it has bookings it will be deactivated instead.`)) return;
        try {
            const res = await deleteSlot(slot_id);
            flash(res.data?.message || 'Slot removed.');
            loadMaster();
        } catch (e) { flash(e.response?.data?.message || e.message, true); }
    };

    const startEdit = (s) => {
        setEditId(s.slot_id);
        setEditForm({ slot_label: s.slot_label, start_time: s.start_time, end_time: s.end_time, session: s.session, sort_order: s.sort_order });
    };

    const handleSaveEdit = async (slot_id) => {
        setSaving(true);
        try {
            await updateSlotConfig([{ slot_id, ...editForm, sort_order: Number(editForm.sort_order) || 0 }]);
            flash('✅ Slot updated.');
            setEditId(null); loadMaster();
        } catch (e) { flash(e.response?.data?.message || e.message, true); }
        finally { setSaving(false); }
    };

    const toggleActive = async (s) => {
        try {
            await updateSlotConfig([{ ...s, is_active: !s.is_active }]);
            flash(`Slot ${s.is_active ? 'deactivated' : 'activated'}.`);
            loadMaster();
        } catch (e) { flash(e.response?.data?.message || e.message, true); }
    };

    // ── weekly template ──────────────────────────────────────────────────────
    const toggleDay = (slot_id, dayNum) => {
        setWeekDays(prev => {
            const dtMap = prev[slot_id] || {};
            const next = new Set(dtMap[weekDocType] || []);
            next.has(dayNum) ? next.delete(dayNum) : next.add(dayNum);
            return { ...prev, [slot_id]: { ...dtMap, [weekDocType]: next } };
        });
        setWeekDirty(true);
    };

    const setAllDays = (slot_id, all) => {
        setWeekDays(prev => {
            const dtMap = prev[slot_id] || {};
            return { ...prev, [slot_id]: { ...dtMap, [weekDocType]: all ? new Set([0, 1, 2, 3, 4, 5, 6]) : new Set() } };
        });
        setWeekDirty(true);
    };

    const saveWeeklyTemplate = async () => {
        setWeekSaving(true);
        try {
            const updates = slots.map(s => {
                const slotDocMap = weekDays[s.slot_id] || {};
                const days_by_doctor = {};
                ['PULMONARY', 'NON_PULMONARY', 'VACCINATION'].forEach(dt => {
                    days_by_doctor[dt] = Array.from(slotDocMap[dt] || []).sort();
                });
                return {
                    slot_id: s.slot_id,
                    slot_label: s.slot_label,
                    start_time: s.start_time,
                    end_time: s.end_time,
                    session: s.session,
                    is_active: s.is_active,
                    sort_order: s.sort_order,
                    days_of_week: s.days_of_week,   // keep global unchanged
                    days_by_doctor
                };
            });
            await updateSlotConfig(updates);
            flash(`✅ Schedule for ${DOCTOR_TYPES.find(d => d.value === weekDocType)?.label} saved!`);
            setWeekDirty(false);
        } catch (e) { flash(e.response?.data?.message || e.message, true); }
        finally { setWeekSaving(false); }
    };

    // ── daily grid block/unblock ─────────────────────────────────────────────
    const toggleBlock = async (slot_id, dateStr, cellState) => {
        const key = `${slot_id}_${dateStr}`;
        setBlocking(b => ({ ...b, [key]: true }));
        try {
            if (cellState?.blocked_by_admin) {
                await unblockSlots({ slots: [slot_id], slot_date: dateStr, doctor_type: docType });
                flash('Slot unblocked.');
            } else {
                await blockSlots({ slots: [slot_id], slot_date: dateStr, doctor_type: docType });
                flash('Slot blocked.');
            }
            // Update grid locally for instant feedback
            setWeekGrid(prev => ({
                ...prev,
                [slot_id]: {
                    ...(prev[slot_id] || {}),
                    [dateStr]: { is_booked: false, blocked_by_admin: !cellState?.blocked_by_admin }
                }
            }));
        } catch (e) { flash(e.response?.data?.message || e.message, true); }
        finally { setBlocking(b => ({ ...b, [key]: false })); }
    };

    // ── grouped for master view ───────────────────────────────────────────────
    const bySession = SESSION_OPTIONS.reduce((acc, s) => {
        acc[s] = slots
            .filter(sl => sl.session === s)
            .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
        return acc;
    }, {});

    // ── render ────────────────────────────────────────────────────────────────
    const TabBtn = ({ id, icon: Icon, label }) => (
        <button
            className={`btn ${tab === id ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab(id)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Icon size={15} /> {label}
        </button>
    );

    return (
        <div>
            {/* Header */}
            <div className="title-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1>Scheduling</h1>
                        <p>Manage clinic time slots and daily availability.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <TabBtn id="master" icon={Clock} label="Slot Master" />
                        <TabBtn id="weekly" icon={Grid} label="Weekly Template" />
                        <TabBtn id="daily" icon={CalIcon} label="Daily View" />
                    </div>
                </div>
            </div>

            {/* Alerts */}
            {err && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#dc2626', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <AlertCircle size={16} /> {err}
                </div>
            )}
            {ok && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#16a34a' }}>
                    {ok}
                </div>
            )}

            {/* ══ SLOT MASTER TAB ══════════════════════════════════════════════ */}
            {tab === 'master' && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{slots.length} slot templates defined</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn btn-outline" onClick={loadMaster} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <RefreshCw size={14} /> Refresh
                            </button>
                            <button className="btn btn-primary" onClick={() => { setShowAdd(!showAdd); setErr(null); }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                {showAdd ? <X size={15} /> : <Plus size={15} />} {showAdd ? 'Cancel' : 'Add Slot'}
                            </button>
                        </div>
                    </div>

                    {/* Add form */}
                    {showAdd && (
                        <div className="card" style={{ marginBottom: '1.5rem', border: '1px solid #c7d2fe', background: '#fafbff' }}>
                            <div className="card-header" style={{ background: '#eef2ff', borderBottom: '1px solid #c7d2fe' }}>
                                <h3 style={{ color: '#4338ca', margin: 0 }}>Add New Slot</h3>
                            </div>
                            <form onSubmit={handleAdd} style={{ padding: '1.25rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 0.6fr', gap: '0.75rem', alignItems: 'end' }}>
                                    <div>
                                        <label style={labelStyle}>Label *</label>
                                        <input required style={inputStyle} placeholder="e.g. 10:00 – 10:30 AM"
                                            value={form.slot_label} onChange={e => setForm(f => ({ ...f, slot_label: e.target.value }))} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Start *</label>
                                        <input required type="time" style={inputStyle}
                                            value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>End *</label>
                                        <input required type="time" style={inputStyle}
                                            value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Session *</label>
                                        <select required style={inputStyle}
                                            value={form.session} onChange={e => setForm(f => ({ ...f, session: e.target.value }))}>
                                            {SESSION_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Order</label>
                                        <input type="number" min={0} style={inputStyle} placeholder="0"
                                            value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                                    <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={saving}>
                                        {saving ? <RefreshCw size={14} style={{ marginRight: '0.4rem' }} /> : <Plus size={14} style={{ marginRight: '0.4rem' }} />}
                                        {saving ? 'Saving…' : 'Add Slot'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {loading ? (
                        <p style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading slots…</p>
                    ) : (
                        SESSION_OPTIONS.map(session => (
                            bySession[session].length > 0 && (
                                <div key={session} style={{ marginBottom: '1.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: SESSION_COLOR[session] }} />
                                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: SESSION_COLOR[session], textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {session} — {bySession[session].length} slots
                                        </span>
                                    </div>
                                    <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                                        <table style={{ width: '100%' }}>
                                            <thead>
                                                <tr style={{ background: SESSION_BG[session] }}>
                                                    {['Slot ID', 'Label', 'Start', 'End', 'Order', 'Status', 'Actions'].map(h => (
                                                        <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {bySession[session].map((s, idx) => (
                                                    <tr key={s.slot_id} style={{ borderTop: idx > 0 ? '1px solid #f1f5f9' : 'none', opacity: s.is_active ? 1 : 0.6 }}>
                                                        {editId === s.slot_id ? (
                                                            <>
                                                                <td style={{ padding: '0.5rem 1rem', fontFamily: 'monospace', fontSize: '0.78rem', color: '#64748b' }}>{s.slot_id}</td>
                                                                <td style={{ padding: '0.5rem 0.5rem' }}><input style={{ ...inputStyle, width: '160px' }} value={editForm.slot_label} onChange={e => setEditForm(f => ({ ...f, slot_label: e.target.value }))} /></td>
                                                                <td style={{ padding: '0.5rem 0.5rem' }}><input type="time" style={{ ...inputStyle, width: '110px' }} value={editForm.start_time} onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))} /></td>
                                                                <td style={{ padding: '0.5rem 0.5rem' }}><input type="time" style={{ ...inputStyle, width: '110px' }} value={editForm.end_time} onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))} /></td>
                                                                <td style={{ padding: '0.5rem 0.5rem' }}><input type="number" style={{ ...inputStyle, width: '70px' }} value={editForm.sort_order} onChange={e => setEditForm(f => ({ ...f, sort_order: e.target.value }))} /></td>
                                                                <td colSpan={2} style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>
                                                                    <button className="btn btn-primary" style={{ padding: '0.3rem 0.7rem', height: 'auto', fontSize: '0.78rem', marginRight: '0.4rem' }} onClick={() => handleSaveEdit(s.slot_id)} disabled={saving}>
                                                                        <Check size={13} style={{ marginRight: '0.3rem' }} /> Save
                                                                    </button>
                                                                    <button className="btn btn-outline" style={{ padding: '0.3rem 0.7rem', height: 'auto', fontSize: '0.78rem' }} onClick={() => setEditId(null)}>
                                                                        <X size={13} style={{ marginRight: '0.3rem' }} /> Cancel
                                                                    </button>
                                                                </td>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', fontSize: '0.78rem', color: '#94a3b8' }}>{s.slot_id}</td>
                                                                <td style={{ padding: '0.65rem 1rem', fontWeight: 600, fontSize: '0.875rem' }}>{s.slot_label}</td>
                                                                <td style={{ padding: '0.65rem 1rem', fontSize: '0.85rem', color: '#475569' }}>{fmt12(s.start_time)}</td>
                                                                <td style={{ padding: '0.65rem 1rem', fontSize: '0.85rem', color: '#475569' }}>{fmt12(s.end_time)}</td>
                                                                <td style={{ padding: '0.65rem 1rem', fontSize: '0.85rem', color: '#94a3b8' }}>{s.sort_order}</td>
                                                                <td style={{ padding: '0.65rem 1rem' }}>
                                                                    <button onClick={() => toggleActive(s)}
                                                                        style={{
                                                                            fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px', border: 'none', cursor: 'pointer',
                                                                            background: s.is_active ? '#dcfce7' : '#fee2e2', color: s.is_active ? '#16a34a' : '#dc2626'
                                                                        }}>
                                                                        {s.is_active ? 'Active' : 'Inactive'}
                                                                    </button>
                                                                </td>
                                                                <td style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>
                                                                    <button title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', padding: '0.3rem', marginRight: '0.25rem' }} onClick={() => startEdit(s)}><Edit2 size={15} /></button>
                                                                    <button title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.3rem' }} onClick={() => handleDelete(s.slot_id)}><Trash2 size={15} /></button>
                                                                </td>
                                                            </>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )
                        ))
                    )}
                    {!loading && slots.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
                            <Clock size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                            <p>No slots configured yet. Click <strong>Add Slot</strong> to get started.</p>
                        </div>
                    )}
                </>
            )}

            {/* ══ WEEKLY TEMPLATE TAB ══════════════════════════════════════════ */}
            {tab === 'weekly' && (
                <>
                    {/* Doctor Type Selector + description */}
                    <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                            <div>
                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginBottom: '0.5rem' }}>DOCTOR TYPE</div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {DOCTOR_TYPES.map(dt => (
                                        <button key={dt.value} onClick={() => { setWeekDocType(dt.value); setWeekDirty(false); }}
                                            style={{
                                                padding: '0.4rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 700,
                                                fontSize: '0.82rem', border: `1.5px solid ${weekDocType === dt.value ? dt.color : '#e2e8f0'}`,
                                                background: weekDocType === dt.value ? dt.bg : 'white',
                                                color: weekDocType === dt.value ? dt.color : '#64748b',
                                                transition: 'all 0.15s'
                                            }}>
                                            {dt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem', maxWidth: '300px', textAlign: 'right' }}>
                                    Configure which days each slot is active for <strong style={{ color: '#475569' }}>{DOCTOR_TYPES.find(d => d.value === weekDocType)?.label}</strong>.
                                    Each doctor type can have a different schedule.
                                </p>
                                <button className="btn btn-outline" onClick={() => { loadMaster(); setWeekDirty(false); }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
                                    <RefreshCw size={14} /> Reset
                                </button>
                                <button className="btn btn-primary" onClick={saveWeeklyTemplate} disabled={weekSaving || !weekDirty}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: weekDirty ? 1 : 0.5, whiteSpace: 'nowrap' }}>
                                    {weekSaving ? <RefreshCw size={14} /> : <Check size={14} />}
                                    {weekSaving ? 'Saving…' : weekDirty ? 'Save Template' : 'No Changes'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <p style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading…</p>
                    ) : (
                        SESSION_OPTIONS.map(session => (
                            bySession[session].length > 0 && (
                                <div key={session} style={{ marginBottom: '1.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: SESSION_COLOR[session] }} />
                                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: SESSION_COLOR[session], textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {session}
                                        </span>
                                    </div>

                                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: SESSION_BG[session] }}>
                                                    <th style={{ padding: '0.7rem 1rem', textAlign: 'left', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, width: '220px' }}>Slot</th>
                                                    <th style={{ padding: '0.7rem 0.5rem', textAlign: 'left', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, width: '80px' }}>Time</th>
                                                    {DAYS.map(d => (
                                                        <th key={d} style={{ padding: '0.7rem 0', textAlign: 'center', fontSize: '0.78rem', color: '#64748b', fontWeight: 700, width: '62px' }}>{d}</th>
                                                    ))}
                                                    <th style={{ padding: '0.7rem 0.75rem', textAlign: 'center', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, width: '70px' }}>All</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {bySession[session].map((s, idx) => {
                                                    const activeDays = weekDays[s.slot_id]?.[weekDocType] || new Set();
                                                    const allChecked = activeDays.size === 7;
                                                    const dtInfo = DOCTOR_TYPES.find(d => d.value === weekDocType);
                                                    return (
                                                        <tr key={s.slot_id} style={{ borderTop: idx > 0 ? '1px solid #f1f5f9' : 'none' }}>
                                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{s.slot_label}</div>
                                                                <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#94a3b8' }}>{s.slot_id}</div>
                                                            </td>
                                                            <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: '#475569', whiteSpace: 'nowrap' }}>
                                                                {fmt12(s.start_time)}
                                                            </td>
                                                            {DAYS.map((_, dayNum) => (
                                                                <td key={dayNum} style={{ padding: '0.75rem 0', textAlign: 'center' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={activeDays.has(dayNum)}
                                                                        onChange={() => toggleDay(s.slot_id, dayNum)}
                                                                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: dtInfo?.color }}
                                                                    />
                                                                </td>
                                                            ))}
                                                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                                                <button
                                                                    onClick={() => setAllDays(s.slot_id, !allChecked)}
                                                                    title={allChecked ? 'Uncheck all days' : 'Check all days'}
                                                                    style={{
                                                                        background: allChecked ? dtInfo?.bg : '#f8fafc',
                                                                        border: `1px solid ${allChecked ? dtInfo?.color : '#e2e8f0'}`,
                                                                        color: allChecked ? dtInfo?.color : '#94a3b8',
                                                                        borderRadius: '6px', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700
                                                                    }}>
                                                                    {allChecked ? 'All ✓' : 'All'}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )
                        ))
                    )}

                    {weekDirty && (
                        <div style={{ position: 'sticky', bottom: '1.5rem', display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                            <button className="btn btn-primary" onClick={saveWeeklyTemplate} disabled={weekSaving}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 20px rgba(99,102,241,0.35)', padding: '0.75rem 2rem' }}>
                                {weekSaving ? <RefreshCw size={15} /> : <Check size={15} />}
                                {weekSaving ? 'Saving…' : `Save ${DOCTOR_TYPES.find(d => d.value === weekDocType)?.label} Schedule`}
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* ══ DAILY VIEW TAB — Weekly Grid ════════════════════════════════ */}
            {tab === 'daily' && (
                <>
                    {/* Controls bar */}
                    <div className="card" style={{ padding: '0.85rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                            <CalIcon size={18} color="#4f46e5" />
                            <div>
                                <label style={labelStyle}>Doctor Type</label>
                                <select value={docType} onChange={e => setDocType(e.target.value)} style={{ ...inputStyle, width: '180px' }}>
                                    <option value="PULMONARY">Pulmonary</option>
                                    <option value="NON_PULMONARY">Non-Pulmonary</option>
                                    <option value="VACCINATION">Vaccination</option>
                                </select>
                            </div>
                        </div>
                        {/* Week navigation */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button className="btn btn-outline" onClick={() => shiftWeek(-1)} style={{ padding: '0.4rem 0.75rem' }}>‹ Prev</button>
                            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1e293b' }}>
                                {new Date(weekDates[0]).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                {' – '}
                                {new Date(weekDates[6]).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            <button className="btn btn-outline" onClick={() => shiftWeek(1)} style={{ padding: '0.4rem 0.75rem' }}>Next ›</button>
                            <button className="btn btn-outline" onClick={loadWeekGrid} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <RefreshCw size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Legend */}
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        {[
                            { label: 'Available', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
                            { label: 'Blocked', bg: '#fff1f2', color: '#e11d48', border: '#fecdd3' },
                            { label: 'Booked', bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
                            { label: 'Off (template)', bg: '#f8fafc', color: '#94a3b8', border: '#e2e8f0' },
                        ].map(l => (
                            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: '#475569' }}>
                                <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: l.bg, border: `1px solid ${l.border}` }} />
                                {l.label}
                            </div>
                        ))}
                    </div>

                    {dailyLoading ? (
                        <p style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading week…</p>
                    ) : (
                        SESSION_OPTIONS.map(session => (
                            bySession[session].length > 0 && (
                                <div key={session} style={{ marginBottom: '1.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: SESSION_COLOR[session] }} />
                                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: SESSION_COLOR[session], textTransform: 'uppercase', letterSpacing: '0.05em' }}>{session}</span>
                                    </div>

                                    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
                                            <thead>
                                                <tr style={{ background: SESSION_BG[session] }}>
                                                    <th style={{ padding: '0.7rem 1rem', textAlign: 'left', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, width: '200px' }}>Slot</th>
                                                    <th style={{ padding: '0.7rem 0.5rem', textAlign: 'left', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, width: '80px' }}>Time</th>
                                                    {weekDates.map((d, i) => {
                                                        const dt = new Date(d);
                                                        const isToday = d === todayStr();
                                                        return (
                                                            <th key={d} style={{
                                                                padding: '0.7rem 0.25rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700,
                                                                color: isToday ? '#4f46e5' : '#64748b', minWidth: '80px'
                                                            }}>
                                                                <div>{DAYS[i]}</div>
                                                                <div style={{ fontWeight: 500, fontSize: '0.7rem', color: isToday ? '#4f46e5' : '#94a3b8' }}>
                                                                    {dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                                </div>
                                                                {isToday && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4f46e5', margin: '2px auto 0' }} />}
                                                            </th>
                                                        );
                                                    })}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {bySession[session].map((slot, idx) => {
                                                    // Does this slot's weekly template include each day?
                                                    const slotDays = weekDays[slot.slot_id] || new Set([0, 1, 2, 3, 4, 5, 6]);
                                                    return (
                                                        <tr key={slot.slot_id} style={{ borderTop: idx ? '1px solid #f1f5f9' : 'none' }}>
                                                            <td style={{ padding: '0.65rem 1rem' }}>
                                                                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{slot.slot_label}</div>
                                                                <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#94a3b8' }}>{slot.slot_id}</div>
                                                            </td>
                                                            <td style={{ padding: '0.65rem 0.5rem', fontSize: '0.8rem', color: '#475569', whiteSpace: 'nowrap' }}>
                                                                {fmt12(slot.start_time)}
                                                            </td>
                                                            {weekDates.map((dateStr, dayIdx) => {
                                                                        const cellKey = `${slot.slot_id}_${dateStr}`;
                                                                        const cell = weekGrid[slot.slot_id]?.[dateStr];
                                                                        // weekDays stores per-slot a map of doctor-type -> Set(days)
                                                                        const slotDaysForDoc = (weekDays[slot.slot_id] && weekDays[slot.slot_id][docType]) || new Set([0, 1, 2, 3, 4, 5, 6]);
                                                                        const inTemplate = slotDaysForDoc.has(dayIdx);
                                                                const isBooked = cell?.is_booked;
                                                                const isBlocked = cell?.blocked_by_admin;
                                                                const isBusy = blocking[cellKey];

                                                                // Determine cell appearance
                                                                let bg, color, border, cursor, title;
                                                                if (!inTemplate) {
                                                                    bg = '#f8fafc'; color = '#cbd5e1'; border = '#e2e8f0'; cursor = 'default'; title = 'Off (not in weekly template)';
                                                                } else if (isBooked) {
                                                                    bg = '#eff6ff'; color = '#2563eb'; border = '#bfdbfe'; cursor = 'default'; title = 'Appointment booked';
                                                                } else if (isBlocked) {
                                                                    bg = '#fff1f2'; color = '#e11d48'; border = '#fecdd3'; cursor = 'pointer'; title = 'Click to unblock';
                                                                } else {
                                                                    bg = '#f0fdf4'; color = '#16a34a'; border = '#bbf7d0'; cursor = 'pointer'; title = 'Click to block';
                                                                }

                                                                return (
                                                                    <td key={dateStr} style={{ padding: '0.5rem 0.25rem', textAlign: 'center' }}>
                                                                        <button
                                                                            disabled={!inTemplate || isBooked || isBusy}
                                                                            onClick={() => !isBooked && inTemplate && toggleBlock(slot.slot_id, dateStr, cell)}
                                                                            title={title}
                                                                            style={{
                                                                                width: '70px', padding: '0.3rem 0.25rem', borderRadius: '8px',
                                                                                background: bg, color, border: `1px solid ${border}`,
                                                                                cursor, fontSize: '0.7rem', fontWeight: 700,
                                                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '3px'
                                                                            }}
                                                                        >
                                                                            {isBusy ? <RefreshCw size={11} /> :
                                                                                isBooked ? <><Check size={11} /> Booked</> :
                                                                                    isBlocked ? <><Lock size={11} /> Blocked</> :
                                                                                        !inTemplate ? '—' :
                                                                                            <><Unlock size={11} /> Free</>}
                                                                        </button>
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )
                        ))
                    )}
                </>
            )}
        </div>
    );
};

export default Scheduling;
