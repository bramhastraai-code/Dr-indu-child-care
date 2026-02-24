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
    servers: [
        { url: 'http://localhost:5000/', description: 'Local Development' },
        // { url: 'https://api-dr-indu-child-care.brahmaastra.ai/', description: 'Production Server' }
    ],
    components: {
        securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            apiKeyAuth: { type: 'apiKey', name: 'x-api-key', in: 'header' }
        }
    },
    security: [], // Default to no security for all routes since user requested public APIs
    tags: [
        { name: 'Admin', description: 'Admin user management' },
        { name: 'Patients', description: 'Patient registration and lookup' },
        { name: 'Appointments', description: 'Appointment booking, cancellation, rescheduling' },
        { name: 'Doctors', description: 'Doctor management' },
        { name: 'Slots', description: 'Slot availability and configuration' },
        { name: 'MRD', description: 'Medical record documents' },
        { name: 'System', description: 'Health check, config, audit logs' },
        { name: 'WhatsApp Bot Integration', description: 'Complete tools for the WhatsApp bot' },
    ],
    paths: {
        // ══ ADMIN ═════════════════════════════════════════════════════════════
        '/api/admin/login': {
            post: {
                tags: ['Admin'], summary: 'Admin / Secretary login',
                requestBody: body({ username: 'drinduchildcare@gmail.com', password: 'Drindu@1234' }),
                responses: { 200: { description: 'Returns JWT token + user info' } }
            }
        },
        '/api/admin/users': {
            get: {
                tags: ['Admin'], summary: 'List all admin users',
                responses: { 200: { description: 'Success' } }
            },
            post: {
                tags: ['Admin'], summary: 'Create a new admin user',
                requestBody: body({
                    username: 'staff_1', email: 'staff@dicc.com', password: 'Pass@123',
                    full_name: 'Staff Name', role: 'ADMIN'
                }),
                responses: { 201: { description: 'Created' } }
            }
        },
        '/api/admin/users/{id}': {
            patch: {
                tags: ['Admin'], summary: 'Update an admin user',
                parameters: [pathParam('id', 'MONGO_ID')],
                requestBody: body({ full_name: 'Updated Name', role: 'ADMIN', is_active: true }, false),
                responses: { 200: { description: 'Updated' } }
            }
        },

        // ══ PATIENTS ══════════════════════════════════════════════════════════
        '/api/patients': {
            get: {
                tags: ['Patients'], summary: 'List patients with pagination and filters',
                parameters: [
                    queryParam('page', '1'),
                    queryParam('limit', '50'),
                    queryParam('search', '', 'Name, mobile, or ID')
                ],
                responses: { 200: { description: 'Success' } }
            },
            post: {
                tags: ['Patients'], summary: 'Register a new patient (General)',
                requestBody: body({
                    child_name: 'Arjun Sharma', parent_name: 'Rohit Sharma',
                    mobile: '9876543210', dob: '2022-01-01', gender: 'Male'
                }),
                responses: { 201: { description: 'Registered' } }
            }
        },
        '/api/patients/form': {
            post: {
                tags: ['Patients'], summary: 'Register patient via Online Form',
                requestBody: body({
                    child_name: 'Arjun Sharma', parent_name: 'Rohit Sharma',
                    mobile: '9876543210', dob: '2022-01-01', gender: 'Male'
                }),
                responses: { 201: { description: 'Registered via form' } }
            }
        },
        '/api/patients/whatsapp': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Register patient via WhatsApp Bot',
                requestBody: body({
                    child_name: 'Arjun Sharma', parent_name: 'Rohit Sharma',
                    mobile: '9876543210', dob: '2022-01-01', gender: 'Male'
                }),
                responses: { 201: { description: 'Registered via bot' } }
            }
        },
        '/api/patients/{patient_id}': {
            get: {
                tags: ['Patients'], summary: 'Get patient by DICC ID',
                parameters: [pathParam('patient_id', 'DICC-2026-0001')],
                responses: { 200: { description: 'Success' } }
            },
            put: {
                tags: ['Patients'], summary: 'Update patient details',
                parameters: [pathParam('patient_id', 'DICC-2026-0001')],
                requestBody: body({ child_name: 'Arjun R. Sharma' }, false),
                responses: { 200: { description: 'Updated' } }
            }
        },
        '/api/patients/by-mobile/{mobile}': {
            get: {
                tags: ['WhatsApp Bot Integration'], summary: 'Lookup patient by mobile number',
                parameters: [pathParam('mobile', '9876543210')],
                responses: { 200: { description: 'Success' } }
            }
        },

        // ══ APPOINTMENTS ══════════════════════════════════════════════════════
        '/api/appointments': {
            get: {
                tags: ['Appointments'], summary: 'List appointments with filters',
                parameters: [
                    queryParam('date', '2026-06-15'),
                    queryParam('doctor_id', 'DOC-00001'),
                    queryParam('status', 'CONFIRMED', ['BOOKED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'])
                ],
                responses: { 200: { description: 'Success' } }
            },
            post: {
                tags: ['Appointments'], summary: 'Book appointment (Dashboard / Admin)',
                requestBody: body({
                    patient_id: 'DICC-2026-0001', doctor_id: 'DOC-00001',
                    appointment_date: '2026-06-15', slot_id: 'S1', doctor_type: 'CONSULTATION'
                }),
                responses: { 201: { description: 'Booked' } }
            }
        },
        '/api/appointments/form': {
            post: {
                tags: ['Appointments'], summary: 'Book via public web form (mobile)',
                requestBody: body({
                    mobile: '9876543210', doctor_id: 'DOC-00001',
                    appointment_date: '2026-06-15', slot_id: 'S1', doctor_type: 'CONSULTATION'
                }),
                responses: { 201: { description: 'Booked' } }
            }
        },
        '/api/appointments/whatsapp': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Book via WhatsApp bot (wa_id)',
                requestBody: body({
                    wa_id: '9876543210', doctor_id: 'DOC-00001',
                    appointment_date: '2026-06-15', slot_id: 'S1', doctor_type: 'CONSULTATION'
                }),
                responses: { 201: { description: 'Booked' } }
            }
        },
        '/api/appointments/stats': {
            get: {
                tags: ['Appointments'], summary: 'Appointment stats (today or by date)',
                parameters: [queryParam('date', '2026-06-15')],
                responses: { 200: { description: 'Stats returned' } }
            }
        },
        '/api/appointments/{appointment_id}': {
            get: {
                tags: ['Appointments'], summary: 'Get single appointment by ID',
                parameters: [pathParam('appointment_id', 'APT-2026-00001')],
                responses: { 200: { description: 'Success' } }
            },
            patch: {
                tags: ['Appointments'], summary: 'Update / reschedule appointment',
                parameters: [pathParam('appointment_id', 'APT-2026-00001')],
                requestBody: body({ appointment_date: '2026-06-20', slot_id: 'S2' }, false),
                responses: { 200: { description: 'Updated' } }
            }
        },
        '/api/appointments/{appointment_id}/cancel': {
            patch: {
                tags: ['Appointments'], summary: 'Cancel appointment',
                parameters: [pathParam('appointment_id', 'APT-2026-00001')],
                requestBody: body({ cancellation_reason: 'Patient changed mind' }, false),
                responses: { 200: { description: 'Cancelled' } }
            }
        },
        '/api/appointments/by-mobile/{mobile}': {
            get: {
                tags: ['WhatsApp Bot Integration'], summary: 'Get upcoming appointments by mobile number',
                parameters: [pathParam('mobile', '9876543210')],
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/appointments/by-wa/{wa_id}': {
            get: {
                tags: ['WhatsApp Bot Integration'], summary: 'Get upcoming appointments by WhatsApp ID',
                parameters: [pathParam('wa_id', '9876543210')],
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/appointments/reminders/pending-24h': {
            get: {
                tags: ['WhatsApp Bot Integration'], summary: 'Get appointments for tomorrow (for 24h reminders)',
                responses: { 200: { description: 'List of reminders' } }
            }
        },
        '/api/appointments/reminders/{appointment_id}/mark-sent': {
            patch: {
                tags: ['WhatsApp Bot Integration'], summary: 'Mark reminder as sent (updates timestamp)',
                parameters: [pathParam('appointment_id', 'APT-2026-00001')],
                responses: { 200: { description: 'Updated' } }
            }
        },

        // ══ DOCTORS ═══════════════════════════════════════════════════════════
        '/api/doctors': {
            get: {
                tags: ['Doctors'], summary: 'List all doctors',
                responses: { 200: { description: 'Success' } }
            },
            post: {
                tags: ['Doctors'], summary: 'Create a new doctor profile',
                requestBody: body({ name: 'Dr. Indu', registration_number: 'REG123', specializations: ['Pediatrics'] }),
                responses: { 201: { description: 'Created' } }
            }
        },
        '/api/doctors/{doctor_id}': {
            get: {
                tags: ['Doctors'], summary: 'Get doctor by ID',
                parameters: [pathParam('doctor_id', 'DOC-00001')],
                responses: { 200: { description: 'Success' } }
            },
            patch: {
                tags: ['Doctors'], summary: 'Update doctor profile',
                parameters: [pathParam('doctor_id', 'DOC-00001')],
                requestBody: body({ name: 'Dr. Indu (Updated)' }, false),
                responses: { 200: { description: 'Updated' } }
            },
            delete: {
                tags: ['Doctors'], summary: 'Delete a doctor profile',
                parameters: [pathParam('doctor_id', 'DOC-00001')],
                responses: { 200: { description: 'Deleted' } }
            }
        },

        // ══ SLOTS ═════════════════════════════════════════════════════════════
        '/api/slots/available': {
            get: {
                tags: ['Slots'], summary: 'Get available slots',
                parameters: [
                    queryParam('doctor_type', 'CONSULTATION', ['CONSULTATION', 'VACCINATION'], true),
                    queryParam('date', '2026-06-15', null, true),
                    queryParam('doctor_id', 'DOC-00001')
                ],
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/slots/config': {
            get: { tags: ['Slots'], summary: 'Get slot config', responses: { 200: { description: 'Success' } } },
            put: {
                tags: ['Slots'], summary: 'Update slot config',
                requestBody: body({
                    slots: [
                        { slot_id: 'S1', slot_label: '10:00 AM', start_time: '10:00', end_time: '10:30', session: 'MORNING' }
                    ]
                }),
                responses: { 200: { description: 'Updated' } }
            }
        },

        // ══ MRD ═══════════════════════════════════════════════════════════════
        '/api/mrd/{patient_id}': {
            get: {
                tags: ['MRD'], summary: 'Get patient MRD',
                parameters: [pathParam('patient_id', 'DICC-2026-0001')],
                responses: { 200: { description: 'Full history' } }
            }
        },
        '/api/mrd/entry': {
            post: {
                tags: ['MRD'], summary: 'Add clinical entry',
                requestBody: body({ patient_id: 'DICC-2026-0001', appointment_id: 'APT-2026-00001', diagnosis: 'Normal' }),
                responses: { 201: { description: 'Added' } }
            }
        },
        '/api/mrd/appointment/{appointment_id}': {
            get: {
                tags: ['MRD'], summary: 'Get MRD entry by appointment ID',
                parameters: [pathParam('appointment_id', 'APT-2026-00001')],
                responses: { 200: { description: 'Success' } }
            }
        },

        // ══ BOT ═══════════════════════════════════════════════════════════════
        '/api/bot/session/{wa_id}': {
            get: {
                tags: ['WhatsApp Bot Integration'], summary: 'Get active bot session',
                parameters: [pathParam('wa_id', '9876543210')],
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/bot/session/create': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Create a new bot session',
                requestBody: body({ wa_id: '9876543210' }),
                responses: { 201: { description: 'Created' } }
            }
        },
        '/api/bot/session/update': {
            patch: {
                tags: ['WhatsApp Bot Integration'], summary: 'Update bot session state/data',
                requestBody: body({ wa_id: '9876543210', current_state: 'WELCOME' }, false),
                responses: { 200: { description: 'Updated' } }
            }
        },
        '/api/bot/escalate': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Escalate to human support',
                requestBody: body({ wa_id: '9876543210', reason: 'N/A' }),
                responses: { 200: { description: 'Escalated' } }
            }
        },
        '/api/bot/interactions/unregistered': {
            get: {
                tags: ['WhatsApp Bot Integration'], summary: 'Get unregistered bot interactions (leads)',
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/bot/chat/log': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Log chat message (for registered patients)',
                requestBody: body({ wa_id: '9876543210', message: 'Hello' }),
                responses: { 201: { description: 'Logged' } }
            }
        },
        '/api/bot/chat/history/{wa_id}': {
            get: {
                tags: ['WhatsApp Bot Integration'], summary: 'Get last 10 chat messages',
                parameters: [pathParam('wa_id', '9876543210')],
                responses: { 200: { description: 'History' } }
            }
        },

        // ══ SYSTEM ════════════════════════════════════════════════════════════
        '/api/system/health': {
            get: { tags: ['System'], summary: 'Health check', responses: { 200: { description: 'Success' } } }
        },
        '/api/config': {
            get: { tags: ['System'], summary: 'Get clinic system configuration', responses: { 200: { description: 'Success' } } },
            patch: {
                tags: ['System'], summary: 'Update clinic system configuration',
                requestBody: body({ clinic_name: 'Dr. Indu Child Care' }, false),
                responses: { 200: { description: 'Updated' } }
            }
        },
        '/api/audit/logs': {
            get: {
                tags: ['System'], summary: 'Get system audit logs',
                parameters: [queryParam('page', '1'), queryParam('limit', '50')],
                responses: { 200: { description: 'Success' } }
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
    console.log('📚 Swagger docs (Local) → http://localhost:5000/api-docs');
    // console.log('📚 Swagger docs (Prod)  → https://api-dr-indu-child-care.brahmaastra.ai/api-docs');
};
