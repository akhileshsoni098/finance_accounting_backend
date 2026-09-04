const { createApp } = require('./src/app');
const { connectDatabase, disconnectDatabase } = require('./src/config/db');
const { env } = require('./src/config/env');
const logger = require('./src/config/logger');

async function start() {
  await connectDatabase();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Veridex finance API started');
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutdown requested');
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start().catch((error) => {
  logger.fatal({ err: error }, 'Unable to start Veridex finance API');
  process.exit(1);
});
