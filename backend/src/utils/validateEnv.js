/**
 * Environment Variable Validator
 * Ensures all required environment variables are present before starting the server.
 */
const validateEnv = () => {
    const required = [
        'MONGODB_URI',
        'JWT_SECRET',
        'N8N_API_KEY'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.error(' [DEPLOYMENT ERROR] 🚨 Missing required environment variables:', missing.join(', '));
        process.exit(1);
    }
    
    console.log(' [DEPLOYMENT INFO] ✅ Environment variables validated.');
};

module.exports = validateEnv;
