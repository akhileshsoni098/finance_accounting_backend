const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGO_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/veridex_finance'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_SECRET: z.string().min(32).optional()
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  console.error('Invalid environment configuration', result.error.flatten().fieldErrors);
  process.exit(1);
}

const env = result.data;
if (env.NODE_ENV === 'production' && (!env.JWT_ACCESS_SECRET || !env.JWT_REFRESH_SECRET)) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are required in production');
}

module.exports = { env };
