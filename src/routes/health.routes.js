const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

router.get('/', (request, response) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  response.status(databaseConnected ? 200 : 503).json({
    success: databaseConnected,
    data: {
      service: 'veridex-finance-api',
      status: databaseConnected ? 'ok' : 'degraded',
      database: databaseConnected ? 'connected' : 'disconnected'
    },
    meta: { requestId: request.id }
  });
});

module.exports = router;
