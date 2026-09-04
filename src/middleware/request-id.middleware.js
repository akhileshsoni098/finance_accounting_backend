const crypto = require('node:crypto');

function requestIdMiddleware(request, response, next) {
  const requestId = request.get('x-request-id') || crypto.randomUUID();
  request.id = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}

module.exports = requestIdMiddleware;
