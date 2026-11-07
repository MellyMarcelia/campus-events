// Errors the API expects (bad input, unknown id, conflicts). Services throw these without knowing
// anything about HTTP responses; the error handler turns them into `{ error: { code, message, details } }`.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const validationError = (details) => new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details);
export const notFound = (message) => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message) => new AppError(409, 'CONFLICT', message);

export const eventNotFound = (id) => notFound(`Event with id ${id} not found`);
