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
const queryParam = (name, def, enumValsOrDescription, required = false, description = '') => {
    let enumVals;
    let desc = description;

    if (Array.isArray(enumValsOrDescription)) {
        enumVals = enumValsOrDescription;
    } else if (typeof enumValsOrDescription === 'string') {
        desc = enumValsOrDescription;
    }

    return {
        name,
        in: 'query',
        required,
        description: desc,
        schema: enumVals
            ? { type: 'string', enum: enumVals, default: def }
            : { type: 'string', default: def }
    };
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
    servers: [
        // { url: '/', description: 'Current Origin (Recommended)' },
        //{ url: 'http://localhost:5000/', description: 'Local Development' },
        { url: 'https://api-dr-indu-child-care.brahmaastra.ai/', description: 'Production Server' }
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
                    full_name: 'Staff Name', role: 'admin'
                }),
                responses: { 201: { description: 'Created' } }
            }
        },
        '/api/admin/users/{id}': {
            patch: {
                tags: ['Admin'], summary: 'Update an admin user',
                parameters: [pathParam('id', '66f1c2a3b4d5e6f7890a1234')],
                requestBody: body({ full_name: 'Updated Name', role: 'admin', is_active: true }, false),
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
                    queryParam('search', '', 'Name, wa_id, or ID'),
                    queryParam('source', '', ['whatsapp', 'form', 'dashboard', 'api']),
                    queryParam('status', '', ['PENDING', 'COMPLETE']),
                    queryParam('gender', '', ['Male', 'Female', 'Other']),
                    queryParam('city', ''),
                    queryParam('doctor', '')
                ],
                responses: { 200: { description: 'Success' } }
            },
            post: {
                tags: ['Patients'], summary: 'Register a new patient (General)',
                requestBody: body({
                    salutation: 'Master',
                    first_name: 'Arjun', middle_name: 'Rohit', last_name: 'Sharma',
                    gender: 'Male', mothers_name: 'Anjali Sharma',
                    dob: '2020-05-20', age_years: 3, age_months: 9,
                    birth_time_hours: 10, birth_time_minutes: 30, birth_time_ampm: 'AM',
                    father_name: 'Rohit Sharma', father_mobile: '9876543210', father_occupation: 'Engineer',
                    mother_name: 'Anjali Sharma', mother_mobile: '9876543211',
                    area: 'Bandra', city: 'Mumbai', pin_code: '400050',
                    wa_id: '9876543210', email: 'parent@example.com',
                    doctor: 'Dr. Indu', enrollment_option: 'just_enroll'
                }),
                responses: { 201: { description: 'Registered' } }
            }
        },
        '/api/patients/form': {
            post: {
                tags: ['Patients'], summary: 'Register patient via Online Form',
                requestBody: body({
                    salutation: 'Miss', first_name: 'Sia', last_name: 'Patel',
                    gender: 'Female', dob_unknown: false, dob: '2023-05-15',
                    wa_id: '9123456789', father_name: 'Amit Patel', mother_name: 'Meena Patel',
                    area: 'Colaba', city: 'Mumbai', registration_source: 'form'
                }),
                responses: { 201: { description: 'Registered via form' } }
            }
        },
        '/api/patients/whatsapp': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Register patient via WhatsApp Bot',
                requestBody: body({
                    salutation: 'Master', first_name: 'Arjun', last_name: 'Sharma',
                    gender: 'Male', dob: '2022-01-01', wa_id: '9876543210',
                    father_name: 'Rohit Sharma', registration_source: 'whatsapp'
                }),
                responses: {
                    201: { description: 'Registered via bot' },
                    409: { description: 'Patient already exists with this mobile' }
                }
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
                requestBody: body({
                    salutation: 'Master',
                    first_name: 'Arjun',
                    last_name: 'R. Sharma',
                    father_name: 'Rohit Sharma',
                    mother_name: 'Anjali Sharma',
                    dob: '2020-05-20',
                    area: 'Bandra',
                    city: 'Mumbai',
                    is_active: true
                }, false),
                responses: { 200: { description: 'Updated' } }
            }
        },
        '/api/patients/by-wa/{wa_id}': {
            get: {
                tags: ['WhatsApp Bot Integration'], summary: 'Lookup patient by WhatsApp ID / Number',
                parameters: [pathParam('wa_id', '9876543210')],
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
                    patient_id: 'DICC-2026-0001', doctor_name: 'Dr. Indu',
                    appointment_date: '2026-06-15', slot_id: 'S1',
                    doctor_speciality: 'Pediatrics', visit_type: 'CONSULTATION'
                }),
                responses: { 201: { description: 'Booked' } }
            }
        },
        '/api/appointments/form': {
            post: {
                tags: ['Appointments'], summary: 'Book via public web form (wa_id)',
                requestBody: body({
                    wa_id: '9876543210', doctor_name: 'Dr. Indu',
                    appointment_date: '2026-06-15', slot_id: 'S1',
                    doctor_speciality: 'Pediatrics', visit_type: 'CONSULTATION'
                }),
                responses: { 201: { description: 'Booked' } }
            }
        },
        '/api/appointments/whatsapp': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Book via WhatsApp bot (wa_id)',
                requestBody: body({
                    wa_id: '9876543210', doctor_name: 'Dr. Indu',
                    appointment_date: '2026-06-15', slot_id: 'S1',
                    doctor_speciality: 'Pediatrics', visit_type: 'CONSULTATION'
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
                requestBody: body({
                    appointment_date: '2026-06-20',
                    slot_id: 'S2',
                    doctor_name: 'Dr. Indu',
                    visit_type: 'FOLLOWUP',
                    reason: 'Follow-up consultation'
                }, false),
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
                requestBody: body({ name: 'Dr. Indu', registration_number: 'REG123', speciality: 'Pediatrics' }),
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
                    queryParam('doctor_name', 'Dr. Indu', null, true),
                    queryParam('date', '2026-06-15', null, true),
                    queryParam('doctor_id', 'DOC-00001')
                ],
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/slots/config': {
            get: { tags: ['Slots'], summary: 'Get all slot templates', responses: { 200: { description: 'Success' } } },
            put: {
                tags: ['Slots'], summary: 'Bulk update slot templates',
                requestBody: body({
                    slots: [
                        { slot_id: 'SLOT_1000', slot_label: '10:00 AM', start_time: '10:00', end_time: '10:30', session: 'MORNING' }
                    ]
                }),
                responses: { 200: { description: 'Updated' } }
            }
        },
        '/api/slots/config/add': {
            post: {
                tags: ['Slots'], summary: 'Create a new slot template',
                requestBody: body({
                    slot_label: '12:00 PM',
                    start_time: '12:00',
                    end_time: '12:30',
                    session: 'AFTERNOON'
                }),
                responses: { 201: { description: 'Created' } }
            }
        },
        '/api/slots/config/{slot_id}': {
            delete: {
                tags: ['Slots'], summary: 'Delete a slot template',
                parameters: [pathParam('slot_id', 'SLOT_1000')],
                responses: { 200: { description: 'Deleted' } }
            }
        },
        '/api/slots/daily-update': {
            post: {
                tags: ['Slots'], summary: 'Override a specific slot for a specific day/doctor',
                requestBody: body({
                    slot_id: 'SLOT_1000',
                    slot_date: '2026-06-15',
                    doctor_name: 'Dr. Indu',
                    custom_label: 'Urgent Only',
                    custom_start_time: '10:15'
                }),
                responses: { 200: { description: 'Updated for the day' } }
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
                requestBody: body({
                    wa_id: '9876543210',
                    current_state: 'S30_BOOKING_PREVIEW',
                    session_data: {
                        doctor_name: 'Dr. Indu',
                        doctor_speciality: 'Pediatrics',
                        appointment_date: '2026-06-15',
                        slot_id: 'S1'
                    }
                }, false),
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
    //console.log('📚 Swagger docs (Local) → http://localhost:5000/api-docs');
    console.log('📚 Swagger docs (Prod)  → https://api-dr-indu-child-care.brahmaastra.ai/api-docs');
};
