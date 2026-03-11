const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const morgan = require('morgan');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const corsMiddleware = require('./middleware/cors');
const setupSwagger = require('./swagger');
const auth = require('./middleware/auth');
const authorize = require('./middleware/rbac');
const jwtOnly = require('./middleware/jwtOnly');

// Load env vars
dotenv.config();

const app = express();
console.log('--- DEBUG: app.js loaded from backend/src/app.js ---');

// Security Headers
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP to allow Swagger UI to work across origins
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Body parser
app.use(express.json({ limit: '10mb' })); // Allow Base64 photo and attachment uploads
app.use(cookieParser());

// Dev logging middleware
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Enable CORS
app.use(corsMiddleware);

// MongoDB connection events for debugging
mongoose.connection.on('connected', () => console.log('Mongoose default connection open to DB'));
mongoose.connection.on('error', (err) => console.error('Mongoose default connection error:', err));
mongoose.connection.on('disconnected', () => console.log('Mongoose default connection disconnected'));

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connect() promise resolved'))
    .catch(err => console.error('MongoDB initial connection error:', err));

// Public Routes
app.use('/api/admin', require('./modules/system/admin.routes'));
app.use('/api/auth', require('./modules/auth/auth.routes'));

// Mount all modules - security is handled within each router file
app.use('/api/patients', require('./modules/patients/patient.routes'));
app.use('/api/appointments', require('./modules/appointments/appointment.routes'));
app.use('/api/mrd', require('./modules/patients/mrd.routes'));
app.use('/api/bot', require('./modules/bot/bot.routes'));
app.use('/api/bot/history', require('./modules/bot/history.routes'));
app.use('/api/system', require('./modules/system/system.routes'));
app.use('/api/config', require('./modules/system/config.routes'));
app.use('/api/audit', require('./modules/system/audit.routes'));
app.use('/api/doctors', require('./modules/doctors/doctor.routes'));
app.use('/api/doctor', require('./modules/doctors/availability.routes'));
app.use('/api/token-config', require('./modules/system/tokenConfig.routes'));
app.use('/api/referring-doctors', require('./modules/system/referringDoctor.routes'));

// New modules v1.1.0
app.use('/api/notifications', require('./modules/system/notifications.routes'));
app.use('/api/reminders', require('./modules/system/reminders.routes'));
app.use('/api/reports', require('./modules/system/reports.routes'));
app.use('/api/analytics', require('./modules/system/analytics.routes'));
app.use('/api/feedback', require('./modules/system/feedback.routes'));

// Messaging (doctor alerts, appointment notifications, token reminders)
app.use('/api/messages', require('./modules/whatsapp/whatsapp.routes'));

// Setup Swagger
setupSwagger(app);

// Base route
app.get('/', (req, res) => {
    res.send('Dr. Indu Child Care API is running...');
});

const errorHandler = require('./middleware/error');
// Global error handler
app.use(errorHandler);

// Initialize Background Automation Jobs
const { initCronJobs } = require('./services/cronJobs');
initCronJobs();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

module.exports = app;
