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
        //{ url: 'http://localhost:5000/', description: 'Local Development' },
    ],
    components: {},
    security: [],
    tags: [
        { name: 'Admin', description: 'Admin user management' },
        { name: 'Patients', description: 'Patient registration and lookup' },
        { name: 'Appointments', description: 'Booking and session management' },
        { name: 'Token System', description: 'Queue management and clinic display' },
        { name: 'Doctors', description: 'Doctor profile management' },
        { name: 'Doctor Schedule', description: 'Weekly arrival time schedule per doctor' },
        { name: 'Doctor Availability', description: 'Live doctor status, ETA, and queue snapshots' },
        { name: 'Messaging', description: 'Outbound message queue and templates' },
        { name: 'MRD', description: 'Medical record documents' },
        { name: 'System', description: 'Health check, system config, and logs' },
        { name: 'Reports & Analytics', description: 'Dashboard stats and reporting' },
        { name: 'Referring Doctors', description: 'Management of external doctors who refer patients' },
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
                    queryParam('gender', '', ['boy', 'girl'])
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
                    gender: 'boy',
                    dob: '2020-05-20',
                    mother_name: 'Anjali Sharma',
                    father_name: 'Rohit Sharma',
                    wa_id: '9876543210',
                    email: 'rohit@example.com',
                    communication_preference: 'whatsapp',
                    doctor: 'Dr. Indu',
                    address: '123 Healthway Clinic Road, Mumbai',
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
                    gender: 'boy',
                    dob: '2020-05-20',
                    mother_name: 'Anjali Sharma',
                    father_name: 'Rohit Sharma',
                    wa_id: '9876543210',
                    email: 'rohit@example.com',
                    communication_preference: 'whatsapp',
                    doctor: 'Dr. Indu',
                    address: '123 Healthway Clinic Road, Mumbai',
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
                    gender: 'boy',
                    wa_id: '9876543210',
                    registration_source: 'whatsapp',
                    mother_name: 'Anjali Sharma',
                    father_name: 'Rohit Sharma'
                }),
                responses: {
                    201: { description: 'Registered via bot' },
                    200: {
                        description: 'Patient already exists',
                        content: {
                            'application/json': {
                                example: { success: true, is_already_registered: true, message: 'The patient with this number is already registered', data: { patient_id: '26-AS1', child_name: 'Arjun Sharma' } }
                            }
                        }
                    }
                }
            }
        },
        '/api/patients/{patient_id}': {
            get: { tags: ['Patients'], summary: 'Get patient by Patient ID', parameters: [pathParam('patient_id', '26-AS1')], responses: { 200: { description: 'Success' } } },
            put: {
                tags: ['Patients'], summary: 'Update patient details',
                parameters: [pathParam('patient_id', '26-AS1')],
                requestBody: body({
                    first_name: 'Arjun',
                    last_name: 'Sharma',
                    is_active: true,
                    remarks: 'Updated contact details',
                    email: 'updated@example.com'
                }, false),
                responses: { 200: { description: 'Updated' } }
            },
            delete: {
                tags: ['Patients'], summary: 'Delete (Soft Delete) patient',
                parameters: [pathParam('patient_id', '26-AS1')],
                responses: { 200: { description: 'Deleted' } }
            }
        },
        '/api/patients/{patient_id}/photo': {
            patch: {
                tags: ['Patients'], summary: 'Upload patient photo (Base64)',
                parameters: [pathParam('patient_id', '26-AS1')],
                requestBody: body({ photo: 'data:image/jpeg;base64,...' }),
                responses: { 200: { description: 'Photo updated' } }
            }
        },
        '/api/patients/by-wa/{wa_id}': {
            get: {
                tags: ['Patients'],
                summary: 'Lookup patient by WhatsApp Number',
                parameters: [pathParam('wa_id', '9876543210')],
                responses: {
                    200: {
                        description: 'Returns registration status. Always success: true even if not found.',
                        content: {
                            'application/json': {
                                examples: {
                                    registered: {
                                        summary: 'Patient Found',
                                        value: { success: true, is_registered: true, data: { patient_id: '26-AS1', child_name: 'Arjun Sharma', total_appointments: 2 } }
                                    },
                                    unregistered: {
                                        summary: 'Patient Not Found',
                                        value: { success: true, is_registered: false, message: 'Patient not registered. Please complete registration first.', wa_id: '9876543210' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
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
                description: 'Tokens are assigned immediately at booking. Use `registration_type` walkin/online to control the pool.',
                requestBody: body({
                    patient_id: '26-AS1',
                    doctor_name: 'Dr. Indu',
                    appointment_date: '2026-06-15',
                    visit_category: 'first_visit',
                    registration_type: 'walkin',
                    appointment_mode: 'OFFLINE'
                }),
                responses: { 201: { description: 'Booked — token_number and token_status returned' } }
            }
        },
        '/api/appointments/form': {
            post: {
                tags: ['Appointments'], summary: 'Book via public web form (Token-based)',
                description: 'No slot needed. Token is auto-assigned from DoctorTokenConfig.',
                requestBody: body({
                    wa_id: '9175152244',
                    doctor_name: 'Dr. Indu',
                    appointment_date: '2026-06-15',
                    visit_category: 'followup',
                    appointment_mode: 'OFFLINE',
                    reason: 'Follow-up checkup'
                }),
                responses: { 201: { description: 'Booked — token_number included in response' } }
            }
        },
        '/api/appointments/whatsapp': {
            post: {
                tags: ['Appointments'], summary: 'Book via WhatsApp bot (token-based)',
                description: 'No slot needed. Token auto-assigned from doctor weekly config.',
                requestBody: body({
                    wa_id: '9876543210',
                    doctor_name: 'Dr. Indu',
                    appointment_date: '2026-06-15',
                    visit_category: 'consultation',
                    appointment_mode: 'OFFLINE',
                    reason: 'Cold and Fever'
                }),
                responses: { 201: { description: 'Booked — token_number and token_status: WAITING returned' } }
            }
        },
        '/api/appointments/by-wa/{wa_id}': {
            get: {
                tags: ['Appointments'],
                summary: 'Lookup upcoming appointments by WhatsApp number',
                parameters: [
                    pathParam('wa_id', '9876543210'),
                    queryParam('days', '14', 'Optional window (days from today). If omitted, returns all upcoming appointments.'),
                    queryParam('limit', '50', 'Optional max rows (cap 200).')
                ],
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
                description: 'Rescheduling updates the appointment_date. Token number is kept as-is.',
                parameters: [pathParam('appointment_id', 'APT-2026-00001')],
                requestBody: body({ appointment_date: '2026-06-16', reason: 'Patient requested reschedule' }, false),
                responses: { 200: { description: 'Updated' } }
            },
            delete: { tags: ['Appointments'], summary: 'Delete (Soft Delete) appointment', parameters: [pathParam('appointment_id', 'APT-2026-00001')], responses: { 200: { description: 'Deleted' } } }
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

        '/api/appointments/reminders/pending-24h': {
            get: {
                tags: ['Appointments'],
                summary: 'Bulk generate queue tokens and list tomorrow appointments pending 24h reminder',
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/appointments/reminders/pending-2h': {
            get: {
                tags: ['Appointments'],
                summary: 'List today appointments pending 2h reminder',
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/appointments/reminders/{appointment_id}/mark-sent': {
            patch: {
                tags: ['Appointments'],
                summary: 'Mark reminder as sent for one appointment',
                parameters: [pathParam('appointment_id', 'APT-2026-00001')],
                requestBody: body({ type: '24h' }),
                responses: { 200: { description: 'Marked as sent' } }
            }
        },

        // ══ TOKEN SYSTEM ══════════════════════════════════════════════════════
        '/api/appointments/book-with-token': {
            post: {
                tags: ['Token System'], summary: 'Book appointment with immediate token (walk-in today)',
                description: 'Tokens are always assigned at booking time. `registration_type` controls the pool (walkin/online).',
                requestBody: body({
                    patient_id: '26-AS1',
                    doctor_id: 'DOC-00007',
                    appointment_date: '2026-06-15',
                    visit_category: 'first_visit',
                    registration_type: 'walkin',
                    booking_source: 'dashboard'
                }),
                responses: { 201: { description: 'Booked — token_number always present in response.' } }
            }
        },
        '/api/appointments/daily-tokens': {
            get: {
                tags: ['Token System'], summary: 'List tokens by doctor/date (Auto-assigns tokens if missing)',
                parameters: [queryParam('date', '2026-06-15'), queryParam('doctor_id', '')],
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/appointments/clinic-display': {
            get: { tags: ['Token System'], summary: '📺 Public Display Board Data (Auto-assigns tokens if missing)', parameters: [queryParam('date', '2026-06-15')], responses: { 200: { description: 'Clinic board status' } } }
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
                tags: ['Token System'], summary: 'Patient Self-Check (Position)',
                parameters: [pathParam('token', '1'), queryParam('doctor_id', '', 'Doctor ID (Required)', true), queryParam('date', '2026-06-15')],
                responses: { 200: { description: 'Queue position' } }
            }
        },
        '/api/appointments/auto-reschedule': {
            post: { tags: ['Token System'], summary: 'Move missed token to next available position', requestBody: body({ appointment_id: 'APT-001' }), responses: { 200: { description: 'Moved' } } }
        },
        '/api/appointments/queue/{doctor_id}': {
            delete: {
                tags: ['Token System'],
                summary: 'Clear Doctor Queue for a day',
                parameters: [pathParam('doctor_id', 'DOC-00007'), queryParam('date', '2026-06-15', 'Date to clear (default today)')],
                responses: { 200: { description: 'Queue cleared' } }
            }
        },

        // ══ DOCTORS ═══════════════════════════════════════════════════════════
        '/api/doctors': {
            get: { tags: ['Doctors'], summary: 'List all doctors', responses: { 200: { description: 'Success' } } },
            post: {
                tags: ['Doctors'], summary: 'Create doctor profile',
                requestBody: body({
                    name: 'Dr. Indu',
                    speciality: 'Pediatrics',
                    qualification: 'MBBS, MD',
                    experience: '15 Years'
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

        // ══ DOCTOR SCHEDULE ═══════════════════════════════════════════════════
        '/api/doctor/schedule/{doctor_id}': {
            get: {
                tags: ['Doctor Schedule'], summary: 'Get full weekly arrival schedule',
                description: 'Returns the doctor\'s arrival time and working status for each day of the week.',
                parameters: [pathParam('doctor_id', 'DOC-00007')],
                responses: { 200: { description: 'Weekly schedule with arrival_time and is_working per day' } }
            },
            put: {
                tags: ['Doctor Schedule'], summary: 'Set / update weekly arrival schedule',
                description: 'Provide only the days you want to update. Every save is recorded in change_history.',
                parameters: [pathParam('doctor_id', 'DOC-00007')],
                requestBody: body({
                    schedule: {
                        monday: { arrival_time: '10:00', is_working: true },
                        tuesday: { arrival_time: '12:00', is_working: true },
                        wednesday: { arrival_time: '10:00', is_working: true },
                        thursday: { arrival_time: '10:00', is_working: true },
                        friday: { arrival_time: '10:00', is_working: true },
                        saturday: { arrival_time: '09:00', is_working: true },
                        sunday: { arrival_time: null, is_working: false }
                    }
                }),
                responses: { 200: { description: 'Schedule updated. Snapshot saved to change_history.' } }
            }
        },
        '/api/doctor/schedule/{doctor_id}/today': {
            get: {
                tags: ['Doctor Schedule'], summary: 'Get today\'s arrival time',
                description: 'Returns arrival_time and is_working for the current day of the week.',
                parameters: [pathParam('doctor_id', 'DOC-00007')],
                responses: { 200: { description: 'Today entry: arrival_time, is_working, day name' } }
            }
        },
        '/api/doctor/schedule/{doctor_id}/history': {
            get: {
                tags: ['Doctor Schedule'], summary: 'Full schedule change history',
                description: 'Returns all previous schedule snapshots in reverse chronological order.',
                parameters: [pathParam('doctor_id', 'DOC-00007')],
                responses: { 200: { description: 'Array of snapshots: changed_at, changed_by, old schedule' } }
            }
        },

        // â•â• DOCTOR AVAILABILITY â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        '/api/doctor/availability/{doctor_id}': {
            get: {
                tags: ['Doctor Availability'], summary: 'Get doctor availability for a date',
                parameters: [
                    pathParam('doctor_id', 'DOC-00008'),
                    queryParam('date', '2026-03-07', 'YYYY-MM-DD')
                ],
                responses: { 200: { description: 'Availability + queue snapshot' } }
            }
        },
        '/api/doctor/availability-dashboard/{doctor_id}': {
            get: {
                tags: ['Doctor Availability'], summary: 'Get availability dashboard snapshot',
                parameters: [pathParam('doctor_id', 'DOC-00008')],
                responses: { 200: { description: 'Status, ETA, queue summary' } }
            }
        },
        '/api/doctor/availability/update': {
            post: {
                tags: ['Doctor Availability'], summary: 'Update availability (status/ETA/notes)',
                requestBody: body({
                    doctor_id: 'DOC-00008',
                    status: 'PRESENT',
                    eta_minutes: 15,
                    eta_time: '10:45 AM',
                    notes: 'Traffic delay'
                }),
                responses: { 200: { description: 'Availability updated' } }
            }
        },
        '/api/doctor/availability/{doctor_id}/status': {
            patch: {
                tags: ['Doctor Availability'], summary: 'Update availability status',
                parameters: [pathParam('doctor_id', 'DOC-00008')],
                requestBody: body({ status: 'LATE', notes: 'Running late' }),
                responses: { 200: { description: 'Status updated' } }
            }
        },
        '/api/doctor/availability/{doctor_id}/eta': {
            patch: {
                tags: ['Doctor Availability'], summary: 'Update availability ETA',
                parameters: [pathParam('doctor_id', 'DOC-00008')],
                requestBody: body({ eta_minutes: 20, eta_time: '10:50 AM', reason: 'Clinic traffic' }),
                responses: { 200: { description: 'ETA updated' } }
            }
        },
        '/api/doctor/late-checkin': {
            post: {
                tags: ['Doctor Availability'], summary: 'Log doctor late check-in',
                requestBody: body({ doctor_id: 'DOC-00008', eta_minutes: 25, reason: 'Emergency case' }),
                responses: { 200: { description: 'Late check-in logged' } }
            }
        },
        '/api/doctor/late-checkins/{doctor_id}': {
            get: {
                tags: ['Doctor Availability'], summary: 'Get late check-ins (history)',
                parameters: [pathParam('doctor_id', 'DOC-00008')],
                responses: { 200: { description: 'History list' } }
            }
        },



        // ══ MESSAGING (WhatsApp Notifications) ════════════════════════════════
        '/api/messages/doctor/late-alert': {
            post: {
                tags: ['Messaging'], summary: 'Trigger Doctor Late Alert',
                requestBody: body({ doctor_id: 'DOC-00007', doctor_name: 'Dr. Indu', minutes_late: 30, notes: 'Traffic' }),
                responses: { 200: { description: 'Queued' } }
            }
        },
        '/api/messages/doctor/arrived-alert': {
            post: {
                tags: ['Messaging'], summary: 'Trigger Doctor Arrived Alert',
                requestBody: body({ doctor_id: 'DOC-00007', doctor_name: 'Dr. Indu', arrival_time: '10:30 AM' }),
                responses: { 200: { description: 'Queued' } }
            }
        },
        '/api/messages/appointment/reschedule-notification': {
            post: {
                tags: ['Messaging'], summary: 'Send Reschedule Notification',
                requestBody: body({ appointment_id: 'APT-1', old_date: '2026-03-07', new_date: '2026-03-08' }),
                responses: { 200: { description: 'Queued' } }
            }
        },
        '/api/messages/appointment/completion-notice': {
            post: {
                tags: ['Messaging'], summary: 'Send Visit Completion / Prescription Link',
                requestBody: body({ appointment_id: 'APT-1', patient_id: 'P1', prescription_url: '...' }),
                responses: { 200: { description: 'Queued' } }
            }
        },
        '/api/messages/token/call-reminder': {
            post: {
                tags: ['Messaging'], summary: 'Send Token Call Reminder',
                description: 'Sends a "You are next" or "Your turn" message to the patient.',
                requestBody: body({ appointment_id: 'APT-1', token_number: 15, current_token: 13 }),
                responses: { 200: { description: 'Queued' } }
            }
        },
        '/api/messages/messages/pending': {
            get: { tags: ['Messaging'], summary: 'Poll pending messages for external sender (n8n/WATI)', responses: { 200: { description: 'List of formatted messages' } } }
        },
        '/api/messages/messages/status/{message_id}': {
            get: { tags: ['Messaging'], summary: 'Get single message status', parameters: [pathParam('message_id', 'MQ-123')], responses: { 200: { description: 'Success' } } }
        },
        '/api/messages/messages/batch/{batch_id}': {
            get: { tags: ['Messaging'], summary: 'Get batch delivery status', parameters: [pathParam('batch_id', 'BATCH-001')], responses: { 200: { description: 'Success' } } }
        },
        '/api/messages/messages/{queue_id}/status': {
            patch: { tags: ['Messaging'], summary: 'Update delivery status from external sender (n8n/WATI)', parameters: [pathParam('queue_id', 'MQ-123')], requestBody: body({ status: 'SENT' }), responses: { 200: { description: 'Updated' } } }
        },

        // ══ MRD ═══════════════════════════════════════════════════════════════
        '/api/mrd/{patient_id}': {
            get: { tags: ['MRD'], summary: 'Get patient history', parameters: [pathParam('patient_id', '26-AS1')], responses: { 200: { description: 'Full history' } } }
        },
        '/api/mrd/entry': {
            post: {
                tags: ['MRD'], summary: 'Add clinical entry (Diagnosis/Prescription)',
                requestBody: body({
                    patient_id: '26-AS1',
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
        '/api/bot/doctors': {
            get: {
                tags: ['WhatsApp Bot Integration'],
                summary: '📋 Minimal doctor list for Bot',
                description: 'Returns only id, name, and speciality of active doctors.',
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/bot/doctor-availability/{doctor_id}': {
            get: {
                tags: ['WhatsApp Bot Integration'],
                summary: '🏥 Real-time Doctor Status & Queue',
                description: 'Get presence, current token, and queue counts (waiting, in-progress).',
                parameters: [pathParam('doctor_id', 'DOC-00007'), queryParam('date', '2026-06-15')],
                responses: { 200: { description: 'Success' } }
            }
        },


        '/api/bot/appointments/by-wa/{wa_id}': {
            get: {
                tags: ['WhatsApp Bot Integration'],
                summary: '🔍 Bot: Lookup upcoming appointments',
                description: 'Returns upcoming confirmed appointments for a given WhatsApp ID.',
                parameters: [
                    pathParam('wa_id', '9876543210'),
                    queryParam('days', '14', 'Optional window (days from today). If omitted, returns all upcoming appointments.'),
                    queryParam('limit', '50', 'Optional max rows (cap 200).')
                ],
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/bot/appointments/token-status/{token}': {
            get: {
                tags: ['WhatsApp Bot Integration'],
                summary: '⏳ Bot: Check Queue Position',
                description: 'Get position in queue, estimated wait time, and doctor status for a given token.',
                parameters: [pathParam('token', '1'), queryParam('doctor_id', 'DOC-00007', 'Required', true), queryParam('date', '2026-06-15', 'Optional')],
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/system/webhook-health': {
            get: {
                tags: ['System'],
                summary: '🔌 Webhook Health Check — Test n8n connectivity',
                description: 'Tests all 5 n8n webhook endpoints (Registration, appointment, appointment-upgradation, Doctor-update, 24hr-message) from this server and reports success/failure, latency, and configuration.',
                responses: {
                    200: {
                        description: 'All webhooks are reachable',
                        content: {
                            'application/json': {
                                example: {
                                    success: true,
                                    environment: 'production',
                                    n8n_base_url: 'https://n8n.brahmaastra.ai',
                                    n8n_api_key_set: true,
                                    n8n_use_test_webhook: false,
                                    results: [
                                        { endpoint: 'Registration', success: true, status: 200, error: null, latency_ms: 244 },
                                        { endpoint: 'appointment', success: true, status: 200, error: null, latency_ms: 197 },
                                        { endpoint: 'appointment-upgradation', success: true, status: 200, error: null, latency_ms: 80 },
                                        { endpoint: 'Doctor-update', success: true, status: 200, error: null, latency_ms: 80 },
                                        { endpoint: '24hr-message', success: true, status: 200, error: null, latency_ms: 81 }
                                    ]
                                }
                            }
                        }
                    },
                    503: { description: 'One or more webhooks failed — check results array for details' }
                }
            }
        },
        '/api/system/health': { get: { tags: ['System'], summary: 'Health check', responses: { 200: { description: 'Healthy' } } } },
        '/api/system/config': {
            get: { tags: ['System'], summary: 'Get system settings', responses: { 200: { description: 'Success' } } },
            put: { tags: ['System'], summary: 'Update system settings', requestBody: body({ clinic_name: 'Dr. Indu Child Care' }, false), responses: { 200: { description: 'Updated' } } }
        },
        '/api/system/audit-logs': { get: { tags: ['System'], summary: 'Get system audit logs', responses: { 200: { description: 'Logs list' } } } },
        '/api/config': {
            get: { tags: ['System'], summary: 'Get system settings (Generic)', responses: { 200: { description: 'Success' } } },
            patch: { tags: ['System'], summary: 'Update system settings (Generic)', requestBody: body({ clinic_name: 'Dr. Indu Child Care' }, false), responses: { 200: { description: 'Updated' } } }
        },
        '/api/audit/logs': { get: { tags: ['System'], summary: 'Get system audit logs (Generic)', responses: { 200: { description: 'Logs list' } } } },
        '/api/notifications': { get: { tags: ['System'], summary: 'List notifications', responses: { 200: { description: 'Success' } } } },
        '/api/notifications/{id}/mark-read': { patch: { tags: ['System'], summary: 'Mark alert read', parameters: [pathParam('id', 'N1')], responses: { 200: { description: 'Success' } } } },
        '/api/reminders/schedule': { post: { tags: ['System'], summary: 'Schedule a manual reminder', requestBody: body({ appointment_id: 'APT1' }), responses: { 201: { description: 'Scheduled' } } } },

        // ══ REPORTS ═══════════════════════════════════════════════════════════
        '/api/reports/dashboard': { get: { tags: ['Reports & Analytics'], summary: 'Overview metrics', responses: { 200: { description: 'Daily stats' } } } },
        '/api/reports/appointments': { get: { tags: ['Reports & Analytics'], summary: 'Appointment list report', parameters: [queryParam('from', '2026-06-01'), queryParam('to', '2026-06-15')], responses: { 200: { description: 'Success' } } } },

        // ══ FEEDBACK ═══════════════════════════════════════════════════════════
        '/api/feedback': {
            get: {
                tags: ['Reports & Analytics'],
                summary: 'Get all patient feedback',
                parameters: [
                    queryParam('page', '1'),
                    queryParam('limit', '20'),
                    queryParam('from_date', '2026-01-01'),
                    queryParam('to_date', '2026-12-31')
                ],
                responses: { 200: { description: 'List of feedback responses' } }
            },
            post: {
                tags: ['Reports & Analytics'],
                summary: 'Submit patient feedback (Public)',
                description: 'Public API endpoint to submit a rating across doctor, frontdesk, and hospital experience.',
                requestBody: body({
                    doctor_rating: 5,
                    frontdesk_rating: 4,
                    hospital_rating: 5,
                    name: 'Rahul Sharma',
                    mobile: '9876543210',
                    email: 'rahul@example.com',
                    appointment_id: 'APT-2026-00001'
                }),
                responses: { 201: { description: 'Feedback submitted successfully' } }
            }
        },

        // ══ ANALYTICS ═════════════════════════════════════════════════════════
        '/api/analytics/appointments': {
            get: {
                tags: ['Reports & Analytics'],
                summary: 'Appointment analytics',
                parameters: [
                    queryParam('from_date', '2026-01-01'),
                    queryParam('to_date', '2026-12-31'),
                    queryParam('doctor_id', ''),
                    queryParam('visit_category', '')
                ],
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/analytics/tokens': {
            get: {
                tags: ['Reports & Analytics'],
                summary: 'Token analytics',
                parameters: [
                    queryParam('from_date', '2026-01-01'),
                    queryParam('to_date', '2026-12-31'),
                    queryParam('doctor_id', '')
                ],
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/analytics/registrations': {
            get: {
                tags: ['Reports & Analytics'],
                summary: 'Registration analytics',
                parameters: [
                    queryParam('from_date', '2026-01-01'),
                    queryParam('to_date', '2026-12-31')
                ],
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/analytics/feedback': {
            get: {
                tags: ['Reports & Analytics'],
                summary: 'Feedback analytics',
                parameters: [
                    queryParam('from_date', '2026-01-01'),
                    queryParam('to_date', '2026-12-31'),
                    queryParam('doctor_id', '')
                ],
                responses: { 200: { description: 'Success' } }
            }
        },
        '/api/analytics/practice-insights': {
            get: {
                tags: ['Reports & Analytics'],
                summary: 'Practice insights (Unified)',
                responses: { 200: { description: 'Success' } }
            }
        },

        // ══ TOKEN CONFIG ═══════════════════════════════════════════════════════
        '/api/token-config/{doctor_id}': {
            get: {
                tags: ['System'],
                summary: 'Get doctor token config (weekly schedule)',
                description: 'Returns per-day token limits (online/walkin/total) and start_time. Falls back to defaults if not configured.',
                parameters: [pathParam('doctor_id', 'DOC-00007')],
                responses: {
                    200: {
                        description: 'Config returned',
                        content: {
                            'application/json': {
                                example: {
                                    success: true,
                                    data: {
                                        doctor_id: 'DOC-00007',
                                        weekly_config: {
                                            monday: { total_tokens: 40, online_limit: 20, walkin_limit: 20, start_time: '10:00', is_active: true },
                                            tuesday: { total_tokens: 40, online_limit: 20, walkin_limit: 20, start_time: '10:00', is_active: true },
                                            sunday: { total_tokens: 0, online_limit: 0, walkin_limit: 0, start_time: '10:00', is_active: false }
                                        },
                                        date_overrides: []
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        '/api/token-config': {
            post: {
                tags: ['System'],
                summary: 'Create or update doctor token config',
                description: 'Set per-day limits for online and walkin tokens and appointment start times. Requires superadmin/admin/doctor role.',
                requestBody: body({
                    doctor_id: 'DOC-00007',
                    weekly_config: {
                        monday: { total_tokens: 50, online_limit: 25, walkin_limit: 25, start_time: '09:30', is_active: true },
                        tuesday: { total_tokens: 50, online_limit: 25, walkin_limit: 25, start_time: '09:30', is_active: true },
                        wednesday: { total_tokens: 50, online_limit: 25, walkin_limit: 25, start_time: '09:30', is_active: true },
                        thursday: { total_tokens: 50, online_limit: 25, walkin_limit: 25, start_time: '09:30', is_active: true },
                        friday: { total_tokens: 50, online_limit: 25, walkin_limit: 25, start_time: '09:30', is_active: true },
                        saturday: { total_tokens: 40, online_limit: 20, walkin_limit: 20, start_time: '10:00', is_active: true },
                        sunday: { total_tokens: 0, online_limit: 0, walkin_limit: 0, start_time: '10:00', is_active: false }
                    },
                    date_overrides: []
                }),
                responses: { 200: { description: 'Config saved' } }
            }
        },
        '/api/token-config/override': {
            post: {
                tags: ['System'],
                summary: 'Add date-specific override (holiday / special day)',
                description: 'Override token limits for a specific calendar date. Set is_holiday: true to block all bookings.',
                requestBody: body({
                    doctor_id: 'DOC-00007',
                    date: '2026-08-15',
                    total_tokens: 0,
                    online_limit: 0,
                    walkin_limit: 0,
                    start_time: '10:00',
                    is_holiday: true
                }),
                responses: { 200: { description: 'Override added' } }
            }
        },
        '/api/appointments/tokens/available': {
            get: {
                tags: ['Token System'],
                summary: 'Check available token counts for a doctor/date',
                description: 'Returns remaining online and walkin tokens using DoctorTokenConfig (or defaults).',
                parameters: [
                    queryParam('doctor_id', 'DOC-00007', 'Required', true),
                    queryParam('date', '2026-06-15', 'Required', true)
                ],
                responses: {
                    200: {
                        description: 'Token availability',
                        content: {
                            'application/json': {
                                example: {
                                    success: true,
                                    data: {
                                        doctor_id: 'DOC-00007',
                                        date: '2026-06-15',
                                        online_tokens_remaining: 17,
                                        walkin_tokens_remaining: 15,
                                        total_capacity: 40,
                                        start_time: '10:00'
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },

        // ══ REFERRING DOCTORS ════════════════════════════════════════════════
        '/api/referring-doctors': {
            get: {
                tags: ['Referring Doctors'], summary: 'List all referring doctors',
                responses: { 200: { description: 'Success' } }
            },
            post: {
                tags: ['Referring Doctors'], summary: 'Create a referring doctor',
                requestBody: body({ name: 'Dr. Rahul Verma', clinic_name: 'Verma Clinic', specialisation: 'General Physician', mobile: '9876543210' }),
                responses: { 201: { description: 'Created' } }
            }
        },
        '/api/referring-doctors/{id}': {
            get: { tags: ['Referring Doctors'], summary: 'Get doctor details', parameters: [pathParam('id', 'RD-001')], responses: { 200: { description: 'Success' } } },
            patch: {
                tags: ['Referring Doctors'], summary: 'Update doctor details',
                parameters: [pathParam('id', 'RD-001')],
                requestBody: body({ name: 'Dr. Rahul Verma (Updated)', mobile: '9123456789' }, false),
                responses: { 200: { description: 'Updated' } }
            },
            delete: { tags: ['Referring Doctors'], summary: 'Delete doctor', parameters: [pathParam('id', 'RD-001')], responses: { 200: { description: 'Deleted' } } }
        },
        '/api/referring-doctors/{id}/report': {
            get: { tags: ['Referring Doctors'], summary: 'Get referral report', parameters: [pathParam('id', 'RD-001')], responses: { 200: { description: 'Report stats' } } }
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
    console.log('📚 Swagger docs (Prod)  → https://api-dr-indu-child-care.brahmaastra.ai/api-docs');
    //console.log('📚 Swagger docs (Local) → http://localhost:5000/api-docs');
};

