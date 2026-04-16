const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'MarketVision Orchestrator API',
            version: '1.0.0',
            description: 'Auto-scaling API for stock tick processing system',
        },
        servers: [
            {
                url: 'http://localhost:3001',
                description: 'Development server',
            },
        ],
    },
    apis: ['./src/routes/*.js'], // This looks inside your routes folder for documentation
};

const specs = swaggerJsdoc(options);

module.exports = { swaggerUi, specs };