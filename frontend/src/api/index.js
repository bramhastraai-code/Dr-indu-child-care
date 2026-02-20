import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor: attach JWT from localStorage on every request
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor: auto-logout on 401 Unauthorized
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (credentials) => api.post('/admin/login', credentials);

// ── Patients ──────────────────────────────────────────────────────────────────
export const getPatients = (params) => api.get('/patients', { params });
export const searchPatients = (q) => api.get('/patients', { params: { search: q } });
export const getPatientById = (id) => api.get(`/patients/${id}`);
export const getPatientByMobile = (mobile) => api.get(`/patients/by-mobile/${mobile}`);
export const getPatientByWa = (mobile) => api.get(`/patients/by-mobile/${mobile}`);
export const registerPatient = (data) => api.post('/patients', data);
export const updatePatient = (id, data) => api.put(`/patients/${id}`, data);

// ── Appointments ──────────────────────────────────────────────────────────────
/** List appointments. Params: { date, patient_id, status, source, page, limit } */
export const getAppointments = (params) => api.get('/appointments', { params });
export const getAppointmentsByDate = (date) => api.get('/appointments', { params: { date } });
export const getAppointmentStats = (date) => api.get('/appointments/stats', { params: date ? { date } : {} });
export const getAppointmentsByMobile = (mobile) => api.get(`/appointments/by-mobile/${mobile}`);
export const getAppointmentsByWaId = (wa_id) => api.get(`/appointments/by-wa/${encodeURIComponent(wa_id)}`);
export const getAppointmentById = (id) => api.get(`/appointments/${id}`);

// Booking — three surfaces, one backend rule set
/** Dashboard: patient_id + booking_source:'dashboard' */
export const bookAppointment = (data) => api.post('/appointments', { ...data, booking_source: 'dashboard' });
/** WhatsApp bot: wa_id (raw, e.g. '919876543210@c.us') */
export const bookByWhatsapp = (data) => api.post('/appointments/whatsapp', data);
/** Public web form: mobile number */
export const bookByForm = (data) => api.post('/appointments/form', data);

export const updateAppointment = (id, data) => api.patch(`/appointments/${id}`, data);
export const cancelAppointment = (id, data) => api.patch(`/appointments/${id}/cancel`, data);


// ── Slots ─────────────────────────────────────────────────────────────────────
export const getAvailableSlots = (doctor_type, date) =>
    api.get(`/slots/available?doctor_type=${doctor_type}&date=${date}`);
export const getDailyStatus = (doctor_type, date) =>
    api.get(`/slots/daily-status?doctor_type=${doctor_type}&date=${date}`);
export const updateDailySlot = (data) => api.post('/slots/daily-update', data);
export const getSlotConfig = () => api.get('/slots/config');
export const updateSlotConfig = (slots) => api.put('/slots/config', { slots });
export const createSlot = (data) => api.post('/slots/config/add', data);
export const deleteSlot = (slot_id) => api.delete(`/slots/config/${slot_id}`);
export const blockSlots = (data) => api.post('/slots/block', data);
export const unblockSlots = (data) => api.post('/slots/unblock', data);

// ── MRD ───────────────────────────────────────────────────────────────────────
export const getMRDByPatientId = (patient_id) => api.get(`/mrd/${patient_id}`);
export const exportMRD = (patient_id) => api.get(`/mrd/${patient_id}/export`);
export const addMRDEntry = (data) => api.post('/mrd/entry', data);
export const updateMRDEntry = (id, data) => api.patch(`/mrd/entry/${id}`, data);

// ── Admin Users ───────────────────────────────────────────────────────────────
export const getAdminUsers = () => api.get('/admin/users');
export const createAdminUser = (data) => api.post('/admin/users', data);
export const updateAdminUser = (id, data) => api.patch(`/admin/users/${id}`, data);

// ── System ────────────────────────────────────────────────────────────────────
export const getSystemHealth = () => api.get('/system/health');
export const getConfig = () => api.get('/config');
export const updateConfig = (data) => api.patch('/config', data);
export const getAuditLogs = (params) => api.get('/audit/logs', { params });

// ── Bot Sessions (for dashboard oversight) ────────────────────────────────────
export const getEscalations = () => api.get('/bot/escalations');
export const resolveEscalation = (id) => api.patch(`/bot/escalations/${id}`);
export const getUnregisteredInteractions = () => api.get('/bot/interactions/unregistered');

export default api;
