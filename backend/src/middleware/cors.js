const cors = require('cors');

const corsOptions = {
    origin: '*', // For development, allow all. In production, restrict this.
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204
};

module.exports = cors(corsOptions);
