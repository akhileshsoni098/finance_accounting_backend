const mongoose = require('mongoose');
const { env } = require('./env');
const logger = require('./logger');

async function connectDatabase() {
  await mongoose.connect(env.MONGO_URI);
  logger.info('MongoDB connection established');
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase };
