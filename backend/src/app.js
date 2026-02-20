const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const morgan = require('morgan');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');


const corsMiddleware = require('./middleware/cors');
const setupSwagger = require('./swagger');
const auth = require('./middleware/auth');
const authorize = require('./middleware/rbac');

// Load env vars
dotenv.config();

const app = express();

// Security Headers
app.use(helmet());

// Body parser
app.use(express.json({ limit: '10kb' })); // Limit body size
app.use(cookieParser());





// Dev logging middleware
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Rate Limiting
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { success: false, error_code: 'TOO_MANY_REQUESTS', message: 'Too many requests from this IP' }
});
// app.use('/api', generalLimiter);

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error_code: 'LOGIN_LIMIT_EXCEEDED', message: 'Too many login attempts, try again in 15 minutes' }
});
// app.use('/api/admin/login', loginLimiter);

// Enable CORS
app.use(corsMiddleware);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB Connected...'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Public Routes
app.use('/api/system/health', (req, res) => res.json({ status: 'up' }));
app.use('/api/admin', require('./modules/system/admin.routes'));
app.use('/api/auth', require('./modules/auth/auth.routes'));

// Public Forms (No Auth)
const formLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { success: false, error_code: 'RATE_LIMIT_EXCEEDED', message: 'Too many form submissions, try again in an hour' }
});
app.post('/api/patients/form', formLimiter, require('./modules/patients/patient.routes'));
app.post('/api/appointments/form', formLimiter, require('./modules/appointments/appointment.routes'));

// Protected Routes
const whatsappLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    keyGenerator: (req) => {
        // Use express-rate-limit's ipKeyGenerator for IPv6 compatibility
        const ipKeyGenerator = require('express-rate-limit').ipKeyGenerator;
        return req.body.wa_id || ipKeyGenerator(req);
    },
    message: { success: false, error_code: 'BOT_RATE_LIMIT', message: 'Rate limit exceeded for this WhatsApp ID' }
});

app.use('/api/patients', auth, require('./modules/patients/patient.routes'));
app.use('/api/appointments/whatsapp', auth, whatsappLimiter, require('./modules/appointments/appointment.routes'));
app.use('/api/appointments', auth, require('./modules/appointments/appointment.routes'));
app.use('/api/slots', auth, require('./modules/system/slots.routes'));
app.use('/api/mrd', auth, require('./modules/patients/mrd.routes'));
app.use('/api/bot', auth, require('./modules/bot/bot.routes'));
app.use('/api/whatsapp', auth, require('./modules/bot/whatsapp.routes'));
app.use('/api/config', auth, authorize('superadmin'), require('./modules/system/config.routes'));
app.use('/api/audit', auth, authorize(['superadmin', 'admin']), require('./modules/system/audit.routes'));

// Setup Swagger
setupSwagger(app);

// Base route
app.get('/', (req, res) => {
    res.send('Dr. Indu Child Care API is running...');
});

const errorHandler = require('./middleware/error');
// Global error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

module.exports = app;
