const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

function request(app, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const address = server.address();
      fetch(`http://127.0.0.1:${address.port}${path}`)
        .then(async (response) => ({ status: response.status, body: await response.json() }))
        .then(resolve)
        .catch(reject)
        .finally(() => server.close());
    });
  });
}

test('health endpoint reports database readiness and request id', async () => {
  const result = await request(createApp(), '/api/v1/health');

  assert.equal(result.status, 503);
  assert.equal(result.body.success, false);
  assert.equal(result.body.data.status, 'degraded');
  assert.equal(typeof result.body.meta.requestId, 'string');
});
