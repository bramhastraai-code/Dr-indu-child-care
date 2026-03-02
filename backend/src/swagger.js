const swaggerUi = require('swagger-ui-express');

// ── Helper: build a requestBody with a pre-filled example and auto-schema ───────
const body = (example, required = true, description = '') => {
    // Basic auto-schema generator from example
    const properties = {};
    if (example && typeof example === 'object' && !Array.isArray(example)) {
        Object.keys(example).forEach(key => {
            const val = example[key];
            const type = Array.isArray(val) ? 'array' : (val === null ? 'string' : typeof val);
            properties[key] = { type };
        });
    }

    return {
        required,
        description,
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    properties: Object.keys(properties).length > 0 ? properties : undefined
                },
                example                         // ← Swagger renders THIS as the editable text
            }
        }
    };
};

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
        version: '1.1.0',
        description: `
**Complete API reference** for the WhatsApp Bot integration and Clinic Management Dashboard.

### Quick Start
1. All APIs are **public** and do not require authentication for development/integration.
2. Expand any endpoint → **Try it out** → **Execute**.
        `,
    },
    servers: [
        { url: 'https://api-dr-indu-child-care.brahmaastra.ai/', description: 'Production Server' },
        //{ url: 'http://localhost:5000/', description: 'Local Development' }
    ],
    components: {},
    security: [],
    tags: [
        { name: 'Admin', description: 'Admin user management' },
        { name: 'Patients', description: 'Patient registration and lookup' },
        { name: 'Appointments', description: 'Booking and session management' },
        { name: 'Token System', description: 'Queue management and clinic display' },
        { name: 'Doctors', description: 'Doctor profile management' },
        { name: 'Doctor Availability', description: 'Real-time status, ETA and Workflows' },
        { name: 'Slots', description: 'Master templates and daily availability' },
        { name: 'Messaging', description: 'Outbound message queue and templates' },
        { name: 'MRD', description: 'Medical record documents' },
        { name: 'System', description: 'Health check, system config, and logs' },
        { name: 'Reports & Analytics', description: 'Dashboard stats and reporting' },
        { name: 'WhatsApp Bot Integration', description: 'Specialized tools for the bot flow' },
    ],
    paths: {
        // ══ ADMIN ═════════════════════════════════════════════════════════════
        '/api/admin/login': {
            post: {
                tags: ['Admin'], summary: 'Admin / Secretary login',
                requestBody: body({ username: 'drinduchildcare@gmail.com', password: 'Drindu@1234' }),
                responses: { 200: { description: 'Returns JWT' } }
            }
        },
        '/api/admin/refresh-token': {
            post: {
                tags: ['Admin'], summary: 'Refresh access token',
                responses: { 200: { description: 'New token issued' } }
            }
        },
        '/api/admin/logout': {
            post: {
                tags: ['Admin'], summary: 'Logout admin user',
                responses: { 200: { description: 'Logged out' } }
            }
        },
        '/api/admin/profile': {
            get: {
                tags: ['Admin'], summary: 'Get an admin profile',
                description: 'Fetches profile by user_id or username (Public). If password provided, it will be verified.',
                parameters: [
                    queryParam('user_id', '', 'Lookup by MongoDB ID'),
                    queryParam('username', '', 'Lookup by username'),
                    queryParam('password', '', 'Verify password')
                ],
                responses: { 200: { description: 'Success' } }
            },
            patch: {
                tags: ['Admin'], summary: 'Update an admin profile',
                description: 'Verify current_password to update fields. (Public mode)',
                requestBody: body({
                    user_id: '69986a708eec207044998a82',
                    username: 'admin',
                    current_password: 'Drindu@1234',
                    full_name: 'Dr. Indu',
                    email: 'drinduchildcare@gmail.com',
                    new_password: 'onlyIfChanging'
                }, false),
                responses: { 200: { description: 'Updated' } }
            }
        },
        '/api/admin/overview': {
            get: {
                tags: ['Admin'], summary: 'System overview stats',
                description: 'Returns counts of users, doctors, patients, and audit logs.',
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/admin/roles': {
            get: {
                tags: ['Admin'], summary: 'Get available system roles',
                description: 'Returns list of roles (superadmin, admin, staff) with descriptions.',
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/admin/users': {
            get: {
                tags: ['Admin'], summary: 'List all admin users',
                responses: { 200: { description: 'Success' } }
            },
            post: {
                tags: ['Admin'], summary: 'Create a new admin user',
                description: 'Roles: superadmin, admin, staff',
                requestBody: body({
                    username: 'staff_dicc_003',
                    email: 'staff3@dicc.com',
                    password: 'Pass@123',
                    full_name: 'Amit Kumar (Receptionist)',
                    role: 'staff',
                    permissions: ['edit_appointments', 'view_mrd_summary']
                }),
                responses: { 201: { description: 'Created' } }
            }
        },
        '/api/admin/users/{user_id}': {
            patch: {
                tags: ['Admin'], summary: 'Update an admin user',
                parameters: [pathParam('user_id', '69986a708eec207044998a82')],
                requestBody: body({ full_name: 'Updated Name', role: 'superadmin', is_active: true, permissions: [], password: 'resetPassword123' }, false),
                responses: { 200: { description: 'Updated' } }
            },
            delete: {
                tags: ['Admin'], summary: 'Delete (Deactivate) admin user',
                parameters: [pathParam('user_id', '69986a708eec207044998a82')],
                responses: { 200: { description: 'Deleted' } }
            }
        },

        // ══ PATIENTS ══════════════════════════════════════════════════════════
        '/api/patients': {
            get: {
                tags: ['Patients'], summary: 'List patients with pagination and filters',
                parameters: [
                    queryParam('page', '1'), queryParam('limit', '50'),
                    queryParam('search', '', 'Name, wa_id, or ID'),
                    queryParam('source', '', ['whatsapp', 'form', 'dashboard', 'api']),
                    queryParam('gender', '', ['Male', 'Female', 'Other'])
                ],
                responses: { 200: { description: 'Success' } }
            },
            post: {
                tags: ['Patients'], summary: 'Register a new patient (General / Dashboard)',
                requestBody: body({
                    salutation: 'Master',
                    first_name: 'Arjun',
                    middle_name: 'Rohit',
                    last_name: 'Sharma',
                    gender: 'Male',
                    dob: '2020-05-20',
                    mother_name: 'Anjali Sharma',
                    father_name: 'Rohit Sharma',
                    father_mobile: '9876543210',
                    mother_mobile: null,
                    parent_mobile: '9876543210',
                    wa_id: '9876543210',
                    email: 'rohit@example.com',
                    address: 'Kothrud, Pune',
                    city: 'Pune',
                    state: 'Maharashtra',
                    pin_code: '411038',
                    communication_preference: 'whatsapp',
                    doctor: 'Dr. Indu',
                    remarks: 'New patient from campaign',
                    registration_source: 'dashboard',
                    enrollment_option: 'just_enroll'
                }),
                responses: { 201: { description: 'Created' } }
            }
        },
        '/api/patients/form': {
            post: {
                tags: ['Patients'], summary: 'Register patient via Online Form',
                requestBody: body({
                    salutation: 'Master',
                    first_name: 'Arjun',
                    middle_name: 'Rohit',
                    last_name: 'Sharma',
                    gender: 'Male',
                    dob: '2020-05-20',
                    mother_name: 'Anjali Sharma',
                    father_name: 'Rohit Sharma',
                    father_mobile: '9876543210',
                    mother_mobile: null,
                    parent_mobile: '9876543210',
                    wa_id: '9876543210',
                    email: 'rohit@example.com',
                    address: 'Kothrud, Pune',
                    city: 'Pune',
                    state: 'Maharashtra',
                    pin_code: '411038',
                    communication_preference: 'whatsapp',
                    doctor: 'Dr. Indu',
                    remarks: 'New patient from campaign',
                    registration_source: 'form',
                    enrollment_option: 'just_enroll'
                }),
                responses: { 201: { description: 'Registered via form' } }
            }
        },
        '/api/patients/whatsapp': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Register patient via WhatsApp Bot',
                requestBody: body({
                    first_name: 'Arjun',
                    last_name: 'Sharma',
                    gender: 'Male',
                    wa_id: '9876543210',
                    registration_source: 'whatsapp',
                    mother_name: 'Anjali Sharma',
                    father_name: 'Rohit Sharma'
                }),
                responses: { 201: { description: 'Registered via bot' } }
            }
        },
        '/api/patients/{patient_id}': {
            get: { tags: ['Patients'], summary: 'Get patient by DICC ID', parameters: [pathParam('patient_id', 'DICC-2026-0001')], responses: { 200: { description: 'Success' } } },
            put: {
                tags: ['Patients'], summary: 'Update patient details',
                parameters: [pathParam('patient_id', 'DICC-2026-0001')],
                requestBody: body({
                    first_name: 'Arjun',
                    last_name: 'Sharma',
                    is_active: true,
                    remarks: 'Updated contact details',
                    email: 'updated@example.com'
                }, false),
                responses: { 200: { description: 'Updated' } }
            }
        },
        '/api/patients/{patient_id}/photo': {
            patch: {
                tags: ['Patients'], summary: 'Upload patient photo (Base64)',
                parameters: [pathParam('patient_id', 'DICC-2026-0001')],
                requestBody: body({ photo: 'data:image/jpeg;base64,...' }),
                responses: { 200: { description: 'Photo updated' } }
            }
        },
        '/api/patients/by-wa/{wa_id}': {
            get: { tags: ['WhatsApp Bot Integration'], summary: 'Lookup patient by WhatsApp Number', parameters: [pathParam('wa_id', '9876543210')], responses: { 200: { description: 'Success' } } }
        },

        // ══ APPOINTMENTS ══════════════════════════════════════════════════════
        '/api/appointments': {
            get: {
                tags: ['Appointments'], summary: 'List and filter appointments',
                parameters: [queryParam('date', '2026-06-15'), queryParam('doctor_id', ''), queryParam('status', 'CONFIRMED')],
                responses: { 200: { description: 'Success' } }
            },
            post: {
                tags: ['Appointments'], summary: 'Book appointment (Dashboard/Admin)',
                requestBody: body({
                    patient_id: 'DICC-2026-0001',
                    doctor_name: 'Dr. Indu',
                    appointment_date: '2026-06-15',
                    slot_id: 'S1',
                    visit_type: 'CONSULTATION',
                    appointment_mode: 'OFFLINE'
                }),
                responses: { 201: { description: 'Booked' } }
            }
        },
        '/api/appointments/form': {
            post: {
                tags: ['Appointments'], summary: 'Book via public web form (Simplified)',
                requestBody: body({
                    wa_id: '9175152244',
                    doctor_name: 'Dr. Indu',
                    appointment_date: '2026-06-15',
                    slot_id: 'S1',
                    visit_type: 'CONSULTATION',
                    appointment_mode: 'OFFLINE'
                }),
                responses: { 201: { description: 'Booked' } }
            }
        },
        '/api/appointments/whatsapp': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Book via WhatsApp bot (wa_id)',
                requestBody: body({
                    wa_id: '9876543210',
                    doctor_name: 'Dr. Indu',
                    appointment_date: '2026-06-15',
                    slot_id: 'S1',
                    visit_type: 'CONSULTATION',
                    appointment_mode: 'OFFLINE',
                    reason: 'Cold and Fever'
                }),
                responses: { 201: { description: 'Booked' } }
            }
        },
        '/api/appointments/by-wa/{wa_id}': {
            get: {
                tags: ['WhatsApp Bot Integration'],
                summary: 'Lookup upcoming appointments by WhatsApp number',
                parameters: [pathParam('wa_id', '9876543210')],
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/appointments/stats': {
            get: { tags: ['Appointments'], summary: 'Appointment summary for date', parameters: [queryParam('date', '2026-06-15')], responses: { 200: { description: 'Stats returned' } } }
        },
        '/api/appointments/{appointment_id}': {
            get: { tags: ['Appointments'], summary: 'Get single appointment details', parameters: [pathParam('appointment_id', 'APT-2026-00001')], responses: { 200: { description: 'Success' } } },
            patch: {
                tags: ['Appointments'], summary: 'Update / Reschedule appointment',
                parameters: [pathParam('appointment_id', 'APT-2026-00001')],
                requestBody: body({ appointment_date: '2026-06-16', slot_id: 'S2' }, false),
                responses: { 200: { description: 'Updated' } }
            }
        },
        '/api/appointments/{appointment_id}/cancel': {
            patch: {
                tags: ['Appointments'], summary: 'Cancel appointment',
                parameters: [pathParam('appointment_id', 'APT-2026-00001')],
                requestBody: body({ cancellation_reason: 'Patient traveling' }, false),
                responses: { 200: { description: 'Cancelled' } }
            }
        },
        '/api/appointments/{appointment_id}/complete': {
            patch: { tags: ['Appointments'], summary: 'Mark as Completed', parameters: [pathParam('appointment_id', 'APT-2026-00001')], responses: { 200: { description: 'Completed' } } }
        },
        '/api/appointments/{appointment_id}/no-show': {
            patch: { tags: ['Appointments'], summary: 'Mark as No-Show (Penalty logged)', parameters: [pathParam('appointment_id', 'APT-2026-00001')], responses: { 200: { description: 'Recorded' } } }
        },

        // ══ TOKEN SYSTEM ══════════════════════════════════════════════════════
        '/api/appointments/book-with-token': {
            post: {
                tags: ['Token System'], summary: 'Book appointment + Assign Queue Token',
                requestBody: body({
                    patient_id: 'DICC-2026-0001',
                    doctor_id: 'DOC-00007',
                    appointment_date: '2026-06-15',
                    slot_id: 'S1',
                    visit_type: 'CONSULTATION',
                    booking_source: 'dashboard'
                }),
                responses: { 201: { description: 'Booked + Token generated' } }
            }
        },
        '/api/appointments/daily-tokens': {
            get: {
                tags: ['Token System'], summary: 'List tokens by doctor/date',
                parameters: [queryParam('date', '2026-06-15'), queryParam('doctor_id', '')],
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/appointments/clinic-display': {
            get: { tags: ['Token System'], summary: '📺 Public Display Board Data', parameters: [queryParam('date', '2026-06-15')], responses: { 200: { description: 'Clinic board status' } } }
        },
        '/api/appointments/next-token/{doctor_id}': {
            get: { tags: ['Token System'], summary: 'Advance Queue (Next Patient)', parameters: [pathParam('doctor_id', 'DOC-00007')], responses: { 200: { description: 'Success' } } }
        },
        '/api/appointments/token/{token}/check-in': {
            post: {
                tags: ['Token System'], summary: 'Mark patient as Physically Arrived',
                parameters: [pathParam('token', '1')],
                requestBody: body({ doctor_id: 'DOC-00007', date: '2026-06-15' }),
                responses: { 200: { description: 'Checked in' } }
            }
        },
        '/api/appointments/token/{token}/status': {
            patch: {
                tags: ['Token System'], summary: 'Manual token status override',
                parameters: [pathParam('token', '1')],
                requestBody: body({
                    status: 'COMPLETED',
                    doctor_id: 'DOC-00007',
                    date: '2026-06-15'
                }),
                responses: { 200: { description: 'Updated' } }
            }
        },
        '/api/appointments/token-status/{token}': {
            get: {
                tags: ['Token System', 'WhatsApp Bot Integration'], summary: 'Patient Self-Check (Position)',
                parameters: [pathParam('token', '1'), queryParam('doctor_id', '', 'Doctor ID (Required)', true), queryParam('date', '2026-06-15')],
                responses: { 200: { description: 'Queue position' } }
            }
        },
        '/api/appointments/auto-reschedule': {
            post: { tags: ['Token System'], summary: 'Move missed token to next available slot', requestBody: body({ appointment_id: 'APT-001' }), responses: { 200: { description: 'Moved' } } }
        },

        // ══ DOCTORS ═══════════════════════════════════════════════════════════
        '/api/doctors': {
            get: { tags: ['Doctors', 'WhatsApp Bot Integration'], summary: 'List all doctors', responses: { 200: { description: 'Success' } } },
            post: {
                tags: ['Doctors'], summary: 'Create doctor profile',
                requestBody: body({
                    name: 'Dr. Indu',
                    speciality: 'Pediatrics',
                    qualification: 'MBBS, MD',
                    experience: '15 Years',
                    available_slots: {
                        "1": ["S1", "S2"],
                        "2": ["S1", "S2"]
                    }
                }),
                responses: { 201: { description: 'Created' } }
            }
        },
        '/api/doctors/{doctor_id}': {
            get: { tags: ['Doctors'], summary: 'Get doctor details', parameters: [pathParam('doctor_id', 'DOC-00007')], responses: { 200: { description: 'Success' } } },
            patch: {
                tags: ['Doctors'], summary: 'Update doctor profile',
                parameters: [pathParam('doctor_id', 'DOC-00007')],
                requestBody: body({ name: 'Dr. Indu (Updated)' }, false),
                responses: { 200: { description: 'Updated' } }
            },
            delete: { tags: ['Doctors'], summary: 'Delete doctor profile', parameters: [pathParam('doctor_id', 'DOC-00007')], responses: { 200: { description: 'Deleted' } } }
        },

        // ══ DOCTOR AVAILABILITY ═══════════════════════════════════════════════
        '/api/doctor/availability/update': {
            post: {
                tags: ['Doctor Availability'], summary: 'Update status/ETA (Triggers patient alerts)',
                requestBody: body({
                    doctor_id: 'DOC-00007',
                    status: 'LATE',
                    eta_minutes: 30,
                    eta_time: '10:45 AM',
                    notes: 'Dr. Indu is delayed due to surgery at other hospital',
                    date: '2026-06-15'
                }),
                responses: { 200: { description: 'Updated + Workflow results' } }
            }
        },
        '/api/doctor/availability/{doctor_id}': {
            get: {
                tags: ['Doctor Availability', 'WhatsApp Bot Integration'], summary: 'Real-time status and queue counts',
                parameters: [pathParam('doctor_id', 'DOC-00007'), queryParam('date', '2026-06-15')],
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/doctor/availability/{doctor_id}/status': {
            patch: {
                tags: ['Doctor Availability'], summary: 'Quick status patch',
                parameters: [pathParam('doctor_id', 'DOC-00007')],
                requestBody: body({ status: 'PRESENT', notes: 'Arrived at clinic' }),
                responses: { 200: { description: 'Updated' } }
            }
        },
        '/api/doctor/availability/{doctor_id}/eta': {
            patch: {
                tags: ['Doctor Availability'], summary: 'Quick ETA update',
                parameters: [pathParam('doctor_id', 'DOC-00007')],
                requestBody: body({ eta_minutes: 15, eta_time: '11:00 AM', reason: 'Consultation running long' }),
                responses: { 200: { description: 'Updated' } }
            }
        },
        '/api/doctor/late-checkin': {
            post: {
                tags: ['Doctor Availability'], summary: 'Log late check-in event',
                requestBody: body({
                    doctor_id: 'DOC-00007',
                    eta_minutes: 30,
                    reason: 'Emergency case at other hospital'
                }),
                responses: { 201: { description: 'Logged' } }
            }
        },
        '/api/doctor/late-checkins/{doctor_id}': {
            get: { tags: ['Doctor Availability'], summary: 'History of late arrivals', parameters: [pathParam('doctor_id', 'DOC-00007')], responses: { 200: { description: 'History' } } }
        },
        '/api/doctor/availability-dashboard/{doctor_id}': {
            get: { tags: ['Doctor Availability'], summary: 'Full Dashboard (Stats + Tokens)', parameters: [pathParam('doctor_id', 'DOC-00007')], responses: { 200: { description: 'Dashboard data' } } }
        },

        // ══ SLOTS ═════════════════════════════════════════════════════════════
        '/api/slots/available': {
            get: {
                tags: ['Slots', 'WhatsApp Bot Integration'], summary: 'Get available slots',
                parameters: [queryParam('doctor_name', 'Dr. Indu', null, true), queryParam('date', '2026-06-15', null, true)],
                responses: {
                    200: {
                        description: 'Success',
                        content: {
                            'application/json': {
                                example: {
                                    success: true,
                                    date: '2026-06-15',
                                    formatted_date: '2026-06-15',
                                    doctor_name: 'Dr. Indu',
                                    doctor_id: 'DOC-00008',
                                    doctor_speciality: 'Pediatrics',
                                    data: [
                                        { slot_id: 'SLOT_0100', label: 'Dr. Indu - 01:00 AM', session: 'AFTERNOON', start_time: '01:00', end_time: '01:30' },
                                        { slot_id: 'SLOT_0900', label: 'Dr. Indu - 09:00 AM', session: 'MORNING', start_time: '09:00', end_time: '09:30' },
                                        { slot_id: 'SLOT_1030', label: 'Dr. Indu - 10:30 AM', session: 'MORNING', start_time: '10:30', end_time: '11:00' },
                                        { slot_id: 'SLOT_1200', label: 'Dr. Indu - 12:00 PM', session: 'AFTERNOON', start_time: '12:00', end_time: '12:30' }
                                    ]
                                }
                            }
                        }
                    }
                }
            }
        },
        '/api/slots/config': {
            get: {
                tags: ['Slots'], summary: 'Get all slot templates',
                responses: {
                    200: {
                        description: 'Success',
                        content: {
                            'application/json': {
                                example: {
                                    success: true,
                                    count: 11,
                                    data: [
                                        {
                                            name: 'Dr. Indu',
                                            is_doctor: true,
                                            slot_count: 6,
                                            slots: [
                                                { slot_id: 'SLOT_0100', label: '01:00 AM', time: '01:00 - 01:30', session: 'AFTERNOON', active_days: [1, 2, 3, 4, 5, 6] }
                                            ]
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }
            },
            put: {
                tags: ['Slots'], summary: 'Bulk update slot templates',
                requestBody: body({
                    slots: [
                        { slot_id: 'SLOT_0900', slot_label: '09:00 AM', start_time: '09:00', end_time: '09:30', session: 'MORNING' },
                        { slot_id: 'SLOT_0930', slot_label: '09:30 AM', start_time: '09:30', end_time: '10:00', session: 'MORNING' }
                    ]
                }),
                responses: { 200: { description: 'Updated' } }
            }
        },
        '/api/slots/config/add': {
            post: {
                tags: ['Slots'], summary: 'Create new slot template',
                requestBody: body({ slot_label: '12:00 PM', start_time: '12:00', end_time: '12:30', session: 'AFTERNOON' }),
                responses: { 201: { description: 'Created' } }
            }
        },
        '/api/slots/config/{slot_id}': {
            delete: { tags: ['Slots'], summary: 'Delete template', parameters: [pathParam('slot_id', 'SLOT_0100')], responses: { 200: { description: 'Deleted' } } }
        },
        '/api/slots/daily-update': {
            post: {
                tags: ['Slots'], summary: 'Override slot for a day/doctor',
                requestBody: body({ slot_id: 'SLOT_0100', slot_date: '2026-06-15', doctor_name: 'Dr. Indu', custom_label: 'Urgent' }),
                responses: { 200: { description: 'Updated' } }
            }
        },

        // ══ MESSAGING ═════════════════════════════════════════════════════════
        '/api/messages/doctor/late-alert': {
            post: {
                tags: ['Messaging'], summary: 'Queue manual doctor late alerts',
                requestBody: body({ doctor_name: 'Dr. Indu', minutes_late: 30, affected_appointments: [] }),
                responses: { 200: { description: 'Queued' } }
            }
        },
        '/api/messages/messages/pending': {
            get: { tags: ['Messaging', 'WhatsApp Bot Integration'], summary: 'Poll pending messages (For bot)', responses: { 200: { description: 'List of formatted messages' } } }
        },
        '/api/messages/messages/{queue_id}/status': {
            patch: { tags: ['Messaging', 'WhatsApp Bot Integration'], summary: 'Update delivery status', parameters: [pathParam('queue_id', 'MQ-123')], requestBody: body({ status: 'SENT' }), responses: { 200: { description: 'Updated' } } }
        },

        // ══ MRD ═══════════════════════════════════════════════════════════════
        '/api/mrd/{patient_id}': {
            get: { tags: ['MRD'], summary: 'Get patient history', parameters: [pathParam('patient_id', 'DICC-2026-0001')], responses: { 200: { description: 'Full history' } } }
        },
        '/api/mrd/entry': {
            post: {
                tags: ['MRD'], summary: 'Add clinical entry (Diagnosis/Prescription)',
                requestBody: body({
                    patient_id: 'DICC-2026-0001',
                    appointment_id: 'APT-2026-00001',
                    diagnosis: 'Viral Fever with Cough',
                    weight: '12kg',
                    temperature: '101 F',
                    spo2: '98%',
                    pulse: '80 bpm',
                    head_circumference: '45 cm',
                    symptoms: ['Fever', 'Cough', 'Body ache'],
                    prescription: 'Tab. Paracetamol 250mg TDS x 3 days',
                    advice: 'Take plenty of fluids and rest.',
                    recorded_by: 'Dr. Indu',
                    attachments: [
                        { url: 'https://example.com/xray.jpg', name: 'Chest X-Ray', file_type: 'image/jpeg' }
                    ]
                }),
                responses: { 201: { description: 'Added' } }
            }
        },
        '/api/mrd/appointment/{appointment_id}': {
            get: { tags: ['MRD'], summary: 'Get entry by appointment ID', parameters: [pathParam('appointment_id', 'APT-001')], responses: { 200: { description: 'Success' } } }
        },
        '/api/mrd/entry/{id}/lock': {
            patch: { tags: ['MRD'], summary: 'Lock entry (Prevent further edits)', parameters: [pathParam('id', '69a16dc506a8fb8f7562879f')], responses: { 200: { description: 'Locked' } } }
        },
        '/api/mrd/entry/{id}/attachment': {
            post: {
                tags: ['MRD'], summary: 'Upload attachment to entry',
                parameters: [pathParam('id', '69a16dc506a8fb8f7562879f')],
                requestBody: body({ url: 'base64_string_here', name: 'Prescription Scan', file_type: 'image/jpeg' }),
                responses: { 200: { description: 'Uploaded' } }
            }
        },

        // ══ BOT ═══════════════════════════════════════════════════════════════
        '/api/bot/session/{wa_id}': { get: { tags: ['WhatsApp Bot Integration'], summary: 'Get active bot session', parameters: [pathParam('wa_id', '9876543210')], responses: { 200: { description: 'Success' } } } },
        '/api/bot/session/create': { post: { tags: ['WhatsApp Bot Integration'], summary: 'Create bot session', requestBody: body({ wa_id: '9876543210' }), responses: { 201: { description: 'Created' } } } },
        '/api/bot/session/update': {
            patch: {
                tags: ['WhatsApp Bot Integration'], summary: 'Update state / context',
                requestBody: body({
                    wa_id: '9876543210',
                    current_state: 'APPOINTMENT_CONFIRMED',
                    session_data: {
                        last_action: 'BOOKING',
                        selected_doctor: 'Dr. Indu',
                        selected_date: '2026-06-15'
                    }
                }, false),
                responses: { 200: { description: 'Updated' } }
            }
        },
        '/api/bot/escalate': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Escalate to human',
                requestBody: body({
                    wa_id: '9876543210',
                    reason: 'User keeps asking for help',
                    failed_state: 'S40_MAIN_MENU'
                }),
                responses: { 200: { description: 'Escalated' } }
            }
        },
        '/api/bot/interactions/unregistered': { get: { tags: ['WhatsApp Bot Integration'], summary: 'Get unregistered leads', responses: { 200: { description: 'Success' } } } },
        '/api/bot/chat/log': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Log ANY chat raw',
                requestBody: body({
                    wa_id: '9876543210',
                    message: 'Hello, I want to book an appointment for my daughter Sia'
                }),
                responses: { 201: { description: 'Logged' } }
            }
        },
        '/api/bot/chat/bot-reply': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Log Bot specific reply (Upsert)',
                requestBody: body({
                    wa_id: '9876543210',
                    message: 'Sure! I can help you with that. Which date would you like?',
                    bot_name: 'Dr. Indu Assistant'
                }),
                responses: { 201: { description: 'Logged' } }
            }
        },
        '/api/bot/chat/bot-replies/{wa_id}': {
            get: {
                tags: ['WhatsApp Bot Integration'], summary: 'Get current bot reply record',
                parameters: [pathParam('wa_id', '9876543210')],
                responses: { 200: { description: 'Single Record' } }
            }
        },

        '/api/bot/messages': {
            post: {
                tags: ['WhatsApp Bot Integration'], summary: 'Store simple message',
                requestBody: body({ wa_id: '9876543210', message: 'Hello', sender: 'user' }),
                responses: { 201: { description: 'Stored' } }
            }
        },
        '/api/bot/messages/{wa_id}': {
            get: {
                tags: ['WhatsApp Bot Integration'], summary: 'Get simple message history',
                parameters: [pathParam('wa_id', '9876543210')],
                responses: { 200: { description: 'List' } }
            }
        },
        '/api/bot/messages/{message_id}': {
            patch: {
                tags: ['WhatsApp Bot Integration'], summary: 'Update message content',
                parameters: [pathParam('message_id', '69a55f7c87...')],
                requestBody: body({ message: 'Updated text' }),
                responses: { 200: { description: 'Updated' } }
            }
        },

        // ══ SYSTEM ════════════════════════════════════════════════════════════
        '/api/system/health': { get: { tags: ['System'], summary: 'Health check', responses: { 200: { description: 'Healthy' } } } },
        '/api/config': {
            get: { tags: ['System'], summary: 'Get system settings', responses: { 200: { description: 'Success' } } },
            patch: { tags: ['System'], summary: 'Update system settings', requestBody: body({ clinic_name: 'DICC' }, false), responses: { 200: { description: 'Updated' } } }
        },
        '/api/audit/logs': { get: { tags: ['System'], summary: 'Get system audit logs', responses: { 200: { description: 'Logs list' } } } },
        '/api/notifications': { get: { tags: ['System'], summary: 'List notifications', responses: { 200: { description: 'Success' } } } },
        '/api/notifications/{id}/mark-read': { patch: { tags: ['System'], summary: 'Mark alert read', parameters: [pathParam('id', 'N1')], responses: { 200: { description: 'Success' } } } },
        '/api/reminders/schedule': { post: { tags: ['System'], summary: 'Schedule a manual reminder', requestBody: body({ appointment_id: 'APT1' }), responses: { 201: { description: 'Scheduled' } } } },

        // ══ REPORTS ═══════════════════════════════════════════════════════════
        '/api/reports/dashboard': { get: { tags: ['Reports & Analytics'], summary: 'Overview metrics', responses: { 200: { description: 'Daily stats' } } } },
        '/api/reports/appointments': { get: { tags: ['Reports & Analytics'], summary: 'Appointment list report', parameters: [queryParam('from', '2026-06-01'), queryParam('to', '2026-06-15')], responses: { 200: { description: 'Success' } } } },
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
    console.log('📚 Swagger docs (Prod)  → https://api-dr-indu-child-care.brahmaastra.ai/api-docs');
    //console.log('📚 Swagger docs (Local) → http://localhost:5000/api-docs');
};
