---
description: How to run the backend and frontend locally
---

# Running Dr. Indu Child Care Locally

This project consists of a **Node.js/Express** backend and a **Vite/React** frontend.

## Prerequisites

- **Node.js** (v18+ recommended)
- **MongoDB** (A connection string is required in the backend `.env` file)

## Steps to Run

### 1. Backend Setup

1. Navigate to the backend directory:
   ```powershell
   cd backend
   ```
2. Install dependencies:
   ```powershell
   npm install
   ```
3. Configure Environment Variables:
   Create a `.env` file in the `backend` folder (based on `.env.example`).
4. Start the backend:
   ```powershell
   npm run dev
   ```
   The backend will start on **http://localhost:5000**.

### 2. Frontend Setup

1. Navigate to the frontend directory:
   ```powershell
   cd frontend
   ```
2. Install dependencies:
   ```powershell
   npm install
   ```
3. Start the frontend:
   ```powershell
   npm run dev
   ```
   The frontend will start on **http://localhost:3000** (configured in `vite.config.js`).

## Troubleshooting

- **Port Conflict**: If port 5000 or 3000 is in use, you may need to kill the process or change the port in `.env` or `vite.config.js`.
- **Database Connection**: Ensure your `MONGODB_URI` in `backend/.env` is correct and accessible.
