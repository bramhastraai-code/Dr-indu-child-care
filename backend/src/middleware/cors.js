const cors = require('cors');

const corsOptions = {
    // Reflect the request origin if ALLOWED_ORIGINS is not set, 
    // otherwise split the comma-separated list of origins.
    origin: process.env.ALLOWED_ORIGINS 
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
};

module.exports = cors(corsOptions);
