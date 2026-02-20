import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import {
    LayoutDashboard,
    Calendar,
    Users,
    FileText,
    Settings as SettingsIcon,
    Clock,
    Bell,
    Search,
    LogOut,
    MessageSquare
} from 'lucide-react';

import Dashboard from './pages/Dashboard';
import Appointments from './pages/Appointments';
import Patients from './pages/Patients';
import MRD from './pages/MRD';
import Login from './pages/Login';
import Settings from './pages/Settings';
import Scheduling from './pages/Scheduling';
import PublicRegister from './pages/PublicRegister';
import BotInteractions from './pages/BotInteractions';

const Sidebar = ({ onLogout }) => {
    const location = useLocation();

    const navItems = [
        { name: 'Dashboard', path: '/', icon: LayoutDashboard },
        { name: 'Appointments', path: '/appointments', icon: Calendar },
        { name: 'Scheduling', path: '/scheduling', icon: Clock },
        { name: 'Patients', path: '/patients', icon: Users },
        { name: 'Bot Leads', path: '/bot-interactions', icon: MessageSquare },
        { name: 'MRD', path: '/mrd', icon: FileText },
        { name: 'Settings', path: '/settings', icon: SettingsIcon },
    ];

    return (
        <div className="sidebar">
            <div className="logo">
                <div style={{ fontSize: '1.5rem', filter: 'drop-shadow(0 4px 6px rgba(99, 102, 241, 0.2))' }}>🩺</div>
                <span style={{ letterSpacing: '-0.02em' }}>Dr. Indu Child Care</span>
            </div>
            <ul className="nav-links">
                {navItems.map((item) => (
                    <li key={item.name}>
                        <Link
                            to={item.path}
                            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                        >
                            <item.icon size={20} />
                            {item.name}
                        </Link>
                    </li>
                ))}
            </ul>
            <div style={{ marginTop: 'auto', padding: '0.5rem' }}>
                <button
                    onClick={onLogout}
                    className="nav-item"
                    style={{
                        width: '100%',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left'
                    }}
                >
                    <LogOut size={20} />
                    Logout
                </button>
            </div>
        </div>
    );
};

const Header = () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const displayName = user.full_name || user.username || 'Admin';
    const displayRole = user.role ? user.role.charAt(0) + user.role.slice(1).toLowerCase() : 'Admin';
    const initial = displayName.charAt(0).toUpperCase();

    return (
        <header className="header">
            <div className="search-bar" style={{ position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                    type="text"
                    placeholder="Quick search patients..."
                    style={{
                        padding: '0.75rem 1rem 0.75rem 2.75rem',
                        borderRadius: '14px',
                        border: '1px solid var(--border-color)',
                        width: '360px',
                        outline: 'none',
                        fontSize: '0.9rem',
                        background: '#fff',
                        boxShadow: 'var(--shadow-sm)',
                        transition: 'var(--transition)'
                    }}
                    onFocus={(e) => { e.target.style.width = '420px'; e.target.style.borderColor = 'var(--primary)'; }}
                    onBlur={(e) => { e.target.style.width = '360px'; e.target.style.borderColor = 'var(--border-color)'; }}
                />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div style={{ position: 'relative', cursor: 'pointer' }}>
                    <Bell size={22} color="#64748b" />
                    <span style={{
                        position: 'absolute',
                        top: '-2px',
                        right: '-2px',
                        width: '8px',
                        height: '8px',
                        backgroundColor: '#ef4444',
                        borderRadius: '50%',
                        border: '2px solid #fff'
                    }}></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.4rem', borderRadius: '14px', transition: 'var(--transition)' }} className="profile-trigger">
                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--primary) 0%, #4338ca 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(99, 102, 241, 0.3)' }}>
                        {initial}
                    </div>
                    <div style={{ lineHeight: '1.2' }}>
                        <p style={{ fontSize: '0.875rem', fontWeight: '700', margin: 0, color: '#0f172a' }}>{displayName}</p>
                        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0, fontWeight: '500' }}>{displayRole}</p>
                    </div>
                </div>
            </div>
        </header>
    );
};

const App = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));

    const handleLogin = (token) => {
        setIsAuthenticated(true);
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        setIsAuthenticated(false);
    };

    if (!isAuthenticated) {
        return (
            <Router>
                <Routes>
                    <Route path="/login" element={<Login onLogin={handleLogin} />} />
                    <Route path="/register-form" element={<PublicRegister />} />
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            </Router>
        );
    }

    return (
        <Router>
            <Routes>
                {/* Standalone Public Route (No Sidebar/Header) */}
                <Route path="/register-form" element={<PublicRegister />} />

                {/* Admin Layout Routes */}
                <Route path="/*" element={
                    <div className="app-container">
                        <Sidebar onLogout={handleLogout} />
                        <main className="main-content">
                            <Header />
                            <Routes>
                                <Route path="/" element={<Dashboard />} />
                                <Route path="/appointments" element={<Appointments />} />
                                <Route path="/scheduling" element={<Scheduling />} />
                                <Route path="/patients" element={<Patients />} />
                                <Route path="/bot-interactions" element={<BotInteractions />} />
                                <Route path="/mrd" element={<MRD />} />
                                <Route path="/settings" element={<Settings />} />
                                <Route path="/login" element={<Navigate to="/" replace />} />
                            </Routes>
                        </main>
                    </div>
                } />
            </Routes>
        </Router>
    );
};

export default App;
