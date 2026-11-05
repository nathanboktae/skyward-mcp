import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHttpApp, readHttpConfig } from '../src/http.js';
import type { SkywardClient } from '../src/client.js';

const fake = { listStudents: async () => ({ students: [{ studentId: '1', name: 'Example Student' }] }) } as unknown as SkywardClient;
const token = 'test-token-with-at-least-32-characters';
async function start(auth?: string, secretToken?: () => string | null) {
  const app = createHttpApp(fake, { host: '127.0.0.1', port: 0, token: auth, secretToken });
  await new Promise<void>(resolve => app.listen(0, '127.0.0.1', resolve));
  const address = app.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  return { app, base, close: async () => { app.closeAllConnections(); await new Promise<void>((resolve, reject) => app.close(e => e ? reject(e) : resolve())); } };
}

test('HTTP MCP handshake, discovery, and tool invocation with bearer authentication', async () => {
  const service = await start(token);
  const client = new Client({ name: 'http-test', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${service.base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    assert.equal((await client.listTools()).tools.length, 3);
    const result = await client.callTool({ name: 'list_students', arguments: {} });
    assert.deepEqual(result.structuredContent, { students: [{ studentId: '1', name: 'Example Student' }] });
    assert.equal((await fetch(`${service.base}/healthz`)).status, 200);
    assert.equal((await fetch(`${service.base}/mcp`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${service.base}/mcp`, { method: 'POST', headers: { Authorization: 'Bearer incorrect' } })).status, 401);
    assert.equal((await fetch(`${service.base}/mcp`, { headers: { Authorization: `Bearer ${token}` } })).status, 405);
    assert.equal((await fetch(`${service.base}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{invalid' })).status, 400);
  } finally { await client.close(); await service.close(); }
});

test('loopback server rejects DNS rebinding and browser origins', async () => {
  const service = await start();
  try {
    const status = await new Promise<number | undefined>((resolve, reject) => {
      get(`${service.base}/healthz`, { headers: { Host: 'attacker.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.equal(status, 403);
    assert.equal((await fetch(`${service.base}/mcp`, { method: 'POST', headers: { Origin: 'https://attacker.example' } })).status, 403);
    assert.equal((await fetch(`${service.base}/missing`)).status, 404);
  } finally { await service.close(); }
});

test('remote HTTP listener requires a token and valid configuration', () => {
  assert.equal(readHttpConfig({}).host, '127.0.0.1');
  assert.throws(() => readHttpConfig({ SKYWARD_HTTP_HOST: '0.0.0.0' }));
  assert.throws(() => readHttpConfig({ SKYWARD_HTTP_TOKEN: 'short' }));
  assert.throws(() => readHttpConfig({ SKYWARD_HTTP_PORT: 'invalid' }));
  assert.equal(readHttpConfig({ SKYWARD_HTTP_HOST: '0.0.0.0', SKYWARD_HTTP_TOKEN: token }).host, '0.0.0.0');
});


test('secret URL supports MCP without headers, rejects old URLs, and leaves bearer access intact', async () => {
  let secret: string | null = 'a'.repeat(64);
  const service = await start(token, () => secret);
  const client = new Client({ name: 'secret-test', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${service.base}/mcp/${secret}`)));
    assert.equal((await client.listTools()).tools.length, 3);
    const old = secret;
    secret = 'b'.repeat(64);
    assert.equal((await fetch(`${service.base}/mcp/${old}`, { method: 'POST' })).status, 404);
    assert.equal((await fetch(`${service.base}/mcp/${secret}`)).status, 405);
    assert.equal((await fetch(`${service.base}/mcp/${secret}?extra=1`)).status, 404);
    assert.equal((await fetch(`${service.base}/mcp/${secret}`, { headers: { Origin: 'https://evil.example' } })).status, 403);
    secret = null;
    assert.equal((await fetch(`${service.base}/mcp/${'b'.repeat(64)}`)).status, 404);
    assert.equal((await fetch(`${service.base}/mcp`, { headers: { Authorization: `Bearer ${token}` } })).status, 405);
  } finally { await client.close(); await service.close(); }
});
