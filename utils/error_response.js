const errorResponses = {
  not_found: 'Resource not found',
  wrong_credentials: 'Wrong username or password',
  user_exists: 'User already exists',
  registration_failed: 'User registration failed',
  login_failed: 'User login failed',
  token_missing: 'Token is missing',
  token_invalid: 'Invalid or expired token',
  token_blacklisted: 'Token is blacklisted',
  db_error: 'Database error occurred',
  server_error: 'Internal server error',
  missing_fields: 'Required fields are missing'
};

export default errorResponses;