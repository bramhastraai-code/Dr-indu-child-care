const cors = require('cors');

const corsOptions = {
    origin: true, // Reflect the request origin, allowing all
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
};

module.exports = cors(corsOptions);
