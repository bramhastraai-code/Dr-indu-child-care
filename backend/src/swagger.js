const swaggerUi = require('swagger-ui-express');

// ── Helper: build a requestBody with a pre-filled example ──────────────────────
const body = (example, required = true, description = '') => ({
    required,
    description,
    content: {
        'application/json': {
            schema: { type: 'object' },
            example                         // ← Swagger renders THIS as the editable text
        }
    }
});

// ── Helper: path parameter with a pre-filled default ──────────────────────────
const pathParam = (name, def, desc = '') => ({
    name, in: 'path', required: true, description: desc,
    schema: { type: 'string', default: def, example: def }
});

// ── Helper: query parameter with a pre-filled default ─────────────────────────
const queryParam = (name, def, enumVals, required = false) => ({
    name, in: 'query', required,
    schema: enumVals
        ? { type: 'string', enum: enumVals, default: def }
        : { type: 'string', default: def }
});

const getSwaggerServers = () => {
    const explicitUrl = process.env.PUBLIC_API_URL || process.env.SWAGGER_SERVER_URL;
    if (explicitUrl) {
        return [{ url: explicitUrl, description: 'Configured Server' }];
    }

    if (process.env.NODE_ENV === 'production') {
        // Relative URL keeps docs and API on the same origin in hosted environments.
        return [{ url: '/', description: 'Production' }];
    }

    return [{ url: `http://localhost:${process.env.PORT || 5000}`, description: 'Local Development' }];
};

const spec = {
    openapi: '3.0.0',
    info: {
        title: 'Dr. Indu Child Care — API',
        version: '1.0.0',
        description: `
**Complete API reference** for the WhatsApp Bot integration and Clinic Management Dashboard.

### Quick Start
1. Call **POST /api/admin/login** (no auth needed) to get a JWT.
2. Click the 🔒 **Authorize** button at the top and enter \`Bearer <token>\`.
3. Expand any endpoint → **Try it out** → **Execute**.
        `,
    },
    servers: getSwaggerServers(),
    components: {
        securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
        }
    },
    security: [{ bearerAuth: [] }],
    tags: [
        { name: 'Admin', description: 'Admin user management' },
        { name: 'Patients', description: 'Patient registration and lookup' },
        { name: 'Appointments', description: 'Appointment booking, cancellation, rescheduling' },
        { name: 'Slots', description: 'Slot availability and configuration' },
        { name: 'MRD', description: 'Medical record documents' },
        { name: 'System', description: 'Health check, config, audit logs' },
        { name: 'WhatsApp Bot Integration', description: 'Complete tools for the WhatsApp bot (Session, Leads, History, Reminders)' },
    ],
    paths: {

        '/api/bot/session/{wa_id}': {
            get: {
                tags: ['WhatsApp Bot Integration'], summary: 'Get active bot session',
                parameters: [pathParam('wa_id', '9876543210', 'WhatsApp number')],
                responses: { 200: { description: 'Success' }, 404: { description: 'No active session' } }
            }
        },
        '/api/bot/session/create': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Create a new bot session',
                requestBody: body({ wa_number: '9876543210', session_id: 'wati_session_xyz987' }),
                responses: { 210: { description: 'Session created' } }
            }
        },
        '/api/bot/session/update': {
            patch: {
                tags: ['WhatsApp Bot Integration'], summary: 'Update bot session state/data',
                requestBody: body({
                    wa_number: '9876543210',
                    current_state: 'S01_COLLECT_GENDER',
                    session_data: { child_name: 'Arjun' }
                }, false),
                responses: { 200: { description: 'Updated' } }
            }
        },
        '/api/bot/escalate': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Escalate to human support',
                requestBody: body({
                    wa_number: '9876543210',
                    reason: 'MAX_RETRIES',
                    failed_state: 'S04_MOBILE'
                }),
                responses: { 200: { description: 'Escalated' } }
            }
        },
        '/api/bot/interactions/unregistered': {
            get: {
                tags: ['WhatsApp Bot Integration'], summary: 'Get unregistered bot interactions (leads)',
                responses: { 200: { description: 'List of anonymous bot sessions' } }
            }
        },
        '/api/bot/chat/log': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Log chat message (for registered patients)',
                requestBody: body({
                    wa_number: '9876543210',
                    user_name: 'Rohit Sharma',
                    message: 'I want to book an appointment'
                }),
                responses: { 201: { description: 'Logged' } }
            }
        },
        '/api/bot/chat/history/{wa_id}': {
            get: {
                tags: ['WhatsApp Bot Integration'], summary: 'Get last 10 chat messages',
                parameters: [pathParam('wa_id', '9876543210')],
                responses: { 200: { description: 'Chat history' } }
            }
        },
        '/api/appointments/reminders/pending-24h': {
            get: {
                tags: ['WhatsApp Bot Integration'], summary: 'Get appointments for tomorrow (for 24h reminders)',
                responses: { 200: { description: 'List of pending reminders' } }
            }
        },
        '/api/appointments/reminders/{appointment_id}/mark-sent': {
            patch: {
                tags: ['WhatsApp Bot Integration'], summary: 'Mark reminder as sent (updates timestamp)',
                parameters: [pathParam('appointment_id', 'APT-2026-00001')],
                requestBody: body({ type: '24h' }),
                responses: { 200: { description: 'Updated. Response includes the exact timestamp of the reminder.' } }
            }
        },

        // ══ ADMIN ═════════════════════════════════════════════════════════════
        '/api/admin/login': {
            post: {
                tags: ['Admin'], summary: 'Admin / Secretary login', security: [],
                requestBody: body({ username: 'drinduchildcare@gmail.com', password: 'Drindu@1234' }),
                responses: { 200: { description: 'Returns JWT token + user info' }, 400: { description: 'Invalid credentials' } }
            }
        },
        '/api/admin/users': {
            get: {
                tags: ['Admin'], summary: 'List all admin users',
                responses: { 200: { description: 'Array of users (no passwords)' } }
            },
            post: {
                tags: ['Admin'], summary: 'Create a new admin user',
                requestBody: body({
                    username: 'dr_priya', email: 'priya@clinic.com', password: 'TempPass@123',
                    full_name: 'Dr. Priya Menon', role: 'DOCTOR'
                }),
                responses: { 201: { description: 'User created' }, 400: { description: 'User already exists' } }
            }
        },
        '/api/admin/users/{id}': {
            patch: {
                tags: ['Admin'], summary: 'Update an admin user',
                parameters: [pathParam('id', 'PASTE_MONGO_ID_HERE', 'Admin user _id from GET /admin/users')],
                requestBody: body({ full_name: 'Dr. Priya Reddy', role: 'DOCTOR', is_active: true }, false),
                responses: { 200: { description: 'User updated' } }
            }
        },

        // ══ PATIENTS ══════════════════════════════════════════════════════════
        '/api/patients': {
            get: {
                tags: ['Patients'], summary: 'List patients with pagination and filters',
                parameters: [
                    queryParam('page', '1'),
                    queryParam('limit', '20'),
                    queryParam('search', 'Arjun', 'Search by name, mobile or ID'),
                    queryParam('source', 'whatsapp', ['whatsapp', 'dashboard', 'form', 'api']),
                    queryParam('status', 'COMPLETE', ['COMPLETE', 'PENDING'])
                ],
                responses: { 200: { description: 'Paginated list of patients' } }
            },
            post: {
                tags: ['Patients'], summary: 'Register a new patient (General)',
                requestBody: body({
                    child_name: 'Arjun Sharma',
                    gender: 'Male',
                    parent_name: 'Rohit Sharma',
                    mobile: '9876500001',
                    alt_mobile: 'SKIP',
                    dob: '2022-04-15',
                    email: 'rohit@example.com',
                    address: '42, Lakeview Society, Pune',
                    symptoms_notes: 'Fever and Cough',
                    registration_source: 'dashboard'
                }),
                responses: { 201: { description: 'Patient registered' }, 400: { description: 'Validation error or duplicate' } }
            }
        },
        '/api/patients/whatsapp': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Register patient via WhatsApp Bot',
                description: 'Registers a new patient. Note: email, address, and symptoms_notes are optional.',
                requestBody: body({
                    child_name: 'Arjun Sharma',
                    gender: 'Male',
                    parent_name: 'Rohit Sharma',
                    mobile: '9876500001',
                    dob: '2022-04-15',
                    email: 'rohit@example.com',
                    address: '42, Lakeview Society, Pune',
                    symptoms_notes: 'Vaccination'
                }),
                responses: { 201: { description: 'Registered' } }
            }
        },
        '/api/patients/form': {
            post: {
                tags: ['Patients'], summary: 'Register patient via Online Form',
                requestBody: body({
                    child_name: 'Arjun Sharma',
                    gender: 'Male',
                    parent_name: 'Rohit Sharma',
                    mobile: '9876500001',
                    alt_mobile: 'SKIP',
                    dob: '2022-04-15',
                    email: 'rohit@example.com',
                    address: '42, Lakeview Society, Mumbai',
                    symptoms_notes: 'Fever'
                }),
                responses: { 201: { description: 'Registered with source=form' } }
            }
        },
        '/api/patients/by-mobile/{mobile}': {
            get: {
                tags: ['WhatsApp Bot Integration'], summary: 'Lookup patient by mobile number',
                parameters: [pathParam('mobile', '9876500001', 'Primary mobile or WA ID')],
                responses: { 200: { description: 'Patient found' }, 404: { description: 'Not found' } }
            }
        },
        '/api/patients/{patient_id}': {
            get: {
                tags: ['Patients'], summary: 'Get patient by DICC ID',
                parameters: [pathParam('patient_id', 'DICC-2026-0001', 'patient_id')],
                responses: { 200: { description: 'Success' } }
            },
            put: {
                tags: ['Patients'], summary: 'Update patient details',
                parameters: [pathParam('patient_id', 'DICC-2026-0001', 'patient_id')],
                requestBody: body({
                    child_name: 'Arjun R. Sharma',
                    address: 'New Address, Pune'
                }, false),
                responses: { 200: { description: 'Updated' } }
            }
        },

        // ══ APPOINTMENTS ══════════════════════════════════════════════════════

        '/api/appointments': {
            get: {
                tags: ['Appointments'], summary: 'List appointments with filters',
                parameters: [
                    queryParam('date', '2026-06-15', null, false),
                    queryParam('patient_id', 'DICC-2026-0001', null, false),
                    queryParam('status', 'CONFIRMED', ['BOOKED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'], false),
                    queryParam('source', 'dashboard', ['dashboard', 'whatsapp', 'form', 'api'], false),
                    queryParam('page', '1', null, false),
                    queryParam('limit', '50', null, false),
                ],
                responses: { 200: { description: 'Paginated list of appointments with enriched patient + slot info' } }
            },
            post: {
                tags: ['Appointments'], summary: 'Book appointment (Dashboard / Admin)',
                requestBody: body({
                    patient_id: 'DICC-2026-0001',
                    appointment_mode: 'OFFLINE',
                    doctor_type: 'PULMONARY',
                    visit_type: 'CONSULTATION',
                    appointment_date: '2026-06-15',
                    slot_id: 'S1',
                    reason: 'Follow-up visit',
                    booking_source: 'dashboard'
                }),
                responses: {
                    201: { description: 'Appointment confirmed' },
                    400: { description: 'Missing required fields or invalid booking_source' },
                    404: { description: 'Patient not found' },
                    409: { description: 'Slot already booked or patient already has appointment on this date' }
                }
            }
        },

        '/api/appointments/whatsapp': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Book via WhatsApp bot (wa_id)',
                requestBody: body({
                    wa_id: '9876543210',
                    doctor_type: 'PULMONARY',
                    visit_type: 'CONSULTATION',
                    appointment_mode: 'OFFLINE',
                    appointment_date: '2026-06-15',
                    slot_id: 'S1',
                    reason: 'Fever since 2 days'
                }),
                responses: {
                    201: { description: 'Appointment confirmed, wa_id stored' },
                    400: { description: 'Missing wa_id / slot_id / doctor_type / appointment_date' },
                    409: { description: 'Not registered / slot taken / already booked today' }
                }
            }
        },

        '/api/appointments/form': {
            post: {
                tags: ['Appointments'], summary: 'Book via public web form (mobile)',
                requestBody: body({
                    mobile: '9876543210',
                    doctor_type: 'PULMONARY',
                    visit_type: 'VACCINATION',
                    appointment_mode: 'OFFLINE',
                    appointment_date: '2026-06-15',
                    slot_id: 'S2',
                    reason: 'Vaccination'
                }),
                responses: {
                    201: { description: 'Appointment confirmed' },
                    409: { description: 'Not registered / slot taken / already booked today' }
                }
            }
        },

        '/api/appointments/stats': {
            get: {
                tags: ['Appointments'], summary: 'Appointment stats (today or by date)',
                parameters: [queryParam('date', new Date().toISOString().split('T')[0], null, false)],
                responses: { 200: { description: 'Stats object' } }
            }
        },

        '/api/appointments/by-mobile/{mobile}': {
            get: {
                tags: ['WhatsApp Bot Integration'], summary: 'Get upcoming appointments by mobile number',
                parameters: [pathParam('mobile', '9876543210', 'Patient mobile number or wa_id')],
                responses: {
                    200: { description: 'Upcoming confirmed/booked appointments for this patient' },
                    404: { description: 'No patient registered for this mobile' }
                }
            }
        },

        '/api/appointments/by-wa/{wa_id}': {
            get: {
                tags: ['WhatsApp Bot Integration'], summary: 'Get upcoming appointments by WhatsApp ID',
                parameters: [pathParam('wa_id', '9876543210', '10-digit mobile or raw wa_id')],
                responses: {
                    200: { description: 'Upcoming appointments' },
                    404: { description: 'Patient not found' }
                }
            }
        },

        '/api/appointments/{appointment_id}': {
            get: {
                tags: ['Appointments'], summary: 'Get single appointment by ID',
                parameters: [pathParam('appointment_id', 'APT-2026-00001', 'appointment_id')],
                responses: {
                    200: { description: 'Appointment with enriched patient and slot details' },
                    404: { description: 'Not found' }
                }
            },
            patch: {
                tags: ['Appointments'], summary: 'Update / reschedule appointment',
                parameters: [pathParam('appointment_id', 'APT-2026-00001', 'appointment_id')],
                requestBody: body({
                    appointment_date: '2026-06-20',
                    slot_id: 'S3',
                    reason: 'Follow-up rescheduled'
                }, false),
                responses: {
                    200: { description: 'Updated' },
                    409: { description: 'Target slot already booked' },
                    404: { description: 'Appointment not found' }
                }
            }
        },

        '/api/appointments/{appointment_id}/cancel': {
            patch: {
                tags: ['Appointments'], summary: 'Cancel appointment',
                parameters: [pathParam('appointment_id', 'APT-2026-00001', 'appointment_id')],
                requestBody: body({
                    cancellation_reason: 'Parent unavailable',
                    cancelled_by: 'dashboard'
                }, false),
                responses: {
                    200: { description: 'Cancelled, slot freed' },
                    409: { description: 'Already cancelled' },
                    404: { description: 'Appointment not found' }
                }
            }
        },

        // ══ SLOTS ═════════════════════════════════════════════════════════════
        '/api/slots/available': {
            get: {
                tags: ['Slots'], summary: 'Get available slots',
                parameters: [
                    queryParam('doctor_type', 'PULMONARY', ['PULMONARY', 'NON_PULMONARY', 'VACCINATION', 'ANY'], true),
                    queryParam('date', '2026-04-01', null, true)
                ],
                responses: { 200: { description: 'Slots array' } }
            }
        },
        '/api/slots/config': {
            get: { tags: ['Slots'], summary: 'Get slot config' },
            put: {
                tags: ['Slots'], summary: 'Update slot config',
                requestBody: body({
                    slots: [
                        { slot_id: 'S1', slot_label: '10:00 AM', start_time: '10:00', end_time: '10:30', session: 'MORNING', is_active: true }
                    ]
                }),
                responses: { 200: { description: 'Updated' } }
            }
        },

        // ══ MRD ═══════════════════════════════════════════════════════════════
        '/api/mrd/{patient_id}': {
            get: {
                tags: ['MRD'], summary: 'Get patient MRD',
                parameters: [pathParam('patient_id', 'DICC-2026-0001', 'patient_id')],
                responses: { 200: { description: 'Full history' } }
            }
        },
        '/api/mrd/entry': {
            post: {
                tags: ['MRD'], summary: 'Add clinical entry',
                requestBody: body({
                    patient_id: 'DICC-2026-0001',
                    appointment_id: 'APT-2026-00001',
                    chief_complaint: 'Cough',
                    diagnosis: 'Common Cold'
                }),
                responses: { 200: { description: 'Added' } }
            }
        },

        // ══ SYSTEM ════════════════════════════════════════════════════════════
        '/api/system/health': {
            get: { tags: ['System'], summary: 'Health check', security: [] }
        },
        '/api/audit/logs': {
            get: {
                tags: ['System'], summary: 'Get audit logs',
                parameters: [
                    queryParam('page', '1'),
                    queryParam('limit', '50')
                ]
            }
        }
    }
};

module.exports = (app) => {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, {
        customSiteTitle: 'Dr. Indu Child Care — API Docs',
        swaggerOptions: {
            persistAuthorization: true,
            displayRequestDuration: true,
            tryItOutEnabled: true,
            filter: true,
        }
    }));
    console.log('📚 Swagger docs  →  http://localhost:5000/api-docs');
};
