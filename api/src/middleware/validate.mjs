import { validationError } from '../errors/AppError.mjs';

const toDetails = (zodError, part) =>
  zodError.issues.map((issue) => ({ field: issue.path.join('.') || part, message: issue.message }));

// Usage: validate({ params: idParamsSchema, body: createEventSchema }).
// Parts are checked in the order given and the first invalid part is reported, as before the refactoring.
// The parsed (trimmed, coerced) values end up in req.validated, so controllers never touch raw input.
export const validate = (schemas) => (req, res, next) => {
  req.validated = {};
  for (const [part, schema] of Object.entries(schemas)) {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      return next(validationError(toDetails(result.error, part)));
    }
    req.validated[part] = result.data;
  }
  next();
};
