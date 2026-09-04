function notFoundHandler(request, response) {
  response.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${request.method} ${request.originalUrl} not found`
    },
    meta: { requestId: request.id }
  });
}

function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error);

  const statusCode = error.statusCode || 500;
  response.status(statusCode).json({
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: statusCode === 500 ? 'Internal server error' : error.message
    },
    meta: { requestId: request.id }
  });
}

module.exports = { notFoundHandler, errorHandler };
