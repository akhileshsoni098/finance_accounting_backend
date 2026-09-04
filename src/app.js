const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const { env } = require('./config/env');
const logger = require('./config/logger');
const requestIdMiddleware = require('./middleware/request-id.middleware');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');
const healthRoutes = require('./routes/health.routes');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(pinoHttp({ logger }));
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1/health', healthRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
