# Dr. Indu Child Care
# Software Requirements Specification (SRS)
## WhatsApp Bot & Appointment Booking System

---

| Field | Details |
|---|---|
| **Document ID** | DICC-SRS-2026-001 |
| **Version** | 2.0 (Deep Edition) |
| **Date** | February 2026 |
| **Prepared For** | Dr. Indu Child Care Clinic |
| **Classification** | Confidential – Internal Use Only |
| **Status** | Draft for Review |
| **Total Sections** | 16 |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Business Context & Problem Statement](#2-business-context--problem-statement)
3. [System Overview & Architecture](#3-system-overview--architecture)
4. [Stakeholders & User Personas](#4-stakeholders--user-personas)
5. [Functional Requirements](#5-functional-requirements)
6. [Detailed Bot Conversation Scripts](#6-detailed-bot-conversation-scripts)
7. [Database Design & Data Storage](#7-database-design--data-storage)
8. [API Specification](#8-api-specification)
9. [Bot State Machine](#9-bot-state-machine)
10. [Non-Functional Requirements](#10-non-functional-requirements)
11. [Security & Privacy Model](#11-security--privacy-model)
12. [Integration Specifications](#12-integration-specifications)
13. [Error Handling & Edge Cases](#13-error-handling--edge-cases)
14. [Testing Strategy & Acceptance Criteria](#14-testing-strategy--acceptance-criteria)
15. [Deployment & Infrastructure](#15-deployment--infrastructure)
16. [Future Scope & Roadmap](#16-future-scope--roadmap)
17. [Document Revision History](#17-document-revision-history)

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) document defines the complete functional, non-functional, technical, and operational requirements for the **Dr. Indu Child Care WhatsApp Bot and Appointment Booking System**. It is the single authoritative reference document for all parties involved in the design, development, testing, deployment, and maintenance of the system.

This document is intended to be read by:
- Software developers and architects building the system
- QA engineers writing and executing test cases
- DevOps engineers responsible for deployment and infrastructure
- Clinic administrators and secretaries who will operate the system
- Business stakeholders approving requirements and scope

### 1.2 Scope

The system is a full-stack healthcare communication and scheduling platform delivered via the WhatsApp Business API. It eliminates the need for phone-based appointment booking, removes dependency on human receptionists for routine scheduling tasks, and creates a permanent digital medical record for every registered patient.

The scope of this document includes:

- End-to-end WhatsApp bot conversation design and implementation
- Patient registration data capture and validation
- Multi-doctor appointment booking for Online and Offline visits
- Real-time slot availability management
- Secretary and admin web dashboard
- Patient Medical Record Document (MRD) system
- REST API specification for all backend services
- Database schema design with SQL DDL
- Security, privacy, and compliance requirements
- Testing strategy and UAT acceptance criteria
- Deployment architecture and infrastructure specification
- Future roadmap for Phases 2–4

The following are explicitly **out of scope** for Version 1.0:
- Payment processing or billing integration
- Electronic Health Record (EHR) system integration with third-party platforms
- Insurance claim processing
- Doctor-side mobile application
- Video consultation link generation

### 1.3 Definitions & Abbreviations

| Term / Abbreviation | Full Form / Definition |
|---|---|
| SRS | Software Requirements Specification |
| MRD | Medical Record Document — the patient's longitudinal health file |
| Bot | The automated WhatsApp conversational agent |
| WATI | WhatsApp Team Inbox — third-party WhatsApp Business API SaaS platform |
| n8n | Node-based workflow automation engine used for backend orchestration |
| WBA API | WhatsApp Business API — Meta's official API for business messaging |
| OTP | One-Time Password — used for identity verification |
| Online Consultation | Video or audio telemedicine session |
| Offline / Clinic Visit | In-person appointment at the physical clinic |
| Slot | A specific, pre-defined appointment time window (e.g., 10:00–10:30 AM) |
| Secretary Handoff | The event when the bot transfers control to a human staff member |
| Registration | The mandatory one-time patient data collection process |
| FR | Functional Requirement |
| NFR | Non-Functional Requirement |
| UC | Use Case |
| UAT | User Acceptance Testing |
| DDL | Data Definition Language — SQL commands for creating database structures |
| ER | Entity Relationship — diagram showing how database tables relate |
| JWT | JSON Web Token — used for API authentication |
| TLS | Transport Layer Security — encryption protocol for data in transit |
| AES | Advanced Encryption Standard — algorithm for data at rest encryption |
| DPDP | Digital Personal Data Protection Act, 2023 (India) |
| IT Act | Information Technology Act, 2000 (India) |
| CRON | Time-based job scheduler for automated tasks |

### 1.4 Document Conventions

- **Functional Requirements** are tagged **FR-XX** (e.g., FR-01, FR-02)
- **Non-Functional Requirements** are tagged **NFR-XX**
- **Use Cases** are tagged **UC-XX**
- **Test Cases** are tagged **TC-XX**
- All database column names are written in `snake_case`
- All API endpoints follow REST conventions: `/api/resource/:param`
- All timestamps are stored and transmitted in **UTC**; display conversion to IST (UTC+5:30) happens at the UI layer
- Boolean fields use `TRUE` / `FALSE` values
- ENUM values are written in `UPPER_SNAKE_CASE`

---

## 2. Business Context & Problem Statement

### 2.1 Current State — The Problem

Dr. Indu Child Care clinic currently manages all patient registrations and appointment bookings through:

1. **Phone calls** — The secretary manually answers calls, records patient details on paper or in a spreadsheet, and books slots verbally. This process is error-prone, time-consuming, and unavailable outside clinic hours.
2. **Walk-in registration** — Patients arrive without prior information, leading to long wait times and poor resource allocation.
3. **Paper-based MRD** — Patient medical records are maintained in physical files, creating risks of data loss, poor searchability, and inability to access records remotely.
4. **No automated reminders** — Patients frequently forget appointments, resulting in no-shows that waste doctor time and clinic resources.

**Key Pain Points:**

| Pain Point | Impact |
|---|---|
| Phone booking unavailable at night or on holidays | Lost appointment opportunities, patient frustration |
| Manual data entry errors | Wrong contact numbers, wrong dates, duplicate records |
| No centralized digital patient database | Cannot retrieve history, cannot track vaccination schedules |
| No automated slot management | Double bookings, overbooking, confusion |
| Secretary spends 40–60% of time on routine scheduling | High operational cost for low-value tasks |
| No mechanism to handle Online consultations | Patients must physically come for minor queries |

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
| Reduce secretary workload for routine bookings | % of bookings handled by bot without human intervention | ≥ 80% |
| Improve patient experience | Time from first WhatsApp message to confirmed appointment | ≤ 5 minutes |
| Eliminate no-shows | No-show rate after reminders implemented (Phase 2) | ≤ 10% |
| Build digital patient database | % of active patients with complete digital MRD | 100% |
| Ensure system availability | System uptime | ≥ 99.5% |
| Reduce booking errors | Appointment data entry error rate | ≤ 1% |

---

## 3. System Overview & Architecture

### 3.1 High-Level System Description

The system is a three-tier platform:

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
│  Handles: Business logic, DB operations, auth                │
└────────────────────────┬─────────────────────────────────────┘
                         │ SQL Queries / ORM
┌────────────────────────▼─────────────────────────────────────┐
│                      DATA LAYER                              │
│  MySQL / PostgreSQL Relational Database                      │
│  Tables: patients, appointments, time_slots,                 │
│          slot_availability, mrd_entries, bot_sessions,       │
│          audit_logs, admin_users                             │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Component Descriptions

#### 3.2.1 WhatsApp Business API (Meta)

The official API from Meta that allows businesses to send and receive messages programmatically. All user-facing messages, buttons, and list menus are delivered through this API. The clinic must have an approved WhatsApp Business account and verified phone number.

#### 3.2.2 WATI Platform

WATI (WhatsApp Team Inbox) is the SaaS layer sitting between the clinic and Meta's API. It provides:
- A no-code/low-code interface for creating message templates
- Webhook configuration to forward incoming messages to n8n
- A human agent inbox for secretary takeover
- Broadcast messaging for reminders (Phase 2)
- A contact management dashboard

#### 3.2.3 n8n Workflow Engine

n8n is the brain of the bot's conversational logic. Each bot conversation state is represented as an n8n workflow. n8n:
- Receives webhook payloads from WATI on every incoming user message
- Reads the current bot session state from the database
- Validates user input against defined rules
- Makes HTTP requests to the REST API middleware to read/write data
- Sends reply messages back to the user via WATI's outbound API
- Handles retries, timeouts, and error routing

#### 3.2.4 REST API Middleware

A Node.js/Express application that exposes a secure REST API consumed by n8n. It:
- Implements all business logic (e.g., slot availability checks, MRD creation)
- Interfaces with the relational database via an ORM (Sequelize or Prisma)
- Enforces authentication using JWT tokens
- Returns structured JSON responses

#### 3.2.5 Relational Database

A MySQL or PostgreSQL database storing all persistent data. See Section 7 for the full schema.

#### 3.2.6 Admin / Secretary Dashboard

A web application (React.js frontend + Node.js backend) that provides clinic staff with:
- Full appointment calendar and list view
- Slot blocking and management
- Patient MRD access and note-taking
- Manual appointment management (create, confirm, reschedule, cancel)
- Notification inbox for new bookings

### 3.3 Data Flow Diagrams

#### 3.3.1 Registration Flow — Data Movement

```
Parent WhatsApp Message
        ↓
WATI receives message → fires webhook to n8n
        ↓
n8n reads bot_sessions table → determines current state (e.g., S03_COLLECT_MOBILE)
        ↓
n8n validates input (regex / format check)
        ↓
  [Valid] → n8n updates bot_sessions → sends next question via WATI
  [Invalid] → n8n sends error message → re-prompts same state
        ↓
On S09_REGISTRATION_COMPLETE:
  n8n calls POST /api/patients/register
        ↓
REST API creates patients record → generates patient_id (DICC-2026-XXXX)
REST API creates empty mrd_entries placeholder
        ↓
n8n sends confirmation message to parent
n8n advances session to S10_ASK_BOOK_APPOINTMENT
```

#### 3.3.2 Appointment Booking — Data Movement

```
Parent selects "Yes" to book appointment
        ↓
n8n (S11) sends Mode Selection buttons
Parent selects ONLINE / OFFLINE
        ↓
n8n (S12) sends Doctor Selection list
Parent selects doctor type
        ↓
n8n (S13) sends Visit Type list
Parent selects visit type
        ↓
n8n (S14) prompts for date
Parent enters DD/MM/YYYY
        ↓
n8n calls GET /api/slots/available?doctor_type=X&date=Y
REST API queries slot_availability table
Returns available slot list
        ↓
n8n (S15) sends available slots as buttons
Parent selects time slot
        ↓
n8n (S16) constructs and sends appointment summary
        ↓
Parent replies CONFIRM
        ↓
n8n calls POST /api/appointments/book
REST API:
  - Creates appointments record
  - Updates slot_availability (is_booked = TRUE)
  - Sets confirmation_sent = FALSE
        ↓
REST API responds with appointment_id
n8n sends confirmation WhatsApp message with clinic details
REST API updates confirmation_sent = TRUE
Dashboard notification triggered
Session advances to S20_SESSION_END
```

---

## 4. Stakeholders & User Personas

### 4.1 Stakeholder Registry

| ID | Stakeholder | Type | Primary Concern |
|---|---|---|---|
| SH-01 | Patient's Parent / Guardian | External End User | Easy, fast appointment booking; clear confirmation |
| SH-02 | Clinic Secretary | Internal Operator | Simple dashboard; ability to override bot decisions |
| SH-03 | Dr. Indu (Clinic Owner / Doctor) | Internal Owner | Accurate patient records; optimized schedule |
| SH-04 | Specialist Doctors | Internal Service Provider | Timely notification of appointments; patient context |
| SH-05 | Clinic Administrator | Internal Manager | Reports, analytics, system health |
| SH-06 | Developer / IT Team | Technical | Clear requirements, maintainable architecture |

### 4.2 User Personas

#### Persona 1: Priya — The Parent (Primary Bot User)

> **Age:** 32 | **Location:** Suburban Mumbai | **Tech Savvy:** Medium | **WhatsApp Usage:** Daily

Priya has a 2-year-old son with recurring cough episodes. She works full-time and cannot make calls during office hours. She discovered the clinic on Google and messaged the clinic WhatsApp number at 10 PM. She expects the bot to be simple, fast, and require minimal typing. She gets frustrated by long menus or confusing prompts. She needs confirmation in writing that she can screenshot.

**Goals:** Register quickly, book the right doctor, get a confirmation she can show at the reception.

**Pain Points:** Unclear options, having to retype details she already provided, not knowing if her booking went through.

---

#### Persona 2: Sunita — The Secretary (Dashboard User)

> **Age:** 38 | **Role:** Clinic Receptionist | **Tech Savvy:** Low-Medium | **Works:** 9 AM – 8 PM

Sunita handles walk-in patients, phone calls, and now the digital dashboard. She needs to see at a glance who is coming in today, whether slots are full, and be able to block slots when a doctor is unavailable. She does not want a complex system — she needs a clean calendar view and a one-click block/unblock for slots.

**Goals:** Know the day's schedule at a glance, manage slots without calling IT, handle emergency walk-in additions.

**Pain Points:** Tech systems that require training, systems that don't sync in real-time, no way to add emergency patients.

---

#### Persona 3: Dr. Indu — The Clinic Owner (Admin User)

> **Age:** 45 | **Role:** Owner + Chief Pediatrician | **Tech Savvy:** Medium | **Focus:** Patient care quality

Dr. Indu wants the system to work without constant oversight. She needs to trust that appointments are accurate, that MRDs are being built correctly, and that she can pull up a patient's full history in seconds before a consultation. She also wants to see monthly appointment volume and peak times.

**Goals:** Reliable system that needs zero manual intervention 95% of the time. Clean patient records. Reports on clinic performance.

**Pain Points:** Data inaccuracies, systems that require her to micromanage, no visibility into operational metrics.

---

## 5. Functional Requirements

### 5.1 Registration Module

5.1.1 Registration Flow — Updated Field Specifications

Now total fields = 10

The bot must collect in strict sequence.

📋 Updated Registration Table
Step	Field Name	Input Type	Validation Rules	Error Message	Required	System Notes
1	Child's Full Name	Free text	2–100 chars, letters & spaces only	"Please enter a valid name with letters only (e.g., Arjun Kumar)"	Yes	Auto capitalize
2	Gender	Button selection	Male / Female / Other	"Please select a valid gender option"	Yes	No free text
3	Parent's Full Name	Free text	2–100 chars, letters & spaces only	"Please enter the parent or guardian's full name"	Yes	Auto capitalize
4	Parent's Mobile Number	Numeric text	Exactly 10 digits, starts with 6/7/8/9	"Please enter a valid 10-digit Indian mobile number (e.g., 9876543210)"	Yes	Duplicate check required
5	Alternate Mobile Number	Numeric or SKIP	Same rules, must differ	"Enter a different 10-digit number, or type SKIP to continue"	No	Store NULL if skipped
6	Child's Date of Birth	Date text	DD/MM/YYYY, past date, age < 18	"Please enter a valid date in DD/MM/YYYY format. The date cannot be in the future."	Yes	Auto-calc age
7	Email ID	Email text	Valid email format, max 150 chars	"Please enter a valid email address (e.g., name@example.com
)"	Yes	Lowercase before save
8	Residential Address	Free text	10–500 chars	"Please provide your full address including House No, Area, City, and Pincode"	Yes	Trim whitespace
9	Symptoms / Reason for Visit	Free text	3–1000 chars OR VACCINATION	"Please describe your child's symptoms or type VACCINATION"	Yes	Normalize keyword
10	Registration Source	System assigned	whatsapp / dashboard / form / api	N/A	Yes	Auto assigned by backend

#### 5.1.2 Registration Functional Requirements

- **FR-01:** The system shall present exactly one registration field per message, waiting for a valid response before displaying the next field.
- **FR-02:** The system shall validate each response immediately upon receipt. No field shall be skipped due to invalid input.
- **FR-03:** On receiving an invalid response, the system shall display a specific, descriptive error message that includes an example of the expected format, and re-prompt the identical field.
- **FR-04:** The system shall allow a maximum of **3 consecutive invalid attempts** per field. On the 4th failure, the system shall send a human escalation message: *"We are having trouble processing your input. Our team will reach out to assist you shortly."* and flag the session for secretary review.
- **FR-05:** On successful collection of all 8 fields, the system shall display a complete registration summary for the parent to review before saving.
- **FR-06:** The registration summary shall include all collected fields labeled clearly, with a confirmation button and an option to restart.
- **FR-07:** On confirmation, the system shall write the patient record to the `patients` table and generate a unique Patient ID in the format `DICC-YYYY-NNNN` (e.g., DICC-2026-0001), where YYYY is the current year and NNNN is a zero-padded sequential number.
- **FR-08:** The system shall create an empty MRD shell in the `mrd_entries` table linked to the new patient_id at the moment of registration.
- **FR-09:** If a user initiates a new conversation and their WhatsApp number already exists in the `patients` table with `registration_status = 'COMPLETE'`, the system shall skip the entire registration module and display: *"Welcome back! We found your existing registration. Would you like to book an appointment?"*
- **FR-10:** The bot session state shall be persisted in the `bot_sessions` table after every step so that conversations can be resumed if the user disconnects.
- **FR-11:** If a user abandons a registration mid-flow and returns within 24 hours, the system shall offer to continue from the last completed step. After 24 hours, the system shall restart registration from Step 1 and discard the incomplete session.

---

### 5.2 Appointment Booking Module

#### 5.2.1 Booking Trigger Requirements

- **FR-12:** Immediately upon registration completion, the system shall display: *"✅ Registration complete! Would you like to book an appointment now?"* with two quick-reply buttons: **Yes** and **No**.
- **FR-13:** If the user selects **No**, the system shall respond: *"Thank you for registering with Dr. Indu Child Care. You can book an appointment anytime by messaging us again 😊"* and terminate the session. The patient record shall be fully preserved.
- **FR-14:** If the user selects **Yes**, the system shall immediately begin the appointment booking sub-flow starting with Mode Selection.

#### 5.2.2 Appointment Mode Selection

- **FR-15:** The system shall display an appointment mode selection message with two interactive buttons:
  - 🖥️ **Online Consultation** — description: "Video/audio consultation from home"
  - 🏥 **Clinic Visit (Offline)** — description: "In-person visit at the clinic"
- **FR-16:** The selected mode shall be stored in the active `bot_sessions` record and used throughout the booking sub-flow.
- **FR-17:** Both Online and Offline appointments shall follow the identical booking flow. Backend systems may handle them differently (e.g., generating a video link for Online), but the bot conversation structure is the same.

#### 5.2.3 Doctor Selection

- **FR-18:** The system shall display a list menu (WhatsApp List Message format) titled *"Select a Doctor"* with the following options:

| List Item | Label | Sub-text |
|---|---|---|
| 1 | Pulmonary Specialist | For breathing, asthma, lung issues |
| 2 | Non-Pulmonary Pediatrician | General child health, fever, infections |
| 3 | Vaccination Doctor | All routine and catch-up vaccinations |
| 4 | Any Available Doctor | First available slot across all doctors |

- **FR-19:** If "Any Available Doctor" is selected, the system shall query all doctor types and find the earliest available slot across all of them.
- **FR-20:** The selected doctor type shall be stored in the active `bot_sessions` record.

#### 5.2.4 Visit Type Selection

- **FR-21:** The system shall present a visit type list menu with four options:

| Icon | Visit Type | Use Case |
|---|---|---|
| 💉 | Vaccination | Child requires scheduled or catch-up vaccine |
| 🩺 | Routine Consultation | General health check or non-urgent issue |
| 🫁 | Pulmonary / Lung Problem | Breathing difficulties, chronic cough, asthma |
| 🔁 | Follow-up Visit | Return visit after a previous consultation |

- **FR-22:** The visit type shall influence which doctor types are highlighted (e.g., selecting Pulmonary shall pre-recommend Pulmonary Specialist on the doctor selection screen if not already chosen).

#### 5.2.5 Date Selection

- **FR-23:** The system shall prompt the user: *"Please enter your preferred appointment date (DD/MM/YYYY):"*
- **FR-24:** The system shall validate that:
  - The date is in DD/MM/YYYY format
  - The date is not in the past (must be today or future)
  - The date is within a **30-day booking window** from today
  - The date is not a Sunday (clinic closed on Sundays; configurable)
- **FR-25:** If the entered date fails validation, the system shall display a specific error explaining the violation (e.g., *"That date is in the past. Please enter a date from today onwards."* or *"We are unable to book more than 30 days in advance. Please select a date within the next 30 days."*)
- **FR-26:** After date validation passes, the system shall query the `slot_availability` table to check which slots are available for the selected doctor type on the selected date.
- **FR-27:** If the selected date is a holiday (configurable in the system), the system shall inform the user and prompt them to select a different date.

#### 5.2.6 Time Slot Selection

- **FR-28:** The system shall display only **available** time slots for the selected date and doctor. Booked or admin-blocked slots shall not appear.
- **FR-29:** If 1–5 slots are available, the system shall display them as quick-reply buttons. If more than 5 slots are available, the system shall use a WhatsApp List Message.
- **FR-30:** If **zero slots** are available on the requested date, the system shall:
  1. Inform the user: *"No slots are available on [date] for [doctor type]."*
  2. Automatically query the next 7 days and present the **next 3 available dates** with at least one open slot each.
  3. Ask the user to select a different date from the options provided.
- **FR-31:** The default available time slots (managed in the `time_slots` table) are:

| Slot ID | Display Label | Start | End | Session |
|---|---|---|---|---|
| S1 | 10:00 – 10:30 AM | 10:00 | 10:30 | Morning |
| S2 | 11:00 – 11:30 AM | 11:00 | 11:30 | Morning |
| S3 | 11:30 AM – 12:00 PM | 11:30 | 12:00 | Morning |
| S4 | 05:00 – 05:30 PM | 17:00 | 17:30 | Evening |
| S5 | 06:00 – 06:30 PM | 18:00 | 18:30 | Evening |
| S6 | 06:30 – 07:00 PM | 18:30 | 19:00 | Evening |

- **FR-32:** Slot timings shall be configurable by clinic admin from the dashboard without requiring a code change.

#### 5.2.7 Appointment Summary & Confirmation

- **FR-33:** Before creating the appointment record, the system shall display a structured summary:

```
📋 Please confirm your appointment:

👶 Child Name:   [Child's Full Name]
🩺 Visit Type:   [Vaccination / Consultation / Pulmonary / Follow-up]
🖥️ Mode:         [Online / Clinic Visit]
👨‍⚕️ Doctor:      [Pulmonary Specialist / etc.]
📅 Date:         [DD/MM/YYYY]
⏰ Time:         [Slot Label]

Reply CONFIRM to book or EDIT to make changes.
```

- **FR-34:** The system shall present **CONFIRM** and **EDIT** as quick-reply buttons.
- **FR-35:** On receiving **CONFIRM**, the system shall:
  1. Make a `POST /api/appointments/book` call
  2. Receive the generated `appointment_id` in the response
  3. Mark the slot as booked in `slot_availability`
  4. Send a final confirmation message containing the appointment_id, clinic address, clinic contact number, and a reminder about what to bring
  5. Trigger a dashboard notification for the secretary
- **FR-36:** On receiving **EDIT**, the system shall restart from Mode Selection (S11) while retaining all registration data. All previous appointment sub-flow data shall be cleared and the user shall re-enter doctor, date, and time selections.
- **FR-37:** The appointment_id shall be included in the confirmation message so the user can reference it for cancellations or rescheduling.

---

### 5.3 Cancellation & Rescheduling Module

- **FR-38:** At any time after booking, the user shall be able to send the keyword `CANCEL [appointment_id]` (e.g., `CANCEL APT-2026-00145`) to cancel an appointment.
- **FR-39:** On receiving a valid cancellation request, the system shall:
  1. Verify the appointment belongs to the requesting WhatsApp number
  2. Check that the appointment is not already `CANCELLED` or `COMPLETED`
  3. Check that the appointment is at least **2 hours in the future** (no last-minute cancellations via bot)
  4. Update `appointments.status` to `CANCELLED`
  5. Update `slot_availability.is_booked` to `FALSE` and clear `appointment_id`
  6. Send a cancellation confirmation message
- **FR-40:** If the appointment is within 2 hours, the system shall instruct the user to contact the clinic directly for same-day cancellations.
- **FR-41:** Users shall be able to reschedule by sending `RESCHEDULE [appointment_id]`. The system shall verify ownership, then restart the date and time slot sub-flow (S14 onward) while retaining mode, doctor type, and visit type.
- **FR-42:** On successful reschedule, the old slot shall be freed and the new slot shall be booked atomically (in a single transaction) to prevent double-booking.

---

### 5.4 Secretary / Admin Dashboard

- **FR-43:** The dashboard shall be a web application accessible via a standard browser (Chrome, Firefox, Edge) requiring username/password login.
- **FR-44:** The dashboard homepage shall display today's appointment schedule as a **timeline view** showing time slots, patient names, doctor assignment, and appointment mode (Online/Offline).
- **FR-45:** The dashboard shall include a **calendar view** where each day shows a count of confirmed appointments. Clicking a day opens the detailed appointment list for that day.
- **FR-46:** Each appointment entry in the dashboard shall show:
  - Patient name and age
  - Parent contact number (click-to-call)
  - Visit type and doctor
  - Mode (Online / Offline badge)
  - Status badge (Confirmed / Cancelled / Completed / Rescheduled)
  - Appointment ID
- **FR-47:** Secretary shall be able to **block time slots** by selecting a date, doctor type, and one or more slots and clicking "Block." Blocked slots shall immediately disappear from the bot's available options.
- **FR-48:** Secretary shall be able to **unblock** previously blocked slots.
- **FR-49:** Secretary shall be able to **manually add appointments** from the dashboard (for walk-in patients or phone bookings), with the system enforcing the same slot availability rules.
- **FR-50:** Secretary shall be able to change the status of any appointment to `CONFIRMED`, `CANCELLED`, `COMPLETED`, or `RESCHEDULED` from the dashboard.
- **FR-51:** When an appointment is marked `COMPLETED`, the system shall prompt the secretary to add initial clinical notes (which pre-populate an `mrd_entries` record for the doctor to complete).
- **FR-52:** The dashboard shall display a **notification badge** for all new appointments booked through the bot in the last 30 minutes.
- **FR-53:** Dashboard shall have a **patient search** function allowing search by: patient_id, child name, parent name, or parent mobile number.
- **FR-54:** Dashboard shall include a **slot configuration panel** where admin can add, remove, or modify time slots, set clinic working days, and define clinic holidays.

---

### 5.5 MRD (Medical Record Document) System

- **FR-55:** Every patient registration shall auto-create a corresponding MRD record identified by the same `patient_id`.
- **FR-56:** The MRD record shall maintain a chronological list of all appointments, each containing: date, doctor, visit type, symptoms, clinical notes, diagnosis, prescription, and next visit recommendation.
- **FR-57:** Authorized clinic staff (doctors and admin only, not secretary) shall be able to **add or edit clinical notes** for any completed appointment via the dashboard.
- **FR-58:** The MRD shall be viewable from the patient's profile page on the dashboard, displaying all entries in reverse chronological order (newest first).
- **FR-59:** The full MRD shall be **exportable as a PDF** with the clinic's letterhead, patient details on the cover, and all visit entries formatted professionally.
- **FR-60:** The MRD shall track the patient's **vaccination history** separately — all appointments with `visit_type = 'VACCINATION'` shall automatically populate a vaccination ledger within the MRD.
- **FR-61:** The system shall **never delete MRD records**. Cancellation of an appointment shall not remove the appointment from the MRD. It shall be marked `CANCELLED` with the timestamp.

---

## 6. Detailed Bot Conversation Scripts

This section defines the exact messages the bot sends at each state. These scripts are the final production-ready text for WATI template configuration.

### 6.1 Welcome Message (S00)

```
Hello 👋 Welcome to *Dr. Indu Child Care* 🩺

I'm here to help you:
✅ Register your child
📅 Book an appointment
🔁 Reschedule or cancel

To get started, I'll need a few details. This will only take 2–3 minutes.

Let's begin! 👇
```

### 6.2 Registration Fields (S01–S08)

**S01 — Child's Name:**
```
1️⃣ *Child's Full Name*

Please type your child's full name:
(Example: Arjun Sharma)
```

**S02 — Parent's Name:**
```
2️⃣ *Parent / Guardian's Full Name*

Please type your name:
(Example: Rohit Sharma)
```

**S03 — Primary Mobile:**
```
3️⃣ *Your Mobile Number*

Please enter your 10-digit WhatsApp number:
(Example: 9876543210)
```

**S04 — Alternate Mobile:**
```
4️⃣ *Alternate Contact Number* (Optional)

Please enter an alternate mobile number, or type *SKIP* to continue:
```

**S05 — Date of Birth:**
```
5️⃣ *Child's Date of Birth*

Please enter in DD/MM/YYYY format:
(Example: 15/04/2022)
```

**S06 — Email:**
```
6️⃣ *Email Address*

Please enter your email ID:
(Example: name@gmail.com)
```

**S07 — Address:**
```
7️⃣ *Residential Address*

Please enter your full address including House No, Area, City and Pincode:
(Example: 42, Lakeview Society, Andheri West, Mumbai - 400053)
```

**S08 — Symptoms:**
```
8️⃣ *Symptoms / Reason for Visit*

Please describe your child's symptoms or type *VACCINATION* if you are visiting for a vaccine:
```

### 6.3 Registration Summary (Pre-S09)

```
📋 *Please review your details:*

👶 Child's Name:    [child_full_name]
👤 Parent's Name:   [parent_full_name]
📞 Mobile:          [parent_mobile]
📱 Alt Mobile:      [alt_mobile or "Not provided"]
🎂 Date of Birth:   [date_of_birth]
📧 Email:           [email]
🏠 Address:         [address]
🩺 Symptoms:        [symptoms_notes]

Is everything correct?
```
*Buttons: ✅ Confirm Details | 🔄 Start Over*

### 6.4 Registration Complete (S09)

```
✅ *Registration Successful!*

Your child has been registered with *Dr. Indu Child Care*.

🆔 Patient ID: *[patient_id]*

Please save this ID for future reference.
```

### 6.5 Book Appointment Prompt (S10)

```
Would you like to book an appointment now?
```
*Buttons: 📅 Yes, Book Now | ⏸️ No, Later*

### 6.6 If No — Session End

```
Thank you for registering with *Dr. Indu Child Care* 🌸

You can book an appointment anytime by messaging us again.

📞 For urgent help, call us at: [clinic_number]
```

### 6.7 Mode Selection (S11)

```
How would you like the appointment?
```
*Buttons: 🖥️ Online Consultation | 🏥 Clinic Visit (Offline)*

### 6.8 Doctor Selection (S12)

```
Which doctor would you like to consult?
```
*List Menu:*
- *Pulmonary Specialist* — Breathing, asthma, lung problems
- *Non-Pulmonary Pediatrician* — Fever, infections, general
- *Vaccination Doctor* — All vaccinations
- *Any Available Doctor* — First available

### 6.9 Visit Type (S13)

```
What is the purpose of this visit?
```
*List Menu:*
- 💉 Vaccination
- 🩺 Routine Consultation
- 🫁 Pulmonary / Lung Problem
- 🔁 Follow-up Visit

### 6.10 Date Prompt (S14)

```
📅 Please enter your preferred appointment date:
(Format: DD/MM/YYYY)

Note: We accept bookings up to 30 days in advance.
```

### 6.11 Slot Selection (S15)

```
✅ Available slots on [date] for [doctor_type]:

Please choose a time:
```
*Buttons / List: Available slots only*

### 6.12 If No Slots Available

```
😔 No slots are available on *[date]* for *[doctor_type]*.

Here are the next available dates:
1️⃣ [next_date_1]
2️⃣ [next_date_2]
3️⃣ [next_date_3]

Please choose a date or type another date (DD/MM/YYYY):
```

### 6.13 Appointment Summary (S16)

```
📋 *Please confirm your appointment:*

👶 Child Name:   [child_full_name]
🩺 Visit Type:   [visit_type]
🖥️ Mode:         [appointment_mode]
👨‍⚕️ Doctor:      [doctor_type]
📅 Date:         [appointment_date]
⏰ Time:         [slot_label]

Reply *CONFIRM* to book or *EDIT* to make changes.
```
*Buttons: ✅ CONFIRM | ✏️ EDIT*

### 6.14 Final Confirmation (S18–S19)

```
🎉 *Appointment Confirmed!*

✅ Your appointment at *Dr. Indu Child Care* has been successfully booked.

🆔 Appointment ID: *[appointment_id]*
📅 Date & Time: [appointment_date] at [slot_label]
👨‍⚕️ Doctor: [doctor_type]
🖥️ Mode: [appointment_mode]

📍 *Clinic Address:*
[clinic_address]

📞 *Contact:* [clinic_number]

💡 *Please bring:*
- This WhatsApp confirmation
- Any previous prescriptions or test reports
- Your child's vaccination card (if applicable)

Thank you for trusting us with your child's care 🌸

To cancel or reschedule, reply:
*CANCEL [appointment_id]* or *RESCHEDULE [appointment_id]*
```

---

## 7. Database Design & Data Storage

### 7.1 Design Principles

- All tables use **singular noun names** in snake_case
- All primary keys that are user-visible are **string-based** with a meaningful prefix (e.g., `DICC-`, `APT-`)
- Internal-only auto-increment IDs are used where user-visibility is not needed
- All `TIMESTAMP` fields store **UTC** time
- **Soft deletes** only — no records are hard-deleted. Status fields and `is_deleted` flags are used
- All ENUM fields are documented with all possible values
- Foreign key constraints are enforced at the database level
- Index strategy is defined for all frequently queried columns

### 7.2 Table: `patients`

**Purpose:** Stores one record per registered patient (child). This is the master record created at registration.

**Indexes:**
- `PRIMARY KEY (patient_id)`
- `UNIQUE INDEX idx_parent_mobile (parent_mobile)`
- `INDEX idx_child_name (child_full_name)`
- `INDEX idx_registered_at (registered_at)`

| Column | Data Type | Constraints | Description |
|---|---|---|---|
| patient_id | VARCHAR(20) | PK, NOT NULL | Format: DICC-YYYY-NNNN |
| child_full_name | VARCHAR(100) | NOT NULL | Child's full legal name |
| date_of_birth | DATE | NOT NULL | Child's DOB for age calculation |
| parent_full_name | VARCHAR(100) | NOT NULL | Primary parent/guardian |
| parent_mobile | VARCHAR(15) | NOT NULL, UNIQUE | WhatsApp number used for bot |
| alt_mobile | VARCHAR(15) | NULLABLE | Secondary contact |
| email | VARCHAR(150) | NOT NULL | Parent email |
| address | TEXT | NOT NULL | Full residential address |
| symptoms_notes | TEXT | NULLABLE | Reason for first visit |
| registration_status | ENUM('PENDING','COMPLETE') | NOT NULL, DEFAULT 'COMPLETE' | Status of registration flow |
| registered_at | TIMESTAMP | DEFAULT NOW() | UTC timestamp of registration |
| whatsapp_session_id | VARCHAR(100) | NULLABLE | Last active bot session ID |
| is_deleted | BOOLEAN | DEFAULT FALSE | Soft delete flag |
| deleted_at | TIMESTAMP | NULLABLE | Soft delete timestamp |
| created_by | VARCHAR(50) | DEFAULT 'BOT' | Who created the record |

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

---

### 7.3 Table: `appointments`

**Purpose:** Stores one record per appointment booking. A patient may have many appointments over time.

**Indexes:**
- `PRIMARY KEY (appointment_id)`
- `INDEX idx_patient_id (patient_id)`
- `INDEX idx_appointment_date (appointment_date)`
- `INDEX idx_status (status)`
- `INDEX idx_doctor_date (doctor_type, appointment_date)`

| Column | Data Type | Constraints | Description |
|---|---|---|---|
| appointment_id | VARCHAR(20) | PK, NOT NULL | Format: APT-YYYY-NNNNN |
| patient_id | VARCHAR(20) | FK → patients, NOT NULL | Linked patient |
| appointment_mode | ENUM('ONLINE','OFFLINE') | NOT NULL | Type of visit |
| doctor_type | ENUM('PULMONARY','NON_PULMONARY','VACCINATION','ANY') | NOT NULL | Selected doctor specialization |
| assigned_doctor_name | VARCHAR(100) | NULLABLE | Actual doctor name (filled by secretary) |
| visit_type | ENUM('VACCINATION','CONSULTATION','PULMONARY','FOLLOWUP') | NOT NULL | Reason for visit |
| appointment_date | DATE | NOT NULL | Date of appointment |
| time_slot_id | VARCHAR(10) | FK → time_slots, NOT NULL | Linked time slot |
| status | ENUM('PENDING','CONFIRMED','CANCELLED','COMPLETED','RESCHEDULED','NO_SHOW') | NOT NULL DEFAULT 'CONFIRMED' | Current appointment status |
| confirmation_sent | BOOLEAN | DEFAULT FALSE | WhatsApp confirmation dispatched? |
| reminder_24h_sent | BOOLEAN | DEFAULT FALSE | 24hr reminder dispatched? |
| reminder_2h_sent | BOOLEAN | DEFAULT FALSE | 2hr reminder dispatched? |
| cancelled_at | TIMESTAMP | NULLABLE | When cancellation occurred |
| cancelled_by | VARCHAR(50) | NULLABLE | 'BOT', 'SECRETARY', or 'ADMIN' |
| cancellation_reason | TEXT | NULLABLE | Optional reason |
| secretary_notes | TEXT | NULLABLE | Internal notes |
| created_at | TIMESTAMP | DEFAULT NOW() | Booking timestamp |
| last_updated_at | TIMESTAMP | ON UPDATE NOW() | Last change timestamp |
| last_updated_by | VARCHAR(50) | NULLABLE | Who last changed the record |

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
  INDEX idx_patient_id   (patient_id),
  INDEX idx_appointment_date (appointment_date),
  INDEX idx_status           (status),
  INDEX idx_doctor_date      (doctor_type, appointment_date)
);
```

---

### 7.4 Table: `time_slots`

**Purpose:** Master reference for all possible time slots. Secretary manages this table from the dashboard.

```sql
CREATE TABLE time_slots (
  slot_id    VARCHAR(10)           NOT NULL,
  slot_label VARCHAR(50)           NOT NULL,
  start_time TIME                  NOT NULL,
  end_time   TIME                  NOT NULL,
  session    ENUM('MORNING','EVENING') NOT NULL,
  is_active  BOOLEAN               NOT NULL DEFAULT TRUE,
  sort_order INT                   NOT NULL DEFAULT 0,
  PRIMARY KEY (slot_id),
  INDEX idx_session (session),
  INDEX idx_active  (is_active)
);

-- Seed data
INSERT INTO time_slots (slot_id, slot_label, start_time, end_time, session, sort_order) VALUES
  ('S1', '10:00 – 10:30 AM', '10:00:00', '10:30:00', 'MORNING', 1),
  ('S2', '11:00 – 11:30 AM', '11:00:00', '11:30:00', 'MORNING', 2),
  ('S3', '11:30 AM – 12:00 PM', '11:30:00', '12:00:00', 'MORNING', 3),
  ('S4', '05:00 – 05:30 PM', '17:00:00', '17:30:00', 'EVENING', 4),
  ('S5', '06:00 – 06:30 PM', '18:00:00', '18:30:00', 'EVENING', 5),
  ('S6', '06:30 – 07:00 PM', '18:30:00', '19:00:00', 'EVENING', 6);
```

---

### 7.5 Table: `slot_availability`

**Purpose:** Tracks the booking status of each slot for each date and each doctor type. This is the real-time availability table queried during booking.

**Business Rule:** A slot is available if and only if a row for (slot_id, slot_date, doctor_type) does NOT exist, OR it exists with `is_booked = FALSE` AND `blocked_by_admin = FALSE`.

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

---

### 7.6 Table: `mrd_entries`

**Purpose:** Stores all clinical visit notes linked to a patient's MRD. One entry per completed appointment visit.

```sql
CREATE TABLE mrd_entries (
  entry_id          INT           NOT NULL AUTO_INCREMENT,
  patient_id        VARCHAR(20)   NOT NULL,
  appointment_id    VARCHAR(20),
  visit_date        DATE          NOT NULL,
  visit_type        ENUM('VACCINATION','CONSULTATION','PULMONARY','FOLLOWUP') NOT NULL,
  attending_doctor  VARCHAR(100),
  chief_complaint   TEXT,
  clinical_notes    TEXT,
  diagnosis         TEXT,
  prescription      TEXT,
  investigations    TEXT,
  next_visit_due    DATE,
  vaccine_given     VARCHAR(255),
  vaccine_batch     VARCHAR(100),
  recorded_by       VARCHAR(100)  NOT NULL,
  recorded_at       TIMESTAMP     NOT NULL DEFAULT NOW(),
  last_edited_by    VARCHAR(100),
  last_edited_at    TIMESTAMP,
  is_locked         BOOLEAN       NOT NULL DEFAULT FALSE,
  PRIMARY KEY (entry_id),
  FOREIGN KEY (patient_id)     REFERENCES patients(patient_id),
  FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id),
  INDEX idx_patient_id  (patient_id),
  INDEX idx_visit_date  (visit_date),
  INDEX idx_visit_type  (visit_type)
);
```

---

### 7.7 Table: `bot_sessions`

**Purpose:** Persists the conversational state for each active or recent WhatsApp session. Enables mid-conversation resume.

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
  INDEX idx_wa_number    (wa_number),
  INDEX idx_current_state (current_state),
  INDEX idx_expires_at    (expires_at)
);
```

**`session_data` JSON structure example:**
```json
{
  "child_full_name": "Arjun Sharma",
  "parent_full_name": "Rohit Sharma",
  "parent_mobile": "9876543210",
  "alt_mobile": "SKIP",
  "date_of_birth": "2020-04-15",
  "email": "rohit@example.com",
  "address": "42, Lakeview Society, Mumbai - 400053",
  "symptoms_notes": "Frequent cough",
  "appointment_mode": "OFFLINE",
  "doctor_type": "PULMONARY",
  "visit_type": "CONSULTATION",
  "appointment_date": "2026-02-25",
  "time_slot_id": "S2"
}
```

---

### 7.8 Table: `audit_logs`

**Purpose:** Immutable log of all significant system events for compliance, debugging, and security.

```sql
CREATE TABLE audit_logs (
  log_id      BIGINT        NOT NULL AUTO_INCREMENT,
  event_type  VARCHAR(50)   NOT NULL,
  entity_type VARCHAR(50)   NOT NULL,
  entity_id   VARCHAR(50)   NOT NULL,
  actor       VARCHAR(100)  NOT NULL,
  actor_type  ENUM('BOT','SECRETARY','ADMIN','SYSTEM','API') NOT NULL,
  old_value   JSON,
  new_value   JSON,
  ip_address  VARCHAR(45),
  user_agent  VARCHAR(255),
  occurred_at TIMESTAMP     NOT NULL DEFAULT NOW(),
  PRIMARY KEY (log_id),
  INDEX idx_entity      (entity_type, entity_id),
  INDEX idx_event_type  (event_type),
  INDEX idx_occurred_at (occurred_at)
);
```

**Event types logged:** `PATIENT_REGISTERED`, `APPOINTMENT_BOOKED`, `APPOINTMENT_CANCELLED`, `APPOINTMENT_RESCHEDULED`, `SLOT_BLOCKED`, `SLOT_UNBLOCKED`, `MRD_ENTRY_CREATED`, `MRD_ENTRY_EDITED`, `DASHBOARD_LOGIN`, `DASHBOARD_LOGOUT`, `API_ERROR`.

---

### 7.9 Table: `admin_users`

**Purpose:** Stores dashboard user accounts with role-based access control.

```sql
CREATE TABLE admin_users (
  user_id       INT           NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)   NOT NULL UNIQUE,
  email         VARCHAR(150)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  full_name     VARCHAR(100)  NOT NULL,
  role          ENUM('SUPER_ADMIN','ADMIN','SECRETARY','DOCTOR') NOT NULL,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMP,
  created_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id),
  UNIQUE INDEX idx_username (username),
  UNIQUE INDEX idx_email    (email)
);
```

**Role Permissions:**

| Permission | SUPER_ADMIN | ADMIN | SECRETARY | DOCTOR |
|---|---|---|---|---|
| View all appointments | ✅ | ✅ | ✅ | ✅ (own only) |
| Add/Edit appointments | ✅ | ✅ | ✅ | ❌ |
| Block/Unblock slots | ✅ | ✅ | ✅ | ❌ |
| View patient MRD | ✅ | ✅ | ✅ (basic) | ✅ |
| Add/Edit MRD entries | ✅ | ✅ | ❌ | ✅ |
| Export MRD PDF | ✅ | ✅ | ✅ | ✅ |
| Manage system settings | ✅ | ✅ | ❌ | ❌ |
| Manage admin users | ✅ | ❌ | ❌ | ❌ |
| View audit logs | ✅ | ✅ | ❌ | ❌ |

---

### 7.10 Table: `clinic_config`

**Purpose:** Key-value store for all clinic-level configuration settings. Allows admin to update settings without code changes.

```sql
CREATE TABLE clinic_config (
  config_key   VARCHAR(100) NOT NULL,
  config_value TEXT         NOT NULL,
  description  VARCHAR(255),
  updated_at   TIMESTAMP    DEFAULT NOW() ON UPDATE NOW(),
  updated_by   VARCHAR(100),
  PRIMARY KEY (config_key)
);

-- Seed data
INSERT INTO clinic_config VALUES
  ('clinic_name',        'Dr. Indu Child Care',                  'Display name', NOW(), 'SYSTEM'),
  ('clinic_address',     '[Full Clinic Address]',                'Shown in confirmations', NOW(), 'SYSTEM'),
  ('clinic_phone',       '[Clinic Phone Number]',               'Shown in confirmations', NOW(), 'SYSTEM'),
  ('booking_window_days','30',                                   'Max days ahead for bookings', NOW(), 'SYSTEM'),
  ('session_expiry_hrs', '24',                                   'Hours before incomplete session expires', NOW(), 'SYSTEM'),
  ('max_retries',        '3',                                    'Max invalid attempts before escalation', NOW(), 'SYSTEM'),
  ('cancel_cutoff_hrs',  '2',                                    'Hours before appointment when self-cancel via bot is locked', NOW(), 'SYSTEM'),
  ('clinic_closed_days', 'Sunday',                               'Comma-separated days clinic is closed', NOW(), 'SYSTEM'),
  ('timezone',           'Asia/Kolkata',                         'Clinic timezone for date display', NOW(), 'SYSTEM');
```

---

### 7.11 Entity Relationship Diagram

```
┌─────────────┐        ┌──────────────────┐       ┌─────────────────┐
│   patients  │        │   appointments   │       │   time_slots    │
│─────────────│        │──────────────────│       │─────────────────│
│ patient_id  │──1:N──▶│ appointment_id   │──N:1──│ slot_id         │
│ child_name  │        │ patient_id (FK)  │       │ slot_label      │
│ parent_name │        │ time_slot_id(FK) │       │ start_time      │
│ parent_mob  │        │ doctor_type      │       │ end_time        │
│ ...         │        │ status           │       │ session         │
└─────────────┘        │ ...              │       └─────────────────┘
       │               └──────────────────┘               │
       │ 1:N                    │ 1:N                     │ 1:N
       ▼                        ▼                         ▼
┌──────────────┐      ┌──────────────────┐     ┌──────────────────────┐
│  mrd_entries │      │  audit_logs      │     │  slot_availability   │
│──────────────│      │──────────────────│     │──────────────────────│
│ entry_id     │      │ log_id           │     │ id                   │
│ patient_id   │      │ entity_type      │     │ slot_id (FK)         │
│ appointment_id│     │ entity_id        │     │ slot_date            │
│ clinical_notes│     │ actor            │     │ doctor_type          │
│ diagnosis    │      │ old_value        │     │ is_booked            │
│ prescription │      │ new_value        │     │ appointment_id (FK)  │
│ ...          │      │ occurred_at      │     │ blocked_by_admin     │
└──────────────┘      └──────────────────┘     └──────────────────────┘

┌──────────────┐      ┌──────────────┐
│ bot_sessions │      │ admin_users  │
│──────────────│      │──────────────│
│ session_id   │      │ user_id      │
│ wa_number    │      │ username     │
│ patient_id   │      │ role         │
│ current_state│      │ password_hash│
│ session_data │      │ is_active    │
│ expires_at   │      └──────────────┘
└──────────────┘
```

---

## 8. API Specification

### 8.1 Authentication

All API endpoints require a **Bearer JWT token** in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

n8n obtains the JWT by calling `POST /api/auth/token` with the bot's service account credentials. Tokens expire after 1 hour and must be refreshed.

### 8.2 Base URL

```
https://api.dichildcare.com/v1
```

### 8.3 Standard Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-02-19T10:30:00Z",
    "request_id": "req_abc123"
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "parent_mobile must be a 10-digit number",
    "field": "parent_mobile"
  },
  "meta": {
    "timestamp": "2026-02-19T10:30:00Z",
    "request_id": "req_abc123"
  }
}
```

### 8.4 Full Endpoint Reference

---

#### `POST /api/auth/token`

Authenticate a service account and retrieve a JWT.

**Request:**
```json
{
  "client_id": "n8n_bot_service",
  "client_secret": "••••••••••••"
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGci...",
    "token_type": "Bearer",
    "expires_in": 3600
  }
}
```

---

#### `POST /api/patients/register`

Create a new patient record after registration completion.

**Request:**
```json
{
  "child_full_name": "Arjun Sharma",
  "date_of_birth": "2020-04-15",
  "parent_full_name": "Rohit Sharma",
  "parent_mobile": "9876543210",
  "alt_mobile": "9812345678",
  "email": "rohit.sharma@gmail.com",
  "address": "42, Lakeview Society, Andheri West, Mumbai - 400053",
  "symptoms_notes": "Frequent cough and mild fever",
  "whatsapp_session_id": "sess_wa_xyz987"
}
```
**Response `201 Created`:**
```json
{
  "success": true,
  "data": {
    "patient_id": "DICC-2026-0047",
    "registration_status": "COMPLETE",
    "registered_at": "2026-02-19T10:30:00Z"
  }
}
```
**Validation Errors (`400`):** Missing required fields, invalid mobile format, invalid email, DOB in future.

**Conflict (`409`):** Mobile number already registered — returns existing `patient_id`.

---

#### `GET /api/patients/:identifier`

Fetch patient details by `patient_id` or `parent_mobile`.

**Examples:**
```
GET /api/patients/DICC-2026-0047
GET /api/patients/9876543210
```
**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "patient_id": "DICC-2026-0047",
    "child_full_name": "Arjun Sharma",
    "date_of_birth": "2020-04-15",
    "parent_full_name": "Rohit Sharma",
    "parent_mobile": "9876543210",
    "email": "rohit.sharma@gmail.com",
    "registration_status": "COMPLETE",
    "total_appointments": 3,
    "last_appointment_date": "2026-01-10"
  }
}
```

---

#### `GET /api/slots/available`

Query available time slots for a given doctor type and date.

```
GET /api/slots/available?doctor_type=PULMONARY&date=2026-02-25
```
**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "date": "2026-02-25",
    "doctor_type": "PULMONARY",
    "is_clinic_open": true,
    "available_slots": [
      { "slot_id": "S1", "label": "10:00 – 10:30 AM", "session": "MORNING" },
      { "slot_id": "S3", "label": "11:30 AM – 12:00 PM", "session": "MORNING" },
      { "slot_id": "S5", "label": "06:00 – 06:30 PM", "session": "EVENING" }
    ],
    "total_available": 3
  }
}
```
**If no slots available:** Returns `available_slots: []` and `next_available_dates: ["2026-02-26", "2026-02-27", "2026-02-28"]`.

---

#### `POST /api/appointments/book`

Create a confirmed appointment. This is an atomic operation — both the appointment record creation and slot marking happen in a single DB transaction.

**Request:**
```json
{
  "patient_id": "DICC-2026-0047",
  "appointment_mode": "OFFLINE",
  "doctor_type": "PULMONARY",
  "visit_type": "CONSULTATION",
  "appointment_date": "2026-02-25",
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
    "appointment_date": "2026-02-25",
    "time_slot": { "slot_id": "S2", "label": "11:00 – 11:30 AM" },
    "created_at": "2026-02-19T10:35:00Z"
  }
}
```
**Conflict (`409`):** Slot already booked — race condition safety. Returns error with `next_available_dates`.

---

#### `PATCH /api/appointments/:id/cancel`

Cancel a specific appointment.

**Request:**
```json
{
  "cancelled_by": "BOT",
  "cancellation_reason": "Patient requested cancellation via WhatsApp"
}
```
**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "appointment_id": "APT-2026-00291",
    "status": "CANCELLED",
    "cancelled_at": "2026-02-19T11:00:00Z",
    "slot_freed": true
  }
}
```

---

#### `POST /api/appointments/:id/reschedule`

Reschedule an existing appointment to a new date and time.

**Request:**
```json
{
  "new_date": "2026-02-28",
  "new_time_slot_id": "S4"
}
```
**Response `200 OK`:** Returns updated appointment with new date/slot.

---

#### `GET /api/mrd/:patient_id`

Retrieve the full MRD for a patient including all visit history.

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "patient_id": "DICC-2026-0047",
    "child_full_name": "Arjun Sharma",
    "date_of_birth": "2020-04-15",
    "total_visits": 3,
    "mrd_entries": [
      {
        "entry_id": 12,
        "visit_date": "2026-01-10",
        "visit_type": "CONSULTATION",
        "attending_doctor": "Dr. Indu",
        "chief_complaint": "Persistent cough for 2 weeks",
        "diagnosis": "Upper respiratory tract infection",
        "prescription": "Amoxicillin 125mg syrup, Cetrizine drops",
        "next_visit_due": "2026-01-20",
        "recorded_by": "Dr. Indu"
      }
    ],
    "vaccination_history": [
      {
        "entry_id": 7,
        "visit_date": "2025-12-05",
        "vaccine_given": "MMR Booster",
        "vaccine_batch": "MMR-2025-B4421"
      }
    ]
  }
}
```

---

#### `POST /api/mrd/entry`

Add a new clinical note to a patient's MRD after a completed visit.

**Request:**
```json
{
  "patient_id": "DICC-2026-0047",
  "appointment_id": "APT-2026-00291",
  "visit_date": "2026-02-25",
  "visit_type": "CONSULTATION",
  "attending_doctor": "Dr. Indu",
  "chief_complaint": "Shortness of breath during exercise",
  "clinical_notes": "Child shows mild wheeze on auscultation...",
  "diagnosis": "Mild intermittent asthma",
  "prescription": "Salbutamol inhaler 100mcg as needed",
  "next_visit_due": "2026-03-25",
  "recorded_by": "Dr. Indu"
}
```

---

#### `POST /api/admin/block-slot`

Secretary or admin blocks a specific slot.

**Request:**
```json
{
  "slot_id": "S3",
  "slot_date": "2026-02-26",
  "doctor_type": "PULMONARY",
  "blocked_reason": "Doctor unavailable - personal leave",
  "blocked_by": "Secretary Sunita"
}
```

---

#### `GET /api/appointments/today`

Returns all appointments for today's date. Used by dashboard on page load.

```
GET /api/appointments/today?doctor_type=ALL&status=CONFIRMED
```

---

## 9. Bot State Machine

### 9.1 State Definitions

| State ID | State Name | Description | Input Expected | Output |
|---|---|---|---|---|
| S00 | WELCOME | First contact — user sends any message | Any message | Welcome message + begin registration prompt |
| S01 | COLLECT_CHILD_NAME | Waiting for child's name | Free text | Next question or error |
| S02 | COLLECT_PARENT_NAME | Waiting for parent's name | Free text | Next question or error |
| S03 | COLLECT_MOBILE | Waiting for mobile number | 10-digit numeric | Next question or error |
| S04 | COLLECT_ALT_MOBILE | Waiting for alternate mobile or SKIP | 10-digit numeric or "SKIP" | Next question or error |
| S05 | COLLECT_DOB | Waiting for date of birth | DD/MM/YYYY | Next question or error |
| S06 | COLLECT_EMAIL | Waiting for email | Email format | Next question or error |
| S07 | COLLECT_ADDRESS | Waiting for address | Free text | Next question or error |
| S08 | COLLECT_SYMPTOMS | Waiting for symptoms | Free text or "VACCINATION" | Registration summary |
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

### 9.2 State Transition Table

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
| S11 | Valid mode selected | S12 |
| S12 | Valid doctor selected | S13 |
| S13 | Valid visit type selected | S14 |
| S14 | Valid date with slots available | S15 |
| S14 | Valid date with no slots | S14 (show alternatives, re-prompt) |
| S14 | Invalid date format or out of range | S14 (re-prompt with error) |
| S15 | Valid slot selected | S16 |
| S16 | Auto | S17 |
| S17 | "CONFIRM" button | S18 |
| S17 | "EDIT" button | S11 (clear appointment data) |
| S18 | DB write success | S19 |
| S18 | DB write failure | S17 (retry once, then ERR) |
| S19 | Message sent | S20 |
| S20 | Terminal | — |

### 9.3 Full State Flow Diagram

```
[New User]                             [Returning User]
    │                                         │
    ▼                                         │
  S00 WELCOME                                 │
    │                                         │
    ▼                                         │
  S01 CHILD NAME ◀──(retry on fail)          │
    │                                         │
  S02 PARENT NAME ◀──(retry on fail)         │
    │                                         │
  S03 MOBILE ◀──(retry on fail)              │
    │                                         │
  S04 ALT MOBILE ◀──(retry/skip)             │
    │                                         │
  S05 DATE OF BIRTH ◀──(retry on fail)       │
    │                                         │
  S06 EMAIL ◀──(retry on fail)               │
    │                                         │
  S07 ADDRESS ◀──(retry on fail)             │
    │                                         │
  S08 SYMPTOMS ◀──(retry on fail)            │
    │                                         │
  S09 CONFIRM REGISTRATION ──────────────────┘
    │                                         │
   [Confirm]         [Start Over]─────────▶ S01
    │
  S10 ASK BOOK APPOINTMENT
    │               │
  [Yes]           [No]
    │               │
    │             S20 SESSION END
    │
  S11 SELECT MODE
    │
  S12 SELECT DOCTOR
    │
  S13 SELECT VISIT TYPE
    │
  S14 SELECT DATE ◀──(no slots: show alternatives)
    │
  S15 SELECT TIME SLOT
    │
  S16 SHOW SUMMARY
    │
  S17 AWAIT CONFIRM ──[EDIT]──▶ S11
    │
  [CONFIRM]
    │
  S18 BOOKING CONFIRMED
    │
  S19 SEND CONFIRMATION MESSAGE
    │
  S20 SESSION END
    │
  ──── DONE ────
```

---

## 10. Non-Functional Requirements

### 10.1 Performance

| ID | Requirement | Metric |
|---|---|---|
| NFR-01 | Bot response latency | < 3 seconds from message receipt to bot reply for 95th percentile |
| NFR-02 | API response time | < 500ms for all read endpoints; < 1 second for write endpoints |
| NFR-03 | Dashboard page load | Initial load < 2 seconds on a standard broadband connection |
| NFR-04 | Database query time | All indexed queries < 100ms |
| NFR-05 | Slot availability check | < 200ms from API call to response |

### 10.2 Scalability

| ID | Requirement | Metric |
|---|---|---|
| NFR-06 | Concurrent bot sessions | Support ≥ 500 simultaneous active WhatsApp conversations |
| NFR-07 | Daily appointment volume | System shall handle up to 200 appointments per day without performance degradation |
| NFR-08 | Patient database size | System shall maintain performance with up to 50,000 patient records |
| NFR-09 | Horizontal scaling | API middleware shall be stateless and support horizontal scaling (multiple instances behind a load balancer) |

### 10.3 Availability & Reliability

| ID | Requirement | Metric |
|---|---|---|
| NFR-10 | System uptime | ≥ 99.5% monthly uptime (max 3.65 hours downtime/month) |
| NFR-11 | Planned maintenance window | Maintenance windows must be between 2:00–4:00 AM IST on weekdays only |
| NFR-12 | Data durability | Zero data loss for committed transactions |
| NFR-13 | Database replication | Primary-replica DB setup with automatic failover |
| NFR-14 | API retry logic | n8n shall retry failed API calls up to 3 times with exponential backoff (1s, 3s, 9s delays) |
| NFR-15 | Message delivery | WhatsApp confirmations shall be delivered within 30 seconds of appointment creation |

### 10.4 Usability

| ID | Requirement | Metric |
|---|---|---|
| NFR-16 | Registration completion rate | ≥ 85% of users who start registration shall complete it |
| NFR-17 | Bot message readability | All messages shall be written at or below a 7th-grade reading level |
| NFR-18 | Maximum taps per step | Each step requires ≤ 2 user interactions (tap + confirm) |
| NFR-19 | Error message clarity | All error messages must include the expected format and a concrete example |
| NFR-20 | Dashboard usability | A new secretary shall be able to perform core tasks without training after reading a 1-page guide |

### 10.5 Maintainability

| ID | Requirement | Metric |
|---|---|---|
| NFR-21 | Code documentation | All API endpoints and database tables must have inline documentation |
| NFR-22 | Configuration externalization | All clinic-specific settings (slots, timings, messages) must be configurable from the dashboard without code changes |
| NFR-23 | Logging | All API requests and responses shall be logged with request_id, timestamp, status code, and duration |
| NFR-24 | Monitoring | System health dashboard (uptime, response times, error rates) must be accessible to admin |
| NFR-25 | Backup | Full database backup daily at 2:00 AM IST; transaction log backup every 6 hours; 30-day retention |

---

## 11. Security & Privacy Model

### 11.1 Data Classification

| Data Class | Examples | Required Protection |
|---|---|---|
| Highly Sensitive | Diagnosis, prescription, clinical notes | Encryption at rest + access control (doctors only) |
| Sensitive | Patient name, DOB, mobile, email, address | Encryption at rest + access control (all staff) |
| Internal | Appointment schedule, slot availability | Access control (all staff) |
| Public | Clinic name, address, contact number | No special protection |

### 11.2 Encryption

- **Data at rest:** All sensitive and highly sensitive data fields shall be encrypted using **AES-256** encryption at the application layer before storage. Database-level encryption (MySQL TDE or PostgreSQL pgcrypto) shall be enabled as an additional layer.
- **Data in transit:** All API communication shall use **TLS 1.2 or higher**. HTTP connections shall be automatically redirected to HTTPS.
- **WhatsApp messages:** Meta's WhatsApp Business API uses **end-to-end encryption** for all messages. The clinic's WATI account is the decryption endpoint.
- **Password storage:** Admin user passwords shall be hashed using **bcrypt** with a cost factor of ≥ 12. Plaintext passwords are never stored.

### 11.3 Authentication & Authorization

- All API endpoints (except the token endpoint) require a valid JWT Bearer token.
- JWTs are signed with RS256 (RSA 256-bit asymmetric key).
- Dashboard login uses username + password. Sessions expire after 8 hours of inactivity.
- Role-Based Access Control (RBAC) is enforced at both the API and UI layer.
- Admin users cannot see another admin's password. Password reset requires an email-based OTP flow.

### 11.4 Input Validation & Injection Prevention

- All user inputs received via the bot and API are validated and sanitized before processing.
- Parameterized queries (prepared statements) are used for all database operations. Raw string concatenation in SQL is strictly prohibited.
- API requests are validated against a schema (e.g., using Joi or Zod) before reaching business logic.
- Rate limiting: The bot API endpoint accepts a maximum of 10 requests per second per phone number.

### 11.5 Compliance

| Regulation | Requirement | Implementation |
|---|---|---|
| IT Act 2000 (India) | Protect sensitive personal data | Encryption, access controls, audit logs |
| DPDP Act 2023 (India) | Data minimization, purpose limitation | Only collect fields required for the stated purpose; no third-party data sharing |
| DPDP Act 2023 | Data retention | Patient data retained for minimum 7 years per medical records regulation; deletion on patient request after retention period |
| DPDP Act 2023 | Consent | Registration flow includes explicit consent statement before data collection begins |
| WhatsApp Business Policy | Template messages only for outbound | All bot-initiated messages use approved WATI templates |

### 11.6 Data Retention Policy

| Data Type | Retention Period | Action on Expiry |
|---|---|---|
| Patient registration data | 7 years after last visit | Anonymized (names/contact replaced with hash) |
| MRD entries | 7 years after last entry | Archived to cold storage (read-only access) |
| Appointment records | 7 years | Archived |
| Audit logs | 3 years | Purged |
| Bot session data | 24 hours (active) / 30 days (completed) | Purged |
| Admin user accounts | Retained until manually deactivated | Deactivated on staff departure, deleted after 90 days |

### 11.7 Security Incident Response

- **Unauthorized access detected** → Immediately invalidate all active JWT tokens → Notify SUPER_ADMIN via email → Create audit log entry → Initiate review of access logs
- **Data breach suspected** → Take API offline → Notify clinic owner and affected patients as per DPDP Act requirements → Engage cybersecurity review

---

## 12. Integration Specifications

### 12.1 WhatsApp Business API (Meta)

The clinic must complete the following Meta requirements before deployment:

1. Register a **WhatsApp Business Account (WABA)** via Meta Business Suite
2. Verify the clinic's business with a valid GST or business registration document
3. Submit and receive approval for all **message templates** that initiate conversations (outbound first messages)
4. Configure the webhook URL pointing to the WATI instance

**Meta Rate Limits:**
- Tier 1 (new account): 1,000 business-initiated conversations/day
- Tier 2 (after 90 days with quality rating): 10,000/day
- Tier 3: 100,000/day

### 12.2 WATI Platform Configuration

| Configuration Item | Value |
|---|---|
| Webhook URL | `https://n8n.dichildcare.com/webhook/wati-incoming` |
| Webhook events | `message`, `message_status_update`, `button_reply`, `list_reply` |
| Session timeout | 24 hours |
| Human takeover keyword | `AGENT` |
| Bot re-engagement keyword | `BOT` |
| Message templates required | Welcome, Registration Confirmation, Appointment Confirmation, Cancellation Confirmation, Reminder 24h, Reminder 2h, Escalation |

### 12.3 n8n Workflow Architecture

The n8n instance shall contain the following workflows:

| Workflow Name | Trigger | Purpose |
|---|---|---|
| `bot-incoming-handler` | WATI webhook | Master router — reads session state, calls appropriate sub-workflow |
| `registration-flow` | Sub-workflow call | Handles S01–S09 state transitions |
| `appointment-flow` | Sub-workflow call | Handles S11–S19 state transitions |
| `cancellation-handler` | Message contains "CANCEL" | Handles appointment cancellation |
| `reschedule-handler` | Message contains "RESCHEDULE" | Handles appointment rescheduling |
| `session-manager` | Called by all flows | Reads/writes bot_sessions table |
| `reminder-scheduler` | CRON: every hour | Checks for appointments in next 24h or 2h, sends reminders (Phase 2) |
| `slot-expiry-cron` | CRON: daily 1 AM | Removes stale slot_availability records for past dates |
| `error-escalation` | Sub-workflow call | Flags session for human review, notifies secretary |

### 12.4 Dashboard Frontend Integration

The secretary dashboard (React.js) communicates with the REST API middleware over HTTPS. All API calls use the admin user's JWT obtained at login. The dashboard maintains a WebSocket connection for real-time notification of new appointments without page refresh.

### 12.5 Email Notification Integration

| Event | Recipient | Method |
|---|---|---|
| New appointment booked | Secretary, assigned doctor | Email via SMTP (Gmail / SendGrid) |
| Appointment cancelled | Secretary | Email |
| New patient registered | Admin | Daily digest email at 8 PM |
| System error / escalation | SUPER_ADMIN | Immediate email alert |

---

## 13. Error Handling & Edge Cases

### 13.1 Bot-Level Error Handling

| Scenario | Detection | System Response | Logged? |
|---|---|---|---|
| Invalid registration field input | Input fails validation regex | Error message with example + re-prompt same state | Yes |
| 3 consecutive invalid inputs (max retries) | retry_count = 3 in bot_sessions | Escalation message: "Our team will reach out to help you." Secretary flagged. | Yes |
| Unexpected message during button-only state | Free text received when button expected | "Please use one of the options shown below." Re-display buttons. | No |
| User sends "MENU" or "HELP" | Keyword match | Display main menu options | No |
| User sends "AGENT" | Keyword match | Hand off to WATI human inbox | Yes |
| Bot session expired (24h) | Session not found or expires_at < NOW() | Start fresh registration or greet as returning user | Yes |
| User sends message in non-supported language | Bot cannot validate | Respond in English + inform: "Please reply in English" | No |

### 13.2 Slot & Booking Error Handling

| Scenario | Response |
|---|---|
| Requested date is in the past | "That date has already passed. Please enter a date from [today's date] onwards." |
| Requested date beyond 30-day window | "We accept bookings up to 30 days in advance. Please choose a date before [max_date]." |
| Requested date is a Sunday (clinic closed) | "Our clinic is closed on Sundays. Please choose a different date." |
| Requested date is a clinic holiday | "Our clinic will be closed on [date] for [holiday name]. Please choose a different date." |
| Selected slot becomes booked during flow (race condition) | "Unfortunately, that slot was just taken. Please choose another slot." Re-display available slots. |
| Zero slots available on requested date | Show next 3 available dates automatically |
| Zero slots in entire next 7 days | "All slots are currently full. Our team will contact you to schedule. Would you like us to call you?" |
| API call fails during booking | "We're experiencing a technical issue. Please try again in a few minutes." Retry max 1 time. |
| Database transaction fails | Full rollback; no appointment created; no slot marked booked; user notified |

### 13.3 API Error Codes

| HTTP Status | Error Code | Meaning |
|---|---|---|
| 400 | VALIDATION_ERROR | Request body fails schema validation |
| 401 | UNAUTHORIZED | Missing or invalid JWT token |
| 403 | FORBIDDEN | Valid token but insufficient permissions |
| 404 | NOT_FOUND | Resource (patient, appointment, slot) not found |
| 409 | CONFLICT | Duplicate registration (mobile) or slot already booked |
| 422 | BUSINESS_RULE_VIOLATION | Valid data but violates business logic (e.g., cancel within 2h) |
| 429 | RATE_LIMIT_EXCEEDED | Too many requests from same source |
| 500 | INTERNAL_SERVER_ERROR | Unexpected server error |
| 503 | SERVICE_UNAVAILABLE | Database or external service unreachable |

### 13.4 System-Level Error Handling

| Scenario | System Action |
|---|---|
| WATI webhook delivery failure | WATI retries up to 3 times; n8n logs failed deliveries |
| n8n instance crash | Workflow state preserved in bot_sessions; auto-restart via process manager (PM2 / systemd) |
| Database primary node failure | Automatic failover to replica in < 30 seconds; read-only mode if failover fails |
| API middleware crash | Auto-restart via PM2; health check endpoint alerts admin if down > 2 minutes |
| WhatsApp API rate limit hit | n8n queues messages and retries after rate limit window resets; user is not notified of delay |

---

## 14. Testing Strategy & Acceptance Criteria

### 14.1 Testing Levels

#### Unit Testing
- All validation functions (mobile, email, date format, name) must have unit tests covering valid and invalid cases
- All API endpoint handler functions must have unit tests
- Target: **≥ 80% code coverage** on business logic files

#### Integration Testing
- Test n8n → REST API → Database round trips for each main workflow
- Test WATI webhook → n8n trigger chain with mock WATI payloads
- Test database transactions (booking + slot marking atomicity)

#### End-to-End Testing
- Full bot conversation flow from first message to appointment confirmation
- Test on real WhatsApp Business sandbox before production deployment
- Cover all branching paths: No to booking, EDIT flow, no slots available, cancellation, reschedule

#### Performance Testing
- Load test: 500 concurrent simulated bot sessions for 10 minutes
- Measure: Response times (P50, P95, P99), error rate, DB connection pool exhaustion
- Acceptance: P95 response time < 3 seconds, error rate < 0.1%

#### Security Testing
- SQL injection test on all API endpoints
- JWT manipulation test (expired token, tampered payload)
- RBAC test: Verify secretary cannot access doctor-only endpoints
- Input fuzzing on all free-text bot fields

### 14.2 UAT Test Cases

| ID | Test Scenario | Test Steps | Expected Outcome | Pass/Fail |
|---|---|---|---|---|
| TC-01 | New user full registration | Send "Hi" → complete all 8 fields → confirm | Patient record in DB with DICC ID | ☐ |
| TC-02 | Registration with invalid mobile | Enter "12345" for mobile | Error message + re-prompt same field | ☐ |
| TC-03 | Registration with past DOB — valid | Enter "15/04/2020" | Accepted, move to next field | ☐ |
| TC-04 | Registration with future DOB | Enter "15/04/2030" | Error: "Date cannot be in the future" | ☐ |
| TC-05 | Max retries exceeded | Enter invalid mobile 3 times | Escalation message displayed, secretary flagged | ☐ |
| TC-06 | Returning user — skip registration | Send "Hi" from registered number | Bot skips to appointment prompt | ☐ |
| TC-07 | Book offline appointment — pulmonary | Select Offline > Pulmonary > Consultation > valid date > slot > CONFIRM | Appointment confirmed, ID returned | ☐ |
| TC-08 | Book online appointment — vaccination | Select Online > Vaccination > Vaccination > valid date > slot > CONFIRM | Appointment confirmed | ☐ |
| TC-09 | Select date with no slots | Enter date where all slots blocked | "No slots available" + next 3 dates shown | ☐ |
| TC-10 | Select a Sunday | Enter a Sunday date | "Clinic is closed on Sundays" error | ☐ |
| TC-11 | Date beyond 30 days | Enter date 45 days ahead | "Cannot book more than 30 days in advance" | ☐ |
| TC-12 | Edit appointment after summary | CONFIRM prompt → EDIT | Returns to Mode Selection, previous data cleared | ☐ |
| TC-13 | Cancel appointment via bot | Send "CANCEL APT-2026-00291" | Appointment cancelled, slot freed, confirmation sent | ☐ |
| TC-14 | Cancel within 2 hours | Send CANCEL for appointment in 1.5 hours | "Please contact clinic directly for same-day cancellation" | ☐ |
| TC-15 | Reschedule appointment | Send "RESCHEDULE APT-2026-00291" | Redirected to date selection, old slot freed after new confirmed | ☐ |
| TC-16 | Secretary blocks a slot | Dashboard: block S3 on 25/02/2026 for PULMONARY | Slot S3 disappears from bot options for that date | ☐ |
| TC-17 | Secretary unblocks slot | Dashboard: unblock S3 on 25/02/2026 | Slot S3 reappears in bot options | ☐ |
| TC-18 | MRD creation on registration | Complete registration | mrd_entries shell created for patient in DB | ☐ |
| TC-19 | MRD note added after visit | Secretary marks appointment COMPLETED → doctor adds notes | mrd_entries record populated with notes | ☐ |
| TC-20 | MRD export as PDF | Dashboard: patient profile → Export MRD | PDF generated with all visit history | ☐ |
| TC-21 | Duplicate registration | Same mobile number attempts to register again | Bot detects existing record, skips to appointment booking | ☐ |
| TC-22 | Session resume after 12 hours | Start registration → abandon at step 4 → return after 12 hours | Bot offers to continue from step 4 | ☐ |
| TC-23 | Session expired after 25 hours | Start registration → abandon → return after 25 hours | Bot starts fresh from step 1 | ☐ |
| TC-24 | Concurrent booking race condition | Two users attempt same slot simultaneously | First user succeeds, second user gets "slot taken" error | ☐ |
| TC-25 | API unauthorized access | Call API without JWT | 401 UNAUTHORIZED response | ☐ |
| TC-26 | Dashboard RBAC | Secretary account tries to add MRD notes | Access denied (403) | ☐ |
| TC-27 | Load test: 50 concurrent sessions | Simulate 50 simultaneous bot conversations | All respond < 3s, no data cross-contamination | ☐ |
| TC-28 | Search patient by mobile | Dashboard search: enter 9876543210 | Correct patient profile returned | ☐ |
| TC-29 | Appointment mode = ANY doctor | Select "Any Available Doctor" | System finds earliest slot across all doctor types | ☐ |
| TC-30 | Audit log entry on booking | Book appointment via bot | New APPOINTMENT_BOOKED entry in audit_logs | ☐ |

### 14.3 Go-Live Criteria

The system shall not be deployed to production until:
- All 30 UAT test cases have a **PASS** status
- Performance test confirms P95 response time < 3 seconds at 500 concurrent sessions
- Security test shows zero critical or high vulnerabilities
- All WATI message templates have been approved by Meta
- Secretary and admin users have completed their training session
- A rollback plan has been documented and tested

---

## 15. Deployment & Infrastructure

### 15.1 Infrastructure Overview

```
                    ┌──────────────────┐
                    │   Cloudflare CDN │
                    │  (DDoS + WAF)    │
                    └────────┬─────────┘
                             │ HTTPS
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
  ┌───────────────┐  ┌───────────────┐  ┌──────────────┐
  │ React Dashboard│  │ n8n Instance  │  │ REST API     │
  │ (Static Hosting│  │ (VPS/Docker)  │  │ Middleware   │
  │ Vercel/Netlify)│  │               │  │ (VPS/Docker) │
  └───────────────┘  └───────┬───────┘  └──────┬───────┘
                             │                  │
                             └──────────────────┘
                                      │
                            ┌─────────▼──────────┐
                            │    MySQL Database   │
                            │  (Primary + Replica)│
                            │  (AWS RDS / VPS)    │
                            └────────────────────┘
```

### 15.2 Server Specifications (Minimum)

| Component | Specification | Recommended |
|---|---|---|
| REST API Server | 2 vCPU, 4GB RAM, 50GB SSD | 4 vCPU, 8GB RAM |
| n8n Server | 2 vCPU, 4GB RAM | 4 vCPU, 8GB RAM |
| Database Primary | 4 vCPU, 8GB RAM, 100GB SSD | 8 vCPU, 16GB RAM |
| Database Replica | Same as primary | Same as primary |
| Dashboard Hosting | Vercel/Netlify free tier | Vercel Pro |

### 15.3 Environment Strategy

| Environment | Purpose | Data |
|---|---|---|
| Development | Developer testing, feature work | Synthetic/mock data only |
| Staging | Full integration testing, UAT | Anonymized copy of production data |
| Production | Live clinic use | Real patient data — access restricted |

### 15.4 CI/CD Pipeline

1. Developer pushes code to feature branch
2. Automated unit tests run on pull request
3. Code review and merge to `main`
4. CI pipeline: run full test suite → build Docker image → push to container registry
5. CD pipeline: auto-deploy to Staging → run integration tests → manual approval gate
6. Manual approval → deploy to Production with zero-downtime rolling update

### 15.5 Monitoring & Alerting

| Metric | Tool | Alert Threshold |
|---|---|---|
| API response time (P95) | Datadog / New Relic | > 2 seconds → Warning; > 5 seconds → Critical |
| API error rate | Same | > 1% → Warning; > 5% → Critical |
| Database connection pool | Same | > 80% used → Warning |
| Disk usage | Same | > 80% → Warning; > 90% → Critical |
| Uptime | UptimeRobot / Pingdom | Any downtime → Immediate alert to admin |
| n8n workflow failures | n8n built-in alerting | Any workflow error → Email to admin |

---

## 16. Future Scope & Roadmap

### Phase 2 — Retention & Reminders (Target: Q2 2026)

| Feature | Description | Priority | Effort |
|---|---|---|---|
| Appointment reminders | Automated WhatsApp reminders at 24hrs and 2hrs before appointment | High | Medium |
| Vaccination tracker | Track scheduled vaccinations; send proactive reminders when due | High | High |
| Appointment cancellation confirmation | Two-way confirmation when secretary cancels — patient notified | High | Low |
| No-show tracking | Mark appointments as NO_SHOW; track repeat no-show patients | Medium | Low |
| Patient feedback collection | Post-visit WhatsApp survey (3 questions) | Medium | Medium |

### Phase 3 — Experience Enhancement (Target: Q3 2026)

| Feature | Description | Priority | Effort |
|---|---|---|---|
| Online consultation link generation | Auto-generate Google Meet / Zoom link on Online appointment confirmation | Medium | High |
| Patient-initiated MRD summary | Patient sends "MY RECORDS" to receive a WhatsApp summary of their last 3 visits | Medium | Medium |
| Multi-language support | Hindi and Marathi bot language options at start of conversation | Medium | High |
| Preferred doctor memory | Remember patient's last chosen doctor; offer as default on next booking | Low | Low |
| Sibling management | Allow one parent to register and manage multiple children under one WhatsApp number | High | High |

### Phase 4 — Business Intelligence (Target: Q4 2026)

| Feature | Description | Priority | Effort |
|---|---|---|---|
| Analytics dashboard | Charts for: daily bookings, doctor utilization, visit type distribution, peak hours, no-show rates | Low | High |
| Monthly report generation | Auto-generated PDF report emailed to admin at end of each month | Low | Medium |
| Payment integration | Online fee collection for Online consultations via Razorpay | Low | High |
| Doctor mobile app | Native iOS/Android app for doctors to view schedule and add MRD notes | Low | Very High |
| EHR integration | Optional export of MRD data in HL7/FHIR format for third-party EHR compatibility | Low | Very High |

---

## 17. Document Revision History

| Version | Date | Author | Summary of Changes |
|---|---|---|---|
| 1.0 | February 2026 | Project Team | Initial SRS — base registration, appointment, DB schema, integrations |
| 2.0 | February 2026 | Project Team | Deep edition — added business context, personas, conversation scripts, full API spec, security model, testing strategy, infrastructure, audit logs, RBAC, config table, race condition handling, compliance details |

---

## Appendix A — Clinic Configuration Checklist

Before go-live, the following items must be configured in the `clinic_config` table:

- [ ] `clinic_name` — Official clinic name for messages
- [ ] `clinic_address` — Full address shown in booking confirmations
- [ ] `clinic_phone` — Contact number shown in confirmations
- [ ] `booking_window_days` — Maximum days ahead a booking is accepted (default: 30)
- [ ] `clinic_closed_days` — Comma-separated closed days (default: "Sunday")
- [ ] `clinic_holiday_dates` — Specific dates the clinic is closed (format: "YYYY-MM-DD, YYYY-MM-DD")
- [ ] `cancel_cutoff_hrs` — Hours before appointment when self-cancel via bot is locked (default: 2)
- [ ] `max_retries` — Max invalid bot inputs before escalation (default: 3)
- [ ] `session_expiry_hrs` — Hours before incomplete session expires (default: 24)

---

## Appendix B — Required WhatsApp Message Templates (for Meta Approval)

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

*Dr. Indu Child Care — Confidential — Internal Use Only*
*Document ID: DICC-SRS-2026-001 | Version 2.0 | February 2026*
