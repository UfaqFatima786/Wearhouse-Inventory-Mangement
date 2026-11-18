export function notFound(req, _res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.status = 404;
  next(error);
}

export function errorHandler(error, _req, res, _next) {
  const status = error.status ||
    (error.name === 'ValidationError' || error.name === 'CastError' ? 400 :
      error.code === 11000 ? 409 : 500);
  if (status >= 500) console.error(error);
  const message = error.code === 11000
    ? 'A record with one of these values already exists.'
    : error.message;
  res.status(status).json({
    message: status >= 500 ? 'Unexpected server error.' : message,
    ...(error.details ? { details: error.details } : {})
  });
}
