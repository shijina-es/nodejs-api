import jwt from 'jsonwebtoken';
import redis from '../config/redis.js';
import errorResponses from '../utils/error_response.js';
import { sendError } from '../controllers/error_controller.js';

export default async function (req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return sendError(res, 401, errorResponses.token_missing);

  const blacklisted = await redis.get(`bl_${token}`);
  if (blacklisted) return sendError(res, 401, errorResponses.token_blacklisted);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    sendError(res, 403, errorResponses.token_invalid);
  }
}