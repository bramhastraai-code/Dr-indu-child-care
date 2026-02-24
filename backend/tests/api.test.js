const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');

let token;
let patientId;
let appointmentId;
let doctorId;

beforeAll(async () => {
  // Login to get token
  const res = await request(app)
    .post('/api/admin/login')
    .send({
      username: 'drinduchildcare@gmail.com',
      password: 'Drindu@1234'
    });
  
  if (res.status === 200) {
    token = res.body.access_token;
  }
});

afterAll(async () => {
  await mongoose.connection.close();
});

describe('API Endpoints Testing', () => {

  // ══ SYSTEM ════════════════════════════════════════════════════════════
  describe('System Endpoints', () => {
    it('GET /api/system/health - should return status up', async () => {
      const res = await request(app).get('/api/system/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('up');
    });

    it('GET /api/config - should return config', async () => {
      const res = await request(app)
        .get('/api/config')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  // ══ ADMIN ═════════════════════════════════════════════════════════════
  describe('Admin Endpoints', () => {
    it('GET /api/admin/users - should list admin users', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ══ PATIENTS ══════════════════════════════════════════════════════════
  describe('Patient Endpoints', () => {
    it('POST /api/patients - should register a new patient', async () => {
      const res = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${token}`)
        .send({
          child_name: 'Test Child',
          parent_name: 'Test Parent',
          wa_id: '1234567890',
          dob: '2023-01-01',
          gender: 'Male'
        });
      expect([200, 201]).toContain(res.status);
      if (res.body.success) {
        patientId = res.body.data.patient_id;
      }
    });

    it('GET /api/patients - should list patients', async () => {
      const res = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    it('GET /api/patients/:patient_id - should get patient by ID', async () => {
      if (patientId) {
        const res = await request(app)
          .get(`/api/patients/${patientId}`)
          .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
      }
    });
  });

  // ══ DOCTORS ═══════════════════════════════════════════════════════════
  describe('Doctor Endpoints', () => {
    it('GET /api/doctors - should list doctors', async () => {
      const res = await request(app)
        .get('/api/doctors')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      if (res.body.data && res.body.data.length > 0) {
        doctorId = res.body.data[0].doctor_id;
      }
    });
  });

  // ══ SLOTS ═════════════════════════════════════════════════════════════
  describe('Slot Endpoints', () => {
    it('GET /api/slots/available - should return available slots', async () => {
      const res = await request(app)
        .get('/api/slots/available')
        .query({ doctor_name: 'Dr. Indu', date: '2026-06-15' });
      expect(res.status).toBe(200);
    });

    it('GET /api/slots/config - should return slot config', async () => {
      const res = await request(app)
        .get('/api/slots/config')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  // ══ APPOINTMENTS ══════════════════════════════════════════════════════
  describe('Appointment Endpoints', () => {
    it('GET /api/appointments - should list appointments', async () => {
      const res = await request(app)
        .get('/api/appointments')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    it('POST /api/appointments - should book an appointment', async () => {
      if (patientId) {
        const res = await request(app)
          .post('/api/appointments')
          .set('Authorization', `Bearer ${token}`)
          .send({
            patient_id: patientId,
            doctor_name: 'Dr. Indu',
            appointment_date: '2026-06-15',
            slot_id: 'S1',
            doctor_speciality: 'Pediatrics',
            visit_type: 'CONSULTATION'
          });
        expect([200, 201]).toContain(res.status);
        if (res.body.success) {
          appointmentId = res.body.data.appointment_id;
        }
      }
    });
  });

  // ══ BOT ═══════════════════════════════════════════════════════════════
  describe('Bot Endpoints', () => {
    it('GET /api/bot/session/:wa_id - should return bot session', async () => {
      const res = await request(app)
        .get('/api/bot/session/1234567890')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 404]).toContain(res.status); // 404 is fine if session doesn't exist
    });
  });
});
