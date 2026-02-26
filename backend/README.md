# Dr. Indu Child Care Backend

Backend API for Dr. Indu Child Care Clinic WhatsApp Bot and Appointment System.

## Tech Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB
- **ORM**: Mongoose
- **Auth**: JWT & Bcryptjs

## Project Structure
```
backend/
├── src/
│   ├── routes/         # Express routes (API endpoints)
│   ├── controllers/    # Route controllers (Business logic)
│   ├── models/         # Mongoose models (Schema definitions)
│   ├── middleware/     # Custom middleware (Auth, CORS, etc.)
│   └── app.js          # Main entry point
├── .env                # Environment variables
├── .env.example        # Template for env variables
├── package.json        # Dependencies and scripts
└── README.md           # Documentation
```

## Getting Started

### Prerequisites
- Node.js installed
- MongoDB installed and running locally

### Installation
1. Clone the repository
2. Navigate to the backend folder: `cd backend`
3. Install dependencies: `npm install`
4. Setup environment variables: `cp .env.example .env` (and update values)
5. Start the server: `npm run dev` (if using nodemon) or `npm start`
