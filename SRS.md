# Software Requirements Specification (SRS)
## Project: Dr. Indu Child Care Management System

**Version:** 1.1.0  
**Date:** March 17, 2026  
**Author:** Antigravity AI  

---

## 1. Introduction

### 1.1 Purpose
This document provides a comprehensive Software Requirements Specification for the **Dr. Indu Child Care Management System**. It outlines the functional and non-functional requirements for the complete ecosystem, including the Backend API, Admin/Doctor Frontend Dashboard, and the WhatsApp Integration.

### 1.2 Scope
The system is a digital transformation tool for "Dr. Indu's New Born & Childcare Center". It automates clinic workflows, patient intake, appointment scheduling via WhatsApp, and medical record management.

### 1.3 Definitions and Abbreviations
- **Super Admin**: Full system access, including configuration of clinic settings.
- **Admin**: Staff with operational access (appointments, registration).
- **Doctor**: Medical professional with access to patient clinical data and personal schedules.
- **MRD**: Medical Record Department (Digital health records).
- **Token System**: Real-time queue management for patient flow.
- **n8n**: Workflow automation platform used for advanced bot logic.

---

## 2. Overall Description

### 2.1 System Architecture
The system follows a modern decoupled architecture:
- **Backend**: Node.js/Express.js REST API with MongoDB.
- **Frontend**: React.js/Vite with a responsive, glassmorphic design.
- **Bot Layer**: WhatsApp Integration using webhooks and background message queues.
- **Background Services**: Cron jobs for reminders and notification logs.

### 2.2 Core Modules
1. **Identity & Access Management**: Secure JWT-based authentication with Role-Based Access Control (RBAC).
2. **Patient Lifecycle Management**: From public registration to detailed medical history.
3. **Smart Appointment Queue**: Token-based system with doctor-specific configuration.
4. **Clinical Documentation (MRD)**: Digital prescriptions, reports, and visit summaries.
5. **WhatsApp Automation**: Bot-led bookings, status inquiries, and automated reminders.
6. **Analytics & Reporting**: KPIs for clinic revenue, patient volume, and doctor performance.
7. **Referral Tracking**: Managing relationship with referring doctors.

### 2.3 User Classes
- **Super Admin**: Manages system-level configurations and auditing.
- **Clinic Staff**: Manages the front desk, registrations, and the physical queue.
- **Doctors**: Manages consultations, clinical notes, and availability.
- **Patients**: Interact primarily via the WhatsApp bot or public registration forms.

---

## 3. Functional Requirements

### 3.1 Authentication & Security (AS)
- **AS-1**: Users must authenticate via email/password or mobile number.
- **AS-2**: Tokens (JWT) must expire after a configurable period.
- **AS-3**: Audit logs must record every create/update/delete action on sensitive records (MRD, Appointments).

### 3.2 Appointment & Token Management (AT)
- **AT-1**: System must support multiple doctors with independent shift timings.
- **AT-2**: Each doctor can configure "Tokens per Session" and "Buffer Time" via `DoctorTokenConfig`.
- **AT-3**: Real-time status updates: `Waiting`, `In-Consultation`, `Completed`, `Cancelled`.
- **AT-4**: Automated token progression (Next patient notification).

### 3.3 Patient & MRD Management (PM)
- **PM-1**: Unique Patient IDs (MRD Numbers) for every patient.
- **PM-2**: Support for Base64 photo uploads for patient profiles and prescriptions.
- **PM-3**: Tracking of secondary contacts (Parents/Guardians) for pediatric care.

### 3.4 WhatsApp Bot & Messaging (WM)
- **WM-1**: Asynchronous message processing using `WhatsAppMessageQueue`.
- **WM-2**: Automated appointment reminders sent via WhatsApp at T-24h and T-1h.
- **WM-3**: Patients can check their current token position via the bot.

### 3.5 System Configuration (SC)
- **SC-1**: Referring Doctor database to track patient sources.
- **SC-2**: Dynamic system configuration for clinic hours and holiday management.

---

## 4. Technical Stack & Data Model

### 4.1 Technology Stack
- **Frontend**: React, Vite, Lucide Icons, Vanilla CSS.
- **Backend**: Node.js, Express, Mongoose.
- **Database**: MongoDB Atlas.
- **Communication**: WhatsApp Business API / Twilio / n8n Webhooks.
- **Documentation**: Swagger UI (`/api-docs`).

### 4.2 Key Data Entities
- **Patient**: Demographic and clinical summary.
- **Appointment**: Linking Patient, Doctor, and Token.
- **MRD**: Clinical documents and historical visit data.
- **DoctorAvailability**: Weekly schedules and exceptions.
- **AuditLog**: Security trail for administrative actions.
- **NotificationLog**: Tracking delivery status of WhatsApp messages.

---

## 5. Non-Functional Requirements

### 5.1 Performance
- Dashboard widgets must load within 1.5 seconds.
- Concurrent handling of up to 50 active WhatsApp bot sessions.

### 5.2 Scalability
- The system must support the horizontal scaling of the API layer.
- MongoDB schema designed for efficient indexing of MRD numbers and Appointment dates.

### 5.3 Usability
- The clinic display (Queue View) must be readable from a distance of 10 feet.
- Mobile-first approach for the Doctor's daily schedule view.

---

## 6. Future Enhancements
- Integration with external lab reporting systems.
- Multilingual WhatsApp bot support (Marathi/Hindi/English).
- Telemedicine video consultation module.
- Automated billing and invoicing integration.
