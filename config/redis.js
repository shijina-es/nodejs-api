import { createClient } from 'redis';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

const client = createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
});

client.connect().then(() => {
  logger.info('✅ Redis connected');
}).catch((err) => {
  logger.error(`Redis connection error: ${err.message}`);
});

export default client;