import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Run a Zod schema over one part of the request, replacing it with parsed data. */
export function validate(schema, part = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      return next(new ApiError(422, 'Validation failed', fieldErrors(result.error)));
    }
    req[part === 'query' ? 'valid' : part] = result.data;
    if (part === 'query') req.validQuery = result.data;
    next();
  };
}

function fieldErrors(error) {
  return error.issues.map((i) => ({
    field: i.path.join('.') || '(root)',
    message: i.message,
  }));
}

export function notFound(_req, _res, next) {
  next(new ApiError(404, 'Endpoint not found'));
}

// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(422).json({ error: 'Validation failed', details: fieldErrors(err) });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
}
