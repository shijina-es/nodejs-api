import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import db from './config/db.js';
import redis from './config/redis.js';
import errorMessages from './utils/error_response.js';
import { sendError } from './controllers/error_controller.js';
import authMiddleware from './middleware/auth.js';
import id_generator from './utils/id_generator.js' // for generating unique ids
import logger from './utils/logger.js';
const { verify } = jwt;

dotenv.config();

const app = express();
app.use(express.json());

const generator= new id_generator() // for generating different unique random ids

// Helper to create tokens
const createAccessToken = (user_id, mail_id) => {
  //console.log('inside token', user_id);
  return jwt.sign(
    { user_id, mail_id }, // payload
    process.env.JWT_SECRET, // secret
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '1h' } // options
  );
};

const createRefreshToken = (user_id, mail_id) => jwt.sign(
  { user_id, mail_id }, // payload
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' }
);

// Helper function to verify token, throws if invalid
//const verifyToken = (token) => {
  //return verify(token, process.env.JWT_SECRET);
//};

async function get_user_data(req, res, next) // function will return employee id and employee type from the give token
{
    try
    {
        let auth_header= req.headers['Authorization'] || req.headers['authorization'] 
        //console.log(auth_header);
        let token = auth_header && auth_header.split(' ')[1]
        //console.log(token);
        let token_verified= jwt.verify(token, process.env.JWT_SECRET)
        //console.log('verified',token_verified);
        let forward= {
            user_id:token_verified.user_id || null,
        }
        req.forwardedVariables= forward
        next()
    }catch(error){console.log(error); return null}
}

// Register route (unchanged)
app.post('/api/register', async (req, res) => {
  let { username, password, mail_id } = req.body;
  logger.info(`Register attempt for username, mail address: ${req.body.username, req.body.mail_id}`);

  try {
    const existingUser = await db.getUserByMail(mail_id);
    if (existingUser) {
      logger.warn(`Registration attempt failed: mail id "${mail_id}" already exists`);
      return sendError(res, 400, errorMessages.user_exists);
    }

    let user_id= await generator.id_generator(process.env.USER_IDS, 6)// generating unique user id
    const hash = await bcrypt.hash(password, 10);
    await db.registerUser(username, hash, user_id, mail_id);
    res.json({ success: true, message: 'User registered successfully!' });
  } catch (err) {
    logger.error(`Register error for the mailid: ${mail_id}, ${err.message}`);
    sendError(res, 500, errorMessages.registration_failed, err.message);
  }
});

// Login - returns access + refresh tokens
app.post('/api/login', async (req, res) => {
  const { mail_id, password } = req.body;
  try {
    const user = await db.getUserByMail(mail_id);
    //console.log(user);
    if (!user) return sendError(res, 404, errorMessages.not_found);

    const match = await bcrypt.compare(password, user[0].password);
    //console.log('match', match);
    if (!match) return sendError(res, 403, errorMessages.wrong_credentials);

    const accessToken = createAccessToken(user[0].user_id, user[0].mail_id);
    // Store refresh token in Redis
    const refreshToken = createRefreshToken(user[0].user_id, user[0].mail_id);

    // Store refresh token in Redis
    await redis.set(`refresh:${user[0].user_id}`, refreshToken, {
      EX: 7 * 24 * 60 * 60 // 7 days
    });

    res.json({ success: true, accessToken, refreshToken });
  } catch (err) {
    sendError(res, 500, errorMessages.login_failed, err.message);
  }
});

// Refresh token route
app.post('/api/refresh-token', async (req, res) => {
  logger.info('Token refresh attempt');
  const refreshToken = req.headers.authorization?.split(' ')[1];
  if (!refreshToken) return sendError(res, 400, errorMessages.token_missing);

  // Check if refresh token is blacklisted
  const blacklisted = await redis.get(`bl_${refreshToken}`);
  if (blacklisted) {
    logger.warn(`Blocked refresh token used: ${refreshToken}`);
    return sendError(res, 401, errorMessages.token_blacklisted);
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user_id = decoded.user_id;

    const newAccessToken = createAccessToken(user_id);
    logger.info(`Access token refreshed successfully for user ID: ${user_id}`);
    res.status(200).json({ newAccessToken: newAccessToken });
  } catch (err) {
    logger.warn('Invalid or expired token encountered during token verification');
    return sendError(res, 403, errorMessages.token_invalid);
  }
});

app.post('/api/logout', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    logger.warn(`Logout attempt failed: token missing from headers - IP: ${req.ip}`);
    return sendError(res, 400, errorResponses.token_missing);
  }

  try {
    // Delete stored refresh token if you keep it keyed by user id
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user_id = decoded.user_id;

    logger.info(`Logout request for user ID: ${user_id}`);
    const delResult = await redis.del(`refresh:${user_id}`);
    logger.info(`Refresh token deletion for user ID: ${user_id} - Success: ${delResult === 1}`);

    // Blacklist access token for 15 minutes (or desired expiry)
    await redis.set(`bl_${token}`, 'true', { EX: 15 * 60 });
    logger.info(`Access token blacklisted for user ID: ${user_id}`);

    logger.info(`Logout successful for user ID: ${user_id}`);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    logger.warn(`Invalid token - Reason: ${err.message}`);
    return sendError(res, 401, errorResponses.token_invalid);
  }
});

// Protected route (unchanged)
app.get('/api/protected', authMiddleware, (req, res) => {
  res.json({ success: true, message: 'Access granted'});
});


// Get current user's profile
app.get('/api/profile', authMiddleware,get_user_data, async (req, res) => {
  logger.info(`Profile request for mail ID: ${req.forwardedVariables.mail_id}`);
  //let mail_id= req.forwardedVariables.mail_id 
  //console.log(req.forwardedVariables);
  //console.log(mail_id);
  try {
    const user = await db.getUserByMail(req.user.mail_id);
    //console.log(user);
    if (!user) return sendError(res, 404, errorMessages.not_found);
    delete user[0].password;
    res.status(200).json(user);
  } catch (err) {
    logger.error(`Profile retrieval error for mail ID: ${req.forwardedVariables.mail_id}, ${err.message}`);
    sendError(res, 500, errorMessages.server_error, err.message);
  }
});

// Delete user account
app.delete('/api/user/delete', authMiddleware, async (req, res) => {
  let { user_id } = req.body;
  if (!user_id) {
    logger.warn(`Delete request failed: user ID missing - IP: ${req.ip}`);
    return sendError(res, 400, errorMessages.missing_fields);
  }
    const response = await db.deleteUser(user_id);

    if (response == true) {
      logger.warn(`User deleted successfully: ${user_id}`);
      await redis.del(`refresh:${user_id}`);
      await redis.del(`bl_${user_id}`);
      logger.info(`Refresh token deleted for user ID: ${user_id}`);
      logger.info(`Access token blacklisted for user ID: ${user_id}`);
      res.status(200).json({ message: 'User deleted successfully' });
    }
    else if (response == false) {
      logger.warn(`User deletion failed: ${user_id}`);
      return sendError(res, 404, errorMessages.not_found);
    }
    else {
      logger.error(`User deletion error: ${user_id}`);
      return sendError(res, 500, errorMessages.server_error);
    }
});


app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.status(200).json(users);
  } catch (err) {
    logger.error(`Error retrieving users: ${err.message}`);
    sendError(res, 500, errorMessages.server_error, err.message);
  }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));