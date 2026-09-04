const pino = require('pino');
const { env } = require('./env');

module.exports = pino({ level: env.LOG_LEVEL });
