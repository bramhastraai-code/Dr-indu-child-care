# Dr. Indu Child Care
## WhatsApp Bot & Appointment Booking System
### Software Requirements Specification (SRS)

---

| Field | Details |
|---|---|
| **Document ID** | DICC-SRS-2026-001 |
| **Version** | 2.1 — API Updated |
| **Date** | February 2026 |
| **Prepared For** | Dr. Indu Child Care Clinic |
| **Base URL** | `api-dr-indu-child-care.brahmaastra.ai` |
| **API Version** | v1.0.0 · OAS 3.0 |
| **Classification** | 🔴 Confidential – Internal Use Only |
| **Status** | Draft for Review |

> ⚠️ This document contains confidential and proprietary information. Unauthorized distribution is prohibited.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Business Context & Problem Statement](#2-business-context--problem-statement)
3. [System Overview & Architecture](#3-system-overview--architecture)
4. [Stakeholders & User Personas](#4-stakeholders--user-personas)
5. [Functional Requirements](#5-functional-requirements)
6. [Bot State Machine](#6-bot-state-machine)
7. [Database Design & Data Storage](#7-database-design--data-storage)
8. [API Specification — v1.0.0](#8-api-specification--v100)
9. [Security & Privacy Model](#9-security--privacy-model)
10. [Non-Functional Requirements](#10-non-functional-requirements)
11. [Testing Strategy & UAT Acceptance Criteria](#11-testing-strategy--uat-acceptance-criteria)
12. [Deployment & Infrastructure](#12-deployment--infrastructure)
13. [Future Scope & Roadmap](#13-future-scope--roadmap)
14. [Document Revision History](#14-document-revision-history)
- [Appendix A — WhatsApp Message Templates](#appendix-a--required-whatsapp-message-templates)
- [Appendix B — Go-Live Configuration Checklist](#appendix-b--go-live-clinic-configuration-checklist)

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) document defines the complete functional, non-functional, technical, and operational requirements for the **Dr. Indu Child Care WhatsApp Bot and Appointment Booking System**. It is the single authoritative reference document for all parties involved in the design, development, testing, deployment, and maintenance of the system.

**Version 2.1** incorporates the updated API specification with the production base URL at `api-dr-indu-child-care.brahmaastra.ai` and expands the API surface to cover all WhatsApp Bot Integration endpoints, doctor management, slot configuration, and system health.

This document is intended for:
- Software developers and architects building the system
- QA engineers writing and executing test cases
- DevOps engineers responsible for deployment and infrastructure
- Clinic administrators and secretaries who will operate the system
- Business stakeholders approving requirements and scope

### 1.2 Scope

The system is a full-stack healthcare communication and scheduling platform delivered via the WhatsApp Business API. It eliminates the need for phone-based appointment booking, removes dependency on human receptionists for routine scheduling tasks, and creates a permanent digital medical record for every registered patient.

**In scope for Version 1.0:**
- End-to-end WhatsApp bot conversation design and implementation
- Patient registration data capture and validation (10 fields)
- Multi-doctor appointment booking for Online and Offline visits
- Real-time slot availability management
- Secretary and admin web dashboard
- Patient Medical Record Document (MRD) system
- REST API v1.0 — 40+ endpoints at `api-dr-indu-child-care.brahmaastra.ai`
- Database schema design with SQL DDL
- Security, privacy, and compliance (DPDP Act 2023, IT Act 2000)
- Testing strategy and UAT acceptance criteria
- Deployment architecture and infrastructure specification

**Explicitly out of scope:**
- Payment processing or billing integration
- EHR system integration with third-party platforms
- Insurance claim processing
- Doctor-side mobile application
- Video consultation link generation

### 1.3 Definitions & Abbreviations

| Term | Definition |
|---|---|
| **SRS** | Software Requirements Specification |
| **MRD** | Medical Record Document — the patient's longitudinal health file |
| **Bot** | The automated WhatsApp conversational agent |
| **WATI** | WhatsApp Team Inbox — third-party WhatsApp Business API SaaS platform |
| **n8n** | Node-based workflow automation engine used for backend orchestration |
| **WBA API** | WhatsApp Business API — Meta's official API for business messaging |
| **OTP** | One-Time Password — used for identity verification |
| **Slot** | A specific, pre-defined appointment time window (e.g., 10:00–10:30 AM) |
| **FR** | Functional Requirement |
| **NFR** | Non-Functional Requirement |
| **UAT** | User Acceptance Testing |
| **DDL** | Data Definition Language — SQL commands for creating database structures |
| **JWT** | JSON Web Token — used for API authentication |
| **TLS** | Transport Layer Security — encryption protocol for data in transit |
| **AES** | Advanced Encryption Standard — algorithm for data at rest encryption |
| **DPDP** | Digital Personal Data Protection Act, 2023 (India) |
| **IT Act** | Information Technology Act, 2000 (India) |
| **OAS** | OpenAPI Specification — standard format for describing REST APIs |

---

## 2. Business Context & Problem Statement

### 2.1 Current State — The Problem

Dr. Indu Child Care currently manages all patient registrations and appointment bookings through manual processes. The key pain points are:

| Pain Point | Business Impact |
|---|---|
| Phone booking unavailable at night or on holidays | Lost appointment opportunities; patient frustration |
| Manual data entry errors | Wrong contact numbers, wrong dates, duplicate records |
| No centralized digital patient database | Cannot retrieve history, track vaccination schedules |
| No automated slot management | Double bookings, overbooking, confusion |
| Secretary spends 40–60% of time on routine scheduling | High operational cost for low-value tasks |
| No mechanism to handle Online consultations | Patients must physically come for minor queries |
| Paper-based MRD | Risk of data loss, poor searchability, remote access impossible |

### 2.2 Desired State — The Solution

The WhatsApp Bot & Appointment System transforms the clinic's patient intake and scheduling into a fully automated, 24/7 digital workflow:

- **24/7 registration** — Parents can register their child at any time without calling the clinic
- **Instant appointment booking** — The entire booking flow completes in under 3 minutes on WhatsApp
- **Real-time slot management** — No double bookings; secretary overrides are immediately reflected
- **Permanent digital MRD** — Every patient has a structured, searchable, exportable medical record
- **Automated confirmations** — Patients receive WhatsApp confirmation instantly after booking
- **Intelligent escalation** — When the bot cannot handle a situation, it seamlessly hands off to the secretary

### 2.3 Business Goals & KPIs

| Goal | KPI | Target |
|---|---|---|
| Reduce secretary workload | % of bookings handled by bot without human intervention | ≥ 80% |
| Improve patient experience | Time from first WhatsApp message to confirmed appointment | ≤ 5 minutes |
| Eliminate no-shows | No-show rate after reminders implemented (Phase 2) | ≤ 10% |
| Build digital patient database | % of active patients with complete digital MRD | 100% |
| Ensure system availability | System uptime | ≥ 99.5% |
| Reduce booking errors | Appointment data entry error rate | ≤ 1% |

---

## 3. System Overview & Architecture

### 3.1 Three-Tier Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    CONVERSATION LAYER                        │
│  WhatsApp Business API (Meta) ←→ WATI Platform              │
│  Handles: Messaging, Buttons, List Menus, Templates          │
└────────────────────────┬─────────────────────────────────────┘
                         │ Webhooks (JSON payloads)
┌────────────────────────▼─────────────────────────────────────┐
│                  ORCHESTRATION LAYER                         │
│  n8n Workflow Engine                                         │
│  Handles: State management, validation, routing, retries     │
│                         │                                    │
│  REST API Middleware (Node.js / Express)                     │
│  Handles: Business logic, DB operations, JWT auth            │
└────────────────────────┬─────────────────────────────────────┘
                         │ SQL Queries / ORM
┌────────────────────────▼─────────────────────────────────────┐
│                      DATA LAYER                              │
│  MySQL / PostgreSQL Relational Database                      │
│  Tables: patients, appointments, time_slots,                 │
│          slot_availability, mrd_entries, bot_sessions,       │
│          audit_logs, admin_users, clinic_config              │
└──────────────────────────────────────────────────────────────┘
```

| Layer | Components & Responsibilities |
|---|---|
| **Conversation Layer** | WhatsApp Business API (Meta) ↔ WATI Platform. Handles messaging, interactive buttons, list menus, and approved message templates. |
| **Orchestration Layer** | n8n Workflow Engine — state management, validation, routing, retries. REST API Middleware (Node.js/Express) — business logic, DB operations, JWT auth. |
| **Data Layer** | MySQL / PostgreSQL. Tables: patients, appointments, time_slots, slot_availability, mrd_entries, bot_sessions, audit_logs, admin_users, clinic_config. |

### 3.2 Component Descriptions

#### 3.2.1 WhatsApp Business API (Meta)

The official API from Meta that allows businesses to send and receive messages programmatically. All user-facing messages, buttons, and list menus are delivered through this API. The clinic must have an approved WhatsApp Business account and verified phone number.

#### 3.2.2 WATI Platform

WATI (WhatsApp Team Inbox) is the SaaS layer sitting between the clinic and Meta's API. It provides:
- No-code/low-code interface for creating message templates
- Webhook configuration to forward incoming messages to n8n
- A human agent inbox for secretary takeover
- Broadcast messaging for reminders (Phase 2)
- A contact management dashboard

#### 3.2.3 n8n Workflow Engine

n8n is the brain of the bot's conversational logic. It receives webhook payloads from WATI on every incoming user message, reads the current bot session state from the database, validates user input, makes HTTP requests to the REST API middleware, and handles retries, timeouts, and error routing.

#### 3.2.4 REST API Middleware — Updated Base URL

> **Production Base URL:** `https://api-dr-indu-child-care.brahmaastra.ai/`
> **API Version:** v1.0.0 | OAS 3.0
> **Authentication:** Bearer JWT (RS256) | Token expiry: 3600 seconds
> All endpoints require `Authorization: Bearer <token>` except `POST /api/admin/login`

A Node.js/Express application that exposes a secure REST API consumed by n8n and the React dashboard. It implements all business logic, interfaces with the relational database via an ORM (Sequelize or Prisma), enforces JWT authentication, and returns structured JSON responses.

#### 3.2.5 Admin / Secretary Dashboard

A React.js web application providing clinic staff with a full appointment calendar, slot blocking/management, patient MRD access, manual appointment management, and real-time notifications via WebSocket.

### 3.3 Standard API Response Envelope

All API endpoints return responses in the following standardized format:

```json
// Success
{
  "success": true,
  "data": { },
  "meta": { "timestamp": "2026-02-27T10:30:00Z", "request_id": "req_abc123" }
}

// Error
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "...", "field": "..." },
  "meta": { "timestamp": "2026-02-27T10:30:00Z", "request_id": "req_abc123" }
}
```

---

## 4. Stakeholders & User Personas

### 4.1 Stakeholder Registry

| ID | Stakeholder | Type | Primary Concern |
|---|---|---|---|
| SH-01 | Patient's Parent / Guardian | External End User | Easy, fast appointment booking; clear confirmation |
| SH-02 | Clinic Secretary | Internal Operator | Simple dashboard; ability to override bot decisions |
| SH-03 | Dr. Indu (Clinic Owner) | Internal Owner | Accurate patient records; optimized schedule |
| SH-04 | Specialist Doctors | Internal Service Provider | Timely notification of appointments; patient context |
| SH-05 | Clinic Administrator | Internal Manager | Reports, analytics, system health |
| SH-06 | Developer / IT Team | Technical | Clear requirements, maintainable architecture |

### 4.2 User Personas

#### Persona 1: Priya — The Parent (Primary Bot User)

> **Age:** 32 | **Location:** Suburban Mumbai | **Tech Savvy:** Medium | **WhatsApp Usage:** Daily

**Goals:** Register quickly, book the right doctor, get a confirmation she can screenshot.

**Pain Points:** Unclear options, having to retype details she already provided, not knowing if booking went through.

---

#### Persona 2: Sunita — The Secretary (Dashboard User)

> **Age:** 38 | **Role:** Clinic Receptionist | **Tech Savvy:** Low-Medium | **Works:** 9 AM – 8 PM

**Goals:** Know the day's schedule at a glance, manage slots without calling IT, handle emergency walk-in additions.

**Pain Points:** Tech systems that require training, no real-time sync, no way to add emergency patients.

---

#### Persona 3: Dr. Indu — The Clinic Owner (Admin User)

> **Age:** 45 | **Role:** Owner + Chief Pediatrician | **Tech Savvy:** Medium

**Goals:** Reliable system needing zero manual intervention 95% of the time. Clean patient records. Reports on clinic performance.

**Pain Points:** Data inaccuracies, systems requiring micromanagement, no visibility into operational metrics.

---

## 5. Functional Requirements

### 5.1 Registration Module

#### 5.1.1 Registration Fields — 10 Fields, Strict Sequence

| # | Field | Input Type | Validation Rules | Error Message | Req | System Notes |
|---|---|---|---|---|---|---|
| 1 | Child's Full Name | Free text | 2–100 chars, letters & spaces only | "Enter a valid name with letters only (e.g., Arjun Kumar)" | ✅ | Auto capitalize |
| 2 | Gender | Button selection | Male / Female / Other | "Please select a valid gender option" | ✅ | No free text |
| 3 | Parent's Full Name | Free text | 2–100 chars, letters & spaces only | "Enter the parent or guardian's full name" | ✅ | Auto capitalize |
| 4 | Parent's Mobile | Numeric text | Exactly 10 digits, starts with 6/7/8/9 | "Enter a valid 10-digit Indian mobile number" | ✅ | Duplicate check required |
| 5 | Alternate Mobile | Numeric or SKIP | Same rules, must differ from primary | "Enter a different 10-digit number, or type SKIP" | ➖ | Store NULL if skipped |
| 6 | Child's Date of Birth | Date text | DD/MM/YYYY, past date, age < 18 | "Enter a valid date in DD/MM/YYYY format. Cannot be in the future." | ✅ | Auto-calc age |
| 7 | Email ID | Email text | Valid email format, max 150 chars | "Enter a valid email address (e.g., name@example.com)" | ✅ | Lowercase before save |
| 8 | Residential Address | Free text | 10–500 chars | "Provide full address including House No, Area, City, Pincode" | ✅ | Trim whitespace |
| 9 | Symptoms / Reason | Free text | 3–1000 chars OR VACCINATION | "Describe symptoms or type VACCINATION" | ✅ | Normalize keyword |
| 10 | Registration Source | System | whatsapp / dashboard / form / api | N/A | ✅ | Auto-assigned by backend |

#### 5.1.2 Registration Functional Requirements

- **FR-01:** The system shall present exactly one registration field per message, waiting for a valid response before displaying the next field.
- **FR-02:** The system shall validate each response immediately upon receipt. No field shall be skipped due to invalid input.
- **FR-03:** On receiving an invalid response, the system shall display a specific, descriptive error message that includes an example of the expected format, and re-prompt the identical field.
- **FR-04:** The system shall allow a maximum of **3 consecutive invalid attempts** per field. On the 4th failure, the system shall send a human escalation message and flag the session for secretary review.
- **FR-05:** On successful collection of all 10 fields, the system shall display a complete registration summary for the parent to review before saving.
- **FR-06:** The registration summary shall include all collected fields labeled clearly, with a confirmation button and an option to restart.
- **FR-07:** On confirmation, the system shall write the patient record to the `patients` table and generate a unique Patient ID in the format `DICC-YYYY-NNNN`.
- **FR-08:** The system shall create an empty MRD shell in the `mrd_entries` table linked to the new `patient_id` at the moment of registration.
- **FR-09:** If a user's WhatsApp number already exists with `registration_status = COMPLETE`, the system shall skip registration and display a welcome-back message.
- **FR-10:** The bot session state shall be persisted in the `bot_sessions` table after every step so that conversations can be resumed if the user disconnects.
- **FR-11:** If a user abandons registration mid-flow and returns within 24 hours, the system shall offer to continue from the last completed step. After 24 hours, the system shall restart from Step 1.

### 5.2 Appointment Booking Module

#### 5.2.1 Doctor Selection Options

| # | Doctor Type | Sub-text |
|---|---|---|
| 1 | Pulmonary Specialist | For breathing, asthma, lung issues |
| 2 | Non-Pulmonary Pediatrician | General child health, fever, infections |
| 3 | Vaccination Doctor | All routine and catch-up vaccinations |
| 4 | Any Available Doctor | First available slot across all doctors |

#### 5.2.2 Visit Type Options

| Icon | Visit Type | Use Case |
|---|---|---|
| 💉 | Vaccination | Child requires scheduled or catch-up vaccine |
| 🩺 | Routine Consultation | General health check or non-urgent issue |
| 🫁 | Pulmonary / Lung Problem | Breathing difficulties, chronic cough, asthma |
| 🔁 | Follow-up Visit | Return visit after a previous consultation |

#### 5.2.3 Time Slot Configuration (FR-31)

| Slot ID | Display Label | Start | End | Session | Status |
|---|---|---|---|---|---|
| S1 | 10:00 – 10:30 AM | 10:00 | 10:30 | MORNING | ✅ Active |
| S2 | 11:00 – 11:30 AM | 11:00 | 11:30 | MORNING | ✅ Active |
| S3 | 11:30 AM – 12:00 PM | 11:30 | 12:00 | MORNING | ✅ Active |
| S4 | 05:00 – 05:30 PM | 17:00 | 17:30 | EVENING | ✅ Active |
| S5 | 06:00 – 06:30 PM | 18:00 | 18:30 | EVENING | ✅ Active |
| S6 | 06:30 – 07:00 PM | 18:30 | 19:00 | EVENING | ✅ Active |

#### 5.2.4 Appointment Booking Functional Requirements (FR-12 to FR-42)

- **FR-12:** Immediately upon registration completion, the system shall display a booking prompt with **Yes** and **No** quick-reply buttons.
- **FR-13:** If the user selects **No**, the system shall terminate the session while preserving the patient record.
- **FR-14:** If the user selects **Yes**, the system shall immediately begin the appointment booking sub-flow starting with Mode Selection.
- **FR-15:** The system shall display an appointment mode selection message with two interactive buttons: **Online Consultation** and **Clinic Visit (Offline)**.
- **FR-28:** The system shall display only **available** time slots. Booked or admin-blocked slots shall not appear.
- **FR-30:** If **zero slots** are available on the requested date, the system shall automatically query the next 7 days and present the next 3 available dates.
- **FR-32:** Slot timings shall be configurable by clinic admin from the dashboard without requiring a code change.
- **FR-35:** On receiving **CONFIRM**, the system shall atomically create the appointment record and mark the slot as booked in a single DB transaction.
- **FR-36:** On receiving **EDIT**, the system shall restart from Mode Selection while retaining all registration data.
- **FR-38:** Users shall be able to cancel by sending `CANCEL [appointment_id]`.
- **FR-39:** Bot-initiated cancellations are blocked within **2 hours** of the appointment time.
- **FR-41:** Users shall be able to reschedule by sending `RESCHEDULE [appointment_id]`.
- **FR-42:** On successful reschedule, the old slot shall be freed and the new slot booked **atomically** to prevent double-booking.

### 5.3 Secretary / Admin Dashboard

- **FR-43:** The dashboard shall be a web application accessible via standard browsers requiring username/password login.
- **FR-44:** The dashboard homepage shall display today's appointment schedule as a timeline view.
- **FR-47:** Secretary shall be able to **block** time slots — blocked slots immediately disappear from the bot's available options.
- **FR-48:** Secretary shall be able to **unblock** previously blocked slots.
- **FR-49:** Secretary shall be able to **manually add appointments** from the dashboard for walk-in patients.
- **FR-52:** The dashboard shall display a **notification badge** for all new appointments booked through the bot in the last 30 minutes.
- **FR-53:** Dashboard shall have a **patient search** by: `patient_id`, child name, parent name, or parent mobile number.
- **FR-54:** Dashboard shall include a **slot configuration panel** where admin can add, remove, or modify time slots and define clinic holidays.

### 5.4 MRD (Medical Record Document) System

- **FR-55:** Every patient registration shall auto-create a corresponding MRD record identified by the same `patient_id`.
- **FR-57:** Authorized clinic staff (doctors and admin **only**, not secretary) shall be able to add or edit clinical notes.
- **FR-59:** The full MRD shall be **exportable as a PDF** with the clinic's letterhead.
- **FR-60:** The MRD shall track the patient's **vaccination history** separately — all `visit_type = 'VACCINATION'` appointments auto-populate a vaccination ledger.
- **FR-61:** The system shall **never delete MRD records**. Cancellations are marked `CANCELLED` with a timestamp.

---

## 6. Bot State Machine

### 6.1 State Definitions

| State ID | State Name | Description | Input Expected | Output |
|---|---|---|---|---|
| S00 | WELCOME | First contact | Any message | Welcome message + begin registration |
| S01 | COLLECT_CHILD_NAME | Waiting for child's name | Free text | Next question or error |
| S02 | COLLECT_PARENT_NAME | Waiting for parent's name | Free text | Next question or error |
| S03 | COLLECT_MOBILE | Waiting for mobile number | 10-digit numeric | Next question or error |
| S04 | COLLECT_ALT_MOBILE | Waiting for alternate mobile or SKIP | 10-digit or SKIP | Next question or error |
| S05 | COLLECT_DOB | Waiting for date of birth | DD/MM/YYYY | Next question or error |
| S06 | COLLECT_EMAIL | Waiting for email | Email format | Next question or error |
| S07 | COLLECT_ADDRESS | Waiting for address | Free text | Next question or error |
| S08 | COLLECT_SYMPTOMS | Waiting for symptoms | Free text or VACCINATION | Registration summary |
| S09 | CONFIRM_REGISTRATION | Showing summary, awaiting confirmation | Button: Confirm / Start Over | Save + S10, or restart S01 |
| S10 | ASK_BOOK_APPOINTMENT | Ask if user wants to book | Button: Yes / No | S11 or S20 |
| S11 | SELECT_MODE | Waiting for Online/Offline | Button selection | Next step or error |
| S12 | SELECT_DOCTOR | Waiting for doctor type | List selection | Next step or error |
| S13 | SELECT_VISIT_TYPE | Waiting for visit purpose | List selection | Next step or error |
| S14 | SELECT_DATE | Waiting for preferred date | DD/MM/YYYY | Slot query + S15 |
| S15 | SELECT_TIME_SLOT | Showing available slots | Button/List selection | S16 or date retry |
| S16 | SHOW_SUMMARY | Displaying appointment summary | Button: Confirm / Edit | S17 |
| S17 | AWAIT_CONFIRM | Awaiting CONFIRM or EDIT | Button selection | S18 or S11 |
| S18 | BOOKING_CONFIRMED | Booking complete in DB | Auto | S19 |
| S19 | SEND_CONFIRMATION | Sending WhatsApp confirmation | Auto | S20 |
| S20 | SESSION_END | Terminal state | None | Session closed |
| ERR | ERROR_ESCALATION | Max retries exceeded | None | Escalation message + flag |

### 6.2 State Transition Flow

```
[New User]                             [Returning User]
    │                                         │
    ▼                                         │
  S00 WELCOME                                 │
    │                                         │
  S01 CHILD NAME ◀──(retry on fail)          │
  S02 PARENT NAME ◀──(retry on fail)         │
  S03 MOBILE ◀──(retry on fail)              │
  S04 ALT MOBILE ◀──(retry/skip)             │
  S05 DATE OF BIRTH ◀──(retry on fail)       │
  S06 EMAIL ◀──(retry on fail)               │
  S07 ADDRESS ◀──(retry on fail)             │
  S08 SYMPTOMS ◀──(retry on fail)            │
    │                                         │
  S09 CONFIRM REGISTRATION ──────────────────┘
    │                         │
  [Confirm]         [Start Over] ──▶ S01
    │
  S10 ASK BOOK APPOINTMENT
    │               │
  [Yes]           [No] ──▶ S20 SESSION END
    │
  S11 SELECT MODE
  S12 SELECT DOCTOR
  S13 SELECT VISIT TYPE
  S14 SELECT DATE ◀──(no slots / invalid: re-prompt)
  S15 SELECT TIME SLOT
  S16 SHOW SUMMARY
  S17 AWAIT CONFIRM ──[EDIT]──▶ S11
    │
  [CONFIRM]
  S18 BOOKING CONFIRMED
  S19 SEND CONFIRMATION MESSAGE
  S20 SESSION END
```

### 6.3 State Transition Table

| From State | Trigger Condition | Next State |
|---|---|---|
| S00 | Any incoming message from new number | S01 |
| S00 | Registered number found in DB | S10 (skip registration) |
| S01–S08 | Valid input received | Next sequential state |
| S01–S08 | Invalid input, retry count < 3 | Same state (re-prompt) |
| S01–S08 | Invalid input, retry count = 3 | ERR (escalation) |
| S09 | "Confirm Details" button | S10 |
| S09 | "Start Over" button | S01 (reset session_data) |
| S10 | "Yes, Book Now" button | S11 |
| S10 | "No, Later" button | S20 |
| S14 | Valid date with no slots | S14 (show alternatives, re-prompt) |
| S17 | "CONFIRM" button | S18 |
| S17 | "EDIT" button | S11 (clear appointment data) |
| S18 | DB write failure | S17 (retry once, then ERR) |

---

## 7. Database Design & Data Storage

### 7.1 Design Principles

- All tables use singular noun names in `snake_case`
- All user-visible primary keys are string-based with a meaningful prefix (`DICC-`, `APT-`)
- All `TIMESTAMP` fields store **UTC** time
- **Soft deletes only** — no records are hard-deleted; `status` fields and `is_deleted` flags are used
- Foreign key constraints enforced at the database level
- Index strategy defined for all frequently queried columns

### 7.2 Core Tables Overview

| Table | PK Format | Purpose |
|---|---|---|
| `patients` | `DICC-YYYY-NNNN` | One record per registered patient (child). Parent mobile is globally unique. |
| `appointments` | `APT-YYYY-NNNNN` | One record per appointment booking. Contains full booking lifecycle status. |
| `time_slots` | `S1–S6` | Master reference for all possible time slots. Configurable by admin from dashboard. |
| `slot_availability` | Auto INT | Tracks real-time booking status per slot/date/doctor_type. Queried during booking. |
| `mrd_entries` | Auto INT | Clinical visit notes linked to a patient MRD. One entry per completed appointment. |
| `bot_sessions` | VARCHAR(100) | Persists conversational state for each WhatsApp session. Enables mid-conversation resume. |
| `audit_logs` | Auto BIGINT | Immutable log of all significant system events for compliance and security. |
| `admin_users` | Auto INT | Dashboard user accounts with role-based access control (RBAC). |
| `clinic_config` | `config_key` | Key-value store for all clinic-level configuration settings. |

### 7.3 Key Table: `patients`

```sql
CREATE TABLE patients (
  patient_id           VARCHAR(20)  NOT NULL,
  child_full_name      VARCHAR(100) NOT NULL,
  date_of_birth        DATE         NOT NULL,
  parent_full_name     VARCHAR(100) NOT NULL,
  parent_mobile        VARCHAR(15)  NOT NULL,
  alt_mobile           VARCHAR(15),
  email                VARCHAR(150) NOT NULL,
  address              TEXT         NOT NULL,
  symptoms_notes       TEXT,
  registration_status  ENUM('PENDING','COMPLETE') NOT NULL DEFAULT 'COMPLETE',
  registered_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
  whatsapp_session_id  VARCHAR(100),
  is_deleted           BOOLEAN      NOT NULL DEFAULT FALSE,
  deleted_at           TIMESTAMP,
  created_by           VARCHAR(50)  NOT NULL DEFAULT 'BOT',
  PRIMARY KEY (patient_id),
  UNIQUE INDEX idx_parent_mobile (parent_mobile),
  INDEX idx_child_name (child_full_name),
  INDEX idx_registered_at (registered_at)
);
```

### 7.4 Key Table: `appointments`

```sql
CREATE TABLE appointments (
  appointment_id       VARCHAR(20)  NOT NULL,
  patient_id           VARCHAR(20)  NOT NULL,
  appointment_mode     ENUM('ONLINE','OFFLINE') NOT NULL,
  doctor_type          ENUM('PULMONARY','NON_PULMONARY','VACCINATION','ANY') NOT NULL,
  assigned_doctor_name VARCHAR(100),
  visit_type           ENUM('VACCINATION','CONSULTATION','PULMONARY','FOLLOWUP') NOT NULL,
  appointment_date     DATE         NOT NULL,
  time_slot_id         VARCHAR(10)  NOT NULL,
  status               ENUM('PENDING','CONFIRMED','CANCELLED','COMPLETED','RESCHEDULED','NO_SHOW')
                                    NOT NULL DEFAULT 'CONFIRMED',
  confirmation_sent    BOOLEAN      NOT NULL DEFAULT FALSE,
  reminder_24h_sent    BOOLEAN      NOT NULL DEFAULT FALSE,
  reminder_2h_sent     BOOLEAN      NOT NULL DEFAULT FALSE,
  cancelled_at         TIMESTAMP,
  cancelled_by         VARCHAR(50),
  cancellation_reason  TEXT,
  secretary_notes      TEXT,
  created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
  last_updated_at      TIMESTAMP    ON UPDATE NOW(),
  last_updated_by      VARCHAR(50),
  PRIMARY KEY (appointment_id),
  FOREIGN KEY (patient_id)   REFERENCES patients(patient_id),
  FOREIGN KEY (time_slot_id) REFERENCES time_slots(slot_id),
  INDEX idx_patient_id       (patient_id),
  INDEX idx_appointment_date (appointment_date),
  INDEX idx_status           (status),
  INDEX idx_doctor_date      (doctor_type, appointment_date)
);
```

### 7.5 Key Table: `slot_availability`

```sql
CREATE TABLE slot_availability (
  id               INT           NOT NULL AUTO_INCREMENT,
  slot_id          VARCHAR(10)   NOT NULL,
  slot_date        DATE          NOT NULL,
  doctor_type      ENUM('PULMONARY','NON_PULMONARY','VACCINATION','ANY') NOT NULL,
  is_booked        BOOLEAN       NOT NULL DEFAULT FALSE,
  appointment_id   VARCHAR(20),
  blocked_by_admin BOOLEAN       NOT NULL DEFAULT FALSE,
  blocked_reason   VARCHAR(255),
  blocked_by       VARCHAR(100),
  blocked_at       TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_slot_date_doctor (slot_id, slot_date, doctor_type),
  FOREIGN KEY (slot_id)        REFERENCES time_slots(slot_id),
  FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id),
  INDEX idx_slot_date   (slot_date),
  INDEX idx_doctor_date (doctor_type, slot_date)
);
```

> **Business Rule:** A slot is available if and only if a row for `(slot_id, slot_date, doctor_type)` does NOT exist, OR it exists with `is_booked = FALSE` AND `blocked_by_admin = FALSE`.

### 7.6 Key Table: `bot_sessions`

```sql
CREATE TABLE bot_sessions (
  session_id       VARCHAR(100)  NOT NULL,
  wa_number        VARCHAR(15)   NOT NULL,
  patient_id       VARCHAR(20),
  current_state    VARCHAR(50)   NOT NULL DEFAULT 'S00_WELCOME',
  session_data     JSON,
  retry_count      INT           NOT NULL DEFAULT 0,
  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
  last_activity_at TIMESTAMP     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  created_at       TIMESTAMP     NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMP     NOT NULL,
  PRIMARY KEY (session_id),
  INDEX idx_wa_number     (wa_number),
  INDEX idx_current_state (current_state),
  INDEX idx_expires_at    (expires_at)
);
```

**`session_data` JSON example:**
```json
{
  "child_full_name": "Arjun Sharma",
  "parent_full_name": "Rohit Sharma",
  "parent_mobile": "9876543210",
  "date_of_birth": "2020-04-15",
  "email": "rohit@example.com",
  "address": "42, Lakeview Society, Mumbai - 400053",
  "symptoms_notes": "Frequent cough",
  "appointment_mode": "OFFLINE",
  "doctor_type": "PULMONARY",
  "visit_type": "CONSULTATION",
  "appointment_date": "2026-02-28",
  "time_slot_id": "S2"
}
```

### 7.7 RBAC — Role Permissions Matrix

| Permission | SUPER_ADMIN | ADMIN | SECRETARY | DOCTOR |
|---|:---:|:---:|:---:|:---:|
| View all appointments | ✅ | ✅ | ✅ | ✅ (own only) |
| Add / Edit appointments | ✅ | ✅ | ✅ | ❌ |
| Block / Unblock slots | ✅ | ✅ | ✅ | ❌ |
| View patient MRD | ✅ | ✅ | ✅ (basic) | ✅ |
| Add / Edit MRD entries | ✅ | ✅ | ❌ | ✅ |
| Export MRD PDF | ✅ | ✅ | ✅ | ✅ |
| Manage system settings | ✅ | ✅ | ❌ | ❌ |
| Manage admin users | ✅ | ❌ | ❌ | ❌ |
| View audit logs | ✅ | ✅ | ❌ | ❌ |

### 7.8 Entity Relationship Diagram

```
┌─────────────┐        ┌──────────────────┐       ┌─────────────────┐
│   patients  │        │   appointments   │       │   time_slots    │
│─────────────│        │──────────────────│       │─────────────────│
│ patient_id  │──1:N──▶│ appointment_id   │──N:1──│ slot_id         │
│ child_name  │        │ patient_id (FK)  │       │ slot_label      │
│ parent_mob  │        │ time_slot_id(FK) │       │ start_time      │
│ ...         │        │ doctor_type      │       │ end_time        │
└─────────────┘        │ status           │       │ session         │
       │ 1:N           └──────────────────┘       └─────────────────┘
       ▼                        │ 1:N                     │ 1:N
┌──────────────┐      ┌──────────────────┐     ┌──────────────────────┐
│  mrd_entries │      │  audit_logs      │     │  slot_availability   │
│──────────────│      │──────────────────│     │──────────────────────│
│ entry_id     │      │ log_id           │     │ slot_id (FK)         │
│ patient_id   │      │ entity_type      │     │ slot_date            │
│ appointment_id│     │ actor            │     │ doctor_type          │
│ diagnosis    │      │ old_value        │     │ is_booked            │
│ prescription │      │ new_value        │     │ blocked_by_admin     │
└──────────────┘      └──────────────────┘     └──────────────────────┘
```

---

## 8. API Specification — v1.0.0

> **🌐 Production Base URL:** `https://api-dr-indu-child-care.brahmaastra.ai/`
>
> **🔒 Authentication:** `POST /api/admin/login` → `Bearer JWT` (RS256, expires 3600s)
>
> All endpoints require `Authorization: Bearer <token>` **except** `POST /api/admin/login`
>
> OAS 3.0 compliant · All timestamps in UTC · Responses follow the standard success/error envelope

### 8.1 API Groups Overview

| Group | Endpoints | Description |
|---|:---:|---|
| Admin | 4 | Login, user management (SUPER_ADMIN only for create/delete) |
| Patients | 5 | Registration, lookup, update — supports DICC ID, mobile, and WhatsApp ID |
| Appointments | 7 | Booking, cancellation, rescheduling, stats — atomic slot operations |
| Doctors | 5 | Doctor profile CRUD — soft delete preserves historical data |
| Slots | 6 | Availability queries, template config, daily overrides for blocking/unblocking |
| MRD | 3 | Medical record documents, clinical entries, vaccination history |
| WhatsApp Bot | 12 | Complete bot integration: patient lookup, session CRUD, escalation, chat log |
| System | 4 | Health check, clinic config, audit logs |

### 8.2 Authentication

#### `POST /api/admin/login` — Public (no token required)

Returns a JWT access token for all subsequent requests.

**Request body:**

```json
{
  "username": "sunita_secretary",
  "password": "••••••••••••"
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGci...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "role": "SECRETARY"
  }
}
```

| Field | Type | Required | Description |
|---|---|:---:|---|
| `username` | string | ✅ | Admin username |
| `password` | string | ✅ | Account password — hashed bcrypt ≥12 cost factor in DB |

---

### 8.3 Admin Endpoints

| Method | Endpoint | Description | Auth / Role |
|---|---|---|---|
| `POST` | `/api/admin/login` | Admin / Secretary login | 🌐 Public |
| `GET` | `/api/admin/users` | List all admin users | SUPER_ADMIN / ADMIN |
| `POST` | `/api/admin/users` | Create a new admin user | SUPER_ADMIN only |
| `PATCH` | `/api/admin/users/{id}` | Update an admin user (role, status, password) | SUPER_ADMIN only |

---

### 8.4 Patient Endpoints

| Method | Endpoint | Description | Auth / Role |
|---|---|---|---|
| `GET` | `/api/patients` | List patients — paginated with search filter | SECRETARY+ |
| `POST` | `/api/patients` | Register new patient (Dashboard / Admin) | SECRETARY+ |
| `POST` | `/api/patients/form` | Register patient via online web form | SECRETARY+ |
| `POST` | `/api/patients/whatsapp` | Register patient via WhatsApp bot (includes `wa_id`) | Bot service account |
| `GET` | `/api/patients/by-wa/{wa_id}` | Lookup patient by WhatsApp ID at session start | Bot service account |
| `GET` | `/api/patients/{patient_id}` | Get patient by DICC ID or mobile number | All roles |
| `PUT` | `/api/patients/{patient_id}` | Update patient details — all changes audit-logged | SECRETARY+ |

**Registration request body (POST /api/patients):**

```json
{
  "child_full_name": "Arjun Sharma",
  "date_of_birth": "2020-04-15",
  "parent_full_name": "Rohit Sharma",
  "parent_mobile": "9876543210",
  "alt_mobile": "9812345678",
  "email": "rohit.sharma@gmail.com",
  "address": "42, Lakeview Society, Andheri West, Mumbai - 400053",
  "symptoms_notes": "Frequent cough and mild fever"
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "patient_id": "DICC-2026-0047",
    "registration_status": "COMPLETE",
    "registered_at": "2026-02-27T10:30:00Z"
  }
}
```

> **409 CONFLICT** — mobile number already registered → returns existing `patient_id`

---

### 8.5 Appointment Endpoints

| Method | Endpoint | Description | Key Notes |
|---|---|---|---|
| `GET` | `/api/appointments` | List with filters: date, status, doctor_type, mode | Paginated — up to 100 per page |
| `POST` | `/api/appointments` | Book appointment — Dashboard / Admin | Atomic: appt + slot in one transaction |
| `POST` | `/api/appointments/form` | Book via public web form (`wa_id`) | Same validation as dashboard booking |
| `POST` | `/api/appointments/whatsapp` | Book via WhatsApp bot (`wa_id`) | Resolves patient from `wa_id` |
| `GET` | `/api/appointments/stats` | Stats for today or specific date | Returns counts by status, mode, doctor |
| `GET` | `/api/appointments/{id}` | Get single appointment by ID | Returns full appointment object |
| `PATCH` | `/api/appointments/{id}` | Update / reschedule appointment | Old slot freed + new slot booked atomically |
| `PATCH` | `/api/appointments/{id}/cancel` | Cancel appointment | BOT-cancel blocked within 2h cutoff |
| `GET` | `/api/appointments/by-wa/{wa_id}` | Get upcoming appointments by WhatsApp ID | Used by bot for status lookups |

**Book appointment request (POST /api/appointments):**

```json
{
  "patient_id": "DICC-2026-0047",
  "appointment_mode": "OFFLINE",
  "doctor_type": "PULMONARY",
  "visit_type": "CONSULTATION",
  "appointment_date": "2026-02-28",
  "time_slot_id": "S2"
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "appointment_id": "APT-2026-00291",
    "status": "CONFIRMED",
    "patient_id": "DICC-2026-0047",
    "appointment_date": "2026-02-28",
    "time_slot": { "slot_id": "S2", "label": "11:00 – 11:30 AM" },
    "created_at": "2026-02-27T10:35:00Z"
  }
}
```

---

### 8.6 Doctor Endpoints

| Method | Endpoint | Description | Auth / Role |
|---|---|---|---|
| `GET` | `/api/doctors` | List all doctor profiles | All roles |
| `POST` | `/api/doctors` | Create a new doctor profile | ADMIN+ |
| `GET` | `/api/doctors/{doctor_id}` | Get doctor by ID | All roles |
| `PATCH` | `/api/doctors/{doctor_id}` | Update doctor profile | ADMIN+ |
| `DELETE` | `/api/doctors/{doctor_id}` | Soft delete — historical appointment data preserved | SUPER_ADMIN only |

---

### 8.7 Slot Endpoints

| Method | Endpoint | Description | Key Notes |
|---|---|---|---|
| `GET` | `/api/slots/available` | Query available slots for date + doctor_type | Response time target < 200ms |
| `GET` | `/api/slots/config` | Get all slot templates | Returns full `time_slots` table with sort_order |
| `PUT` | `/api/slots/config` | Bulk update slot templates | Replaces all — takes effect immediately |
| `POST` | `/api/slots/config/add` | Create a new slot template | ADMIN or above — new slots appear in bot |
| `DELETE` | `/api/slots/config/{slot_id}` | Delete a slot template | Soft delete — existing bookings preserved |
| `POST` | `/api/slots/daily-update` | Block or unblock a specific slot for a day | SECRETARY+ — instant effect on bot availability |

**Slot availability query:**

```
GET /api/slots/available?doctor_type=PULMONARY&date=2026-02-28
```

**Response `200 OK`:**

```json
{
  "date": "2026-02-28",
  "doctor_type": "PULMONARY",
  "is_clinic_open": true,
  "available_slots": [
    { "slot_id": "S1", "label": "10:00 – 10:30 AM", "session": "MORNING" },
    { "slot_id": "S4", "label": "05:00 – 05:30 PM", "session": "EVENING" }
  ],
  "total_available": 2,
  "next_available_dates": null
}
```

> When `total_available = 0`, the response includes `next_available_dates: ["2026-03-01", "2026-03-02", "2026-03-03"]`

---

### 8.8 MRD Endpoints

| Method | Endpoint | Description | Auth / Role |
|---|---|---|---|
| `GET` | `/api/mrd/{patient_id}` | Get full patient MRD with vaccination history | All roles (clinical notes: DOCTOR/ADMIN only) |
| `POST` | `/api/mrd/entry` | Add clinical entry to patient MRD | DOCTOR / ADMIN only |
| `GET` | `/api/mrd/appointment/{appointment_id}` | Get MRD entry by appointment ID | DOCTOR / ADMIN only |

---

### 8.9 WhatsApp Bot Integration Endpoints

> These endpoints are called by the **n8n orchestration layer** — not directly by browser clients. All require the n8n bot service account JWT.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/patients/whatsapp` | Register patient — same validation as `/api/patients` + `wa_id` field |
| `GET` | `/api/patients/by-wa/{wa_id}` | Lookup patient at session start. `200` → skip registration. `404` → begin registration. |
| `POST` | `/api/appointments/whatsapp` | Book appointment using `wa_id` instead of `patient_id` |
| `GET` | `/api/appointments/by-wa/{wa_id}` | Get upcoming confirmed appointments for a WhatsApp user |
| `GET` | `/api/appointments/reminders/pending-24h` | Get appointments for tomorrow — used by reminder scheduler CRON |
| `PATCH` | `/api/appointments/reminders/{id}/mark-sent` | Mark 24h or 2h reminder as sent — updates timestamp |
| `GET` | `/api/bot/session/{wa_id}` | Get active bot session — called on every incoming message |
| `POST` | `/api/bot/session/create` | Create new bot session (state: `S00_WELCOME`, 24h expiry) |
| `PATCH` | `/api/bot/session/update` | Update session state and merge partial `session_data` JSON |
| `POST` | `/api/bot/escalate` | Flag session for human review — notifies secretary dashboard |
| `GET` | `/api/bot/interactions/unregistered` | Get unregistered bot interactions (leads) |
| `POST` | `/api/bot/chat/log` | Log inbound/outbound chat message for registered patients |
| `GET` | `/api/bot/chat/history/{wa_id}` | Get last 10 chat messages in chronological order |

**Get bot session response example:**

```json
{
  "session_id": "sess_wa_xyz987",
  "wa_number": "919876543210",
  "current_state": "S05_COLLECT_DOB",
  "retry_count": 0,
  "is_active": true,
  "expires_at": "2026-02-28T10:00:00Z",
  "session_data": {
    "child_full_name": "Arjun Sharma",
    "parent_full_name": "Rohit Sharma",
    "parent_mobile": "9876543210"
  }
}
```

---

### 8.10 System Endpoints

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/system/health` | Health check — returns service status | 🌐 Public |
| `GET` | `/api/config` | Get all clinic config key-value pairs | ADMIN+ |
| `PATCH` | `/api/config` | Update clinic config values | SUPER_ADMIN only |
| `GET` | `/api/audit/logs` | Get audit logs with filters | SUPER_ADMIN / ADMIN |

**Health check response:**

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-02-27T10:00:00Z",
  "services": {
    "database": "connected",
    "wati": "reachable",
    "n8n": "running"
  }
}
```

---

### 8.11 API Error Codes

| HTTP | Error Code | Meaning |
|:---:|---|---|
| `400` | `VALIDATION_ERROR` | Request body fails schema validation — field-level errors returned |
| `401` | `UNAUTHORIZED` | Missing or invalid JWT token |
| `403` | `FORBIDDEN` | Valid token but insufficient role permissions |
| `404` | `NOT_FOUND` | Resource (patient, appointment, slot) not found |
| `409` | `CONFLICT` | Duplicate registration (mobile) or slot already booked — returns `next_available_dates` |
| `422` | `BUSINESS_RULE_VIOLATION` | Valid data but violates business logic (e.g., cancel within 2h cutoff) |
| `429` | `RATE_LIMIT_EXCEEDED` | Max 10 requests/second per phone number |
| `500` | `INTERNAL_SERVER_ERROR` | Unexpected server error |
| `503` | `SERVICE_UNAVAILABLE` | Database or external service unreachable |

---

## 9. Security & Privacy Model

### 9.1 Data Classification

| Data Class | Examples | Required Protection |
|---|---|---|
| Highly Sensitive | Diagnosis, prescription, clinical notes | Encryption at rest + access control (doctors only) |
| Sensitive | Patient name, DOB, mobile, email, address | Encryption at rest + access control (all staff) |
| Internal | Appointment schedule, slot availability | Access control (all staff) |
| Public | Clinic name, address, contact number | No special protection |

### 9.2 Encryption

- **Data at rest:** AES-256 at the application layer + database-level encryption (MySQL TDE / PostgreSQL pgcrypto)
- **Data in transit:** TLS 1.2 or higher — HTTP connections auto-redirect to HTTPS
- **WhatsApp messages:** End-to-end encrypted by Meta's WhatsApp Business API
- **Password storage:** bcrypt with cost factor ≥ 12 — plaintext passwords are never stored

### 9.3 Authentication & Authorization

- All API endpoints (except `POST /api/admin/login`) require a valid JWT Bearer token
- JWTs are signed with **RS256** (RSA 256-bit asymmetric key), expiry 3600 seconds
- Dashboard sessions expire after **8 hours** of inactivity
- RBAC enforced at both API and UI layer

### 9.4 Input Validation & Injection Prevention

- All user inputs received via the bot and API are validated and sanitized before processing
- Parameterized queries (prepared statements) used for all database operations — raw string concatenation in SQL is strictly prohibited
- API requests validated against a schema (Joi or Zod) before reaching business logic
- Rate limiting: max **10 requests/second per phone number**

### 9.5 Compliance

| Regulation | Requirement | Implementation |
|---|---|---|
| IT Act 2000 (India) | Protect sensitive personal data | Encryption, access controls, audit logs |
| DPDP Act 2023 | Data minimization, purpose limitation | Only collect required fields; no third-party data sharing |
| DPDP Act 2023 | Data retention | 7-year retention per medical records regulation |
| DPDP Act 2023 | Consent | Registration flow includes explicit consent before data collection |
| WhatsApp Business Policy | Template messages only for outbound | All bot-initiated messages use approved WATI templates |

### 9.6 Data Retention Policy

| Data Type | Retention Period | Action on Expiry |
|---|---|---|
| Patient registration data | 7 years after last visit | Anonymized (names/contact replaced with hash) |
| MRD entries | 7 years after last entry | Archived to cold storage (read-only access) |
| Appointment records | 7 years | Archived |
| Audit logs | 3 years | Purged |
| Bot session data | 24h (active) / 30 days (completed) | Purged |
| Admin user accounts | Retained until manually deactivated | Deactivated on staff departure, deleted after 90 days |

---

## 10. Non-Functional Requirements

### 10.1 Performance

| ID | Requirement | Metric |
|---|---|---|
| NFR-01 | Bot response latency | < 3 seconds P95 from message receipt to bot reply |
| NFR-02 | API response time | < 500ms for reads; < 1 second for writes |
| NFR-03 | Dashboard page load | < 2 seconds initial load on broadband |
| NFR-04 | Database query time | All indexed queries < 100ms |
| NFR-05 | Slot availability check | < 200ms from API call to response |

### 10.2 Scalability

| ID | Requirement | Metric |
|---|---|---|
| NFR-06 | Concurrent bot sessions | Support ≥ 500 simultaneous WhatsApp conversations |
| NFR-07 | Daily appointment volume | Up to 200 appointments/day without degradation |
| NFR-08 | Patient database size | Performance maintained with up to 50,000 patient records |
| NFR-09 | Horizontal scaling | Stateless API middleware — supports load balancing |

### 10.3 Availability & Reliability

| ID | Requirement | Metric |
|---|---|---|
| NFR-10 | System uptime | ≥ 99.5% monthly (max 3.65 hours downtime/month) |
| NFR-11 | Planned maintenance | 2:00–4:00 AM IST on weekdays only |
| NFR-12 | Data durability | Zero data loss for committed transactions |
| NFR-13 | DB replication | Primary-replica setup with automatic failover |
| NFR-14 | API retry logic | n8n retries failed calls up to 3 times with exponential backoff (1s, 3s, 9s) |
| NFR-15 | Message delivery | WhatsApp confirmations delivered within 30 seconds of appointment creation |

### 10.4 Usability

| ID | Requirement | Metric |
|---|---|---|
| NFR-16 | Registration completion rate | ≥ 85% of users who start registration shall complete it |
| NFR-17 | Bot message readability | Written at or below 7th-grade reading level |
| NFR-18 | Maximum taps per step | ≤ 2 user interactions per step |
| NFR-19 | Error message clarity | All error messages include expected format and a concrete example |
| NFR-20 | Dashboard usability | A new secretary can perform core tasks after reading a 1-page guide |

---

## 11. Testing Strategy & UAT Acceptance Criteria

### 11.1 Testing Levels

- **Unit Testing:** All validation functions (mobile, email, date, name) with valid and invalid cases. Target: **≥ 80% code coverage** on business logic files.
- **Integration Testing:** n8n → REST API → Database round trips. WATI webhook → n8n trigger chain. Database transaction atomicity (booking + slot marking).
- **End-to-End Testing:** Full bot conversation flow on real WhatsApp Business sandbox. All branching paths: No to booking, EDIT flow, no slots, cancellation, reschedule.
- **Performance Testing:** 500 concurrent simulated bot sessions for 10 minutes. Acceptance: P95 < 3 seconds, error rate < 0.1%.
- **Security Testing:** SQL injection, JWT manipulation, RBAC verification, input fuzzing.

### 11.2 UAT Test Cases — 30 Cases

| ID | Test Scenario | Expected Outcome | Status |
|---|---|---|---|
| TC-01 | New user full registration | Patient record in DB with DICC ID; MRD shell created | ☐ Pass / ☐ Fail |
| TC-02 | Registration with invalid mobile | Error message + re-prompt same field | ☐ Pass / ☐ Fail |
| TC-03 | Registration with past DOB | Accepted, move to next field | ☐ Pass / ☐ Fail |
| TC-04 | Registration with future DOB | Error: Date cannot be in the future | ☐ Pass / ☐ Fail |
| TC-05 | Max retries exceeded | Escalation message; secretary flagged in dashboard | ☐ Pass / ☐ Fail |
| TC-06 | Returning user — skip registration | Bot skips to appointment prompt | ☐ Pass / ☐ Fail |
| TC-07 | Book offline appointment — pulmonary | Appointment confirmed; APT-ID returned | ☐ Pass / ☐ Fail |
| TC-08 | Book online appointment — vaccination | Appointment confirmed | ☐ Pass / ☐ Fail |
| TC-09 | Select date with no slots | No slots available + next 3 dates shown | ☐ Pass / ☐ Fail |
| TC-10 | Select a Sunday | Clinic is closed on Sundays error | ☐ Pass / ☐ Fail |
| TC-11 | Date beyond 30 days | Cannot book more than 30 days in advance | ☐ Pass / ☐ Fail |
| TC-12 | Edit appointment after summary | Returns to Mode Selection; previous data cleared | ☐ Pass / ☐ Fail |
| TC-13 | Cancel appointment via bot | Cancelled; slot freed; confirmation sent | ☐ Pass / ☐ Fail |
| TC-14 | Cancel within 2 hours | Please contact clinic directly | ☐ Pass / ☐ Fail |
| TC-15 | Reschedule appointment | Old slot freed; new slot booked atomically | ☐ Pass / ☐ Fail |
| TC-16 | Secretary blocks a slot | Slot disappears from bot options immediately | ☐ Pass / ☐ Fail |
| TC-17 | Secretary unblocks slot | Slot reappears in bot options | ☐ Pass / ☐ Fail |
| TC-18 | MRD creation on registration | `mrd_entries` shell created | ☐ Pass / ☐ Fail |
| TC-19 | MRD note added after visit | `mrd_entries` record populated with notes | ☐ Pass / ☐ Fail |
| TC-20 | MRD export as PDF | PDF generated with all visit history | ☐ Pass / ☐ Fail |
| TC-21 | Duplicate registration | Bot detects existing record; skips to booking | ☐ Pass / ☐ Fail |
| TC-22 | Session resume after 12 hours | Bot offers to continue from last step | ☐ Pass / ☐ Fail |
| TC-23 | Session expired after 25 hours | Bot starts fresh from step 1 | ☐ Pass / ☐ Fail |
| TC-24 | Concurrent booking race condition | First user succeeds; second gets slot taken error | ☐ Pass / ☐ Fail |
| TC-25 | API unauthorized access | `401 UNAUTHORIZED` response | ☐ Pass / ☐ Fail |
| TC-26 | Dashboard RBAC — secretary MRD edit | Access denied (`403`) | ☐ Pass / ☐ Fail |
| TC-27 | Load test — 50 concurrent sessions | All respond < 3s; no data cross-contamination | ☐ Pass / ☐ Fail |
| TC-28 | Search patient by mobile | Correct patient profile returned | ☐ Pass / ☐ Fail |
| TC-29 | Any Available Doctor selection | System finds earliest slot across all doctor types | ☐ Pass / ☐ Fail |
| TC-30 | Audit log entry on booking | `APPOINTMENT_BOOKED` entry created in `audit_logs` | ☐ Pass / ☐ Fail |

### 11.3 Go-Live Criteria

The system shall not be deployed to production until:
- All 30 UAT test cases have a **PASS** status
- Performance test confirms P95 response time < 3 seconds at 500 concurrent sessions
- Security test shows zero critical or high vulnerabilities
- All WATI message templates have been approved by Meta
- Secretary and admin users have completed their training session
- A rollback plan has been documented and tested

---

## 12. Deployment & Infrastructure

### 12.1 Infrastructure Overview

```
                    ┌──────────────────┐
                    │   Cloudflare CDN │
                    │  (DDoS + WAF)    │
                    └────────┬─────────┘
                             │ HTTPS
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
  ┌────────────────┐  ┌──────────────┐  ┌──────────────┐
  │React Dashboard │  │ n8n Instance │  │ REST API     │
  │(Vercel/Netlify)│  │(VPS/Docker)  │  │(VPS/Docker)  │
  └────────────────┘  └──────┬───────┘  └──────┬───────┘
                             └──────────────────┘
                                      │
                            ┌─────────▼──────────┐
                            │    MySQL Database   │
                            │  (Primary + Replica)│
                            │  (AWS RDS / VPS)    │
                            └────────────────────┘
```

### 12.2 Server Specifications

| Component | Minimum | Recommended |
|---|---|---|
| REST API Server | 2 vCPU, 4GB RAM, 50GB SSD | 4 vCPU, 8GB RAM |
| n8n Server | 2 vCPU, 4GB RAM | 4 vCPU, 8GB RAM |
| Database Primary | 4 vCPU, 8GB RAM, 100GB SSD | 8 vCPU, 16GB RAM |
| Database Replica | Same as primary | Same as primary |
| Dashboard Hosting | Vercel / Netlify free tier | Vercel Pro |

### 12.3 Environment Strategy

| Environment | Purpose | Data |
|---|---|---|
| Development | Developer testing, feature work | Synthetic/mock data only |
| Staging | Full integration testing, UAT | Anonymized copy of production data |
| Production | Live clinic use | Real patient data — access restricted |

### 12.4 CI/CD Pipeline

1. Developer pushes code to feature branch
2. Automated unit tests run on pull request
3. Code review and merge to `main`
4. CI pipeline: run full test suite → build Docker image → push to container registry
5. CD pipeline: auto-deploy to Staging → run integration tests → **manual approval gate**
6. Manual approval → deploy to Production with zero-downtime rolling update

### 12.5 Monitoring & Alerting

| Metric | Tool | Alert Threshold |
|---|---|---|
| API response time (P95) | Datadog / New Relic | > 2s → Warning; > 5s → Critical |
| API error rate | Datadog / New Relic | > 1% → Warning; > 5% → Critical |
| Database connection pool | Same | > 80% used → Warning |
| Disk usage | Same | > 80% → Warning; > 90% → Critical |
| Uptime | UptimeRobot / Pingdom | Any downtime → Immediate alert |
| n8n workflow failures | n8n built-in alerting | Any workflow error → Email to admin |

### 12.6 Backup Strategy

| Backup Type | Schedule | Retention |
|---|---|---|
| Full database backup | Daily at 2:00 AM IST | 30 days |
| Transaction log backup | Every 6 hours | 7 days |
| Application config backup | On every change | 10 versions |

---

## 13. Future Scope & Roadmap

### Phase 2 — Retention & Reminders *(Target: Q2 2026)*

| Feature | Description | Priority | Effort |
|---|---|:---:|:---:|
| Appointment reminders | Automated WhatsApp reminders at 24h and 2h before appointment | 🔴 High | Medium |
| Vaccination tracker | Track scheduled vaccinations; proactive reminders when due | 🔴 High | High |
| Cancellation confirmation | Two-way confirmation when secretary cancels | 🔴 High | Low |
| No-show tracking | Mark NO_SHOW; track repeat no-show patients | 🟡 Medium | Low |
| Patient feedback collection | Post-visit WhatsApp survey (3 questions) | 🟡 Medium | Medium |

### Phase 3 — Experience Enhancement *(Target: Q3 2026)*

| Feature | Description | Priority | Effort |
|---|---|:---:|:---:|
| Online consultation links | Auto-generate Google Meet / Zoom link on Online booking confirmation | 🟡 Medium | High |
| Patient-initiated MRD summary | Patient sends `MY RECORDS` to get last 3 visit summary on WhatsApp | 🟡 Medium | Medium |
| Multi-language support | Hindi and Marathi bot language options | 🟡 Medium | High |
| Preferred doctor memory | Remember patient's last chosen doctor as default | 🟢 Low | Low |
| Sibling management | One parent registers multiple children under one WhatsApp number | 🔴 High | High |

### Phase 4 — Business Intelligence *(Target: Q4 2026)*

| Feature | Description | Priority | Effort |
|---|---|:---:|:---:|
| Analytics dashboard | Charts: daily bookings, doctor utilization, peak hours, no-show rates | 🟢 Low | High |
| Monthly report generation | Auto-generated PDF report emailed to admin at end of each month | 🟢 Low | Medium |
| Payment integration | Online fee collection for Online consultations via Razorpay | 🟢 Low | High |
| Doctor mobile app | Native iOS/Android app for doctors to view schedule and add MRD notes | 🟢 Low | Very High |
| EHR integration | Optional export of MRD data in HL7/FHIR format | 🟢 Low | Very High |

---

## 14. Document Revision History

| Version | Date | Author | Summary of Changes |
|---|---|---|---|
| 1.0 | February 2026 | Project Team | Initial SRS — base registration, appointment, DB schema, integrations |
| 2.0 | February 2026 | Project Team | Deep edition — added business context, personas, conversation scripts, full API spec, security model, testing strategy, infrastructure, audit logs, RBAC, config table, race condition handling, compliance details |
| **2.1** | **February 2026** | **Project Team** | **API Updated — Production base URL updated to `api-dr-indu-child-care.brahmaastra.ai`; 40+ endpoints documented; WhatsApp Bot Integration group expanded with 12 dedicated endpoints; Doctors, Slots, and System groups added; OAS 3.0 compliance noted** |

---

## Appendix A — Required WhatsApp Message Templates

| Template Name | Category | When Used |
|---|---|---|
| `dicc_welcome` | UTILITY | First user contact |
| `dicc_registration_confirm` | UTILITY | Registration summary message |
| `dicc_appointment_confirmed` | UTILITY | Booking confirmation |
| `dicc_appointment_cancelled` | UTILITY | Cancellation confirmation |
| `dicc_appointment_reminder_24h` | UTILITY | 24-hour reminder (Phase 2) |
| `dicc_appointment_reminder_2h` | UTILITY | 2-hour reminder (Phase 2) |
| `dicc_no_slots_available` | UTILITY | When all slots are full |
| `dicc_escalation_notice` | UTILITY | When bot hands off to human |

---

## Appendix B — Go-Live Clinic Configuration Checklist

All items below must be configured in the `clinic_config` table before production deployment:

| Done | Config Key | Default | Description |
|:---:|---|:---:|---|
| ☐ | `clinic_name` | — | Official clinic name for bot messages |
| ☐ | `clinic_address` | — | Full address shown in booking confirmations |
| ☐ | `clinic_phone` | — | Contact number shown in confirmations |
| ☐ | `booking_window_days` | `30` | Maximum days ahead a booking is accepted |
| ☐ | `cancel_cutoff_hrs` | `2` | Hours before appointment when bot self-cancel is locked |
| ☐ | `max_retries` | `3` | Invalid inputs before escalation to secretary |
| ☐ | `session_expiry_hrs` | `24` | Hours before incomplete registration session expires |
| ☐ | `clinic_closed_days` | `Sunday` | Comma-separated days clinic is closed |
| ☐ | `clinic_holiday_dates` | — | Specific holiday dates (YYYY-MM-DD, comma-separated) |
| ☐ | `timezone` | `Asia/Kolkata` | Clinic timezone for date display (IST = UTC+5:30) |

---

*Dr. Indu Child Care — Confidential — Internal Use Only*

*Document ID: DICC-SRS-2026-001 | Version 2.1 | February 2026 | API Base URL: `api-dr-indu-child-care.brahmaastra.ai`*