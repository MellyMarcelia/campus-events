import { AppError, notFound } from '../errors/AppError.mjs';
import { logger } from '../lib/logger.mjs';

export const notFoundHandler = (req, res, next) => {
  next(notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

const toBody = (code, message, details) => ({ error: { code, message, ...(details && { details }) } });

// Express recognises an error handler by its FOUR parameters.
export const errorHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json(toBody(err.code, err.message, err.details));
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(toBody('INVALID_JSON', 'Request body is not valid JSON'));
  }
  // Anything else is a bug: log the details, but never leak them to the client.
  logger.error(err.message, { stack: err.stack });
  res.status(500).json(toBody('INTERNAL_ERROR', 'Something went wrong'));
};
