export function sendError(res, statusCode, message, details = null) {
  res.status(statusCode).json({
    success: false,
    message,
    ...(details && { details }),
  });
}