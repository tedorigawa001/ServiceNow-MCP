// Synthetic loopback-only regression: no ServiceNow requests or credentials.
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHttpServer } from '../../src/server-http.ts';

const server = createHttpServer({
  host: '127.0.0.1', port: 0, path: '/mcp', corsOrigin: '*',
  authToken: 'synthetic-test-only', maxBodyBytes: 1024, maxSessions: 1, sessionIdleTimeoutMs: 1000,
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const request = (path, host) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path, method: 'GET', headers: { Host: host } }, res => {
    res.resume();
    res.on('end', () => resolve(res.statusCode));
  });
  req.on('error', reject);
  req.end();
});
try {
  for (const host of ['[', '%', 'example.com:bad']) {
    assert.equal(await request('/mcp', host), 400);
    assert.equal(await request('/health', 'localhost'), 200);
    assert.equal(await request('/mcp', 'localhost'), 401);
  }
  console.log('host-survival-ok');
} finally {
  await new Promise(resolve => server.close(resolve));
}
