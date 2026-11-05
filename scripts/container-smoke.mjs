import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

assert.equal(process.arch, 'arm64');
assert.equal(process.getuid(), 1000);
// Also verify that the real HA entrypoint dropped its privileges after reading options.
let serviceFound = false;
for (const pid of await readdir('/proc')) {
  if (!/^\d+$/.test(pid)) continue;
  const command = await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '');
  const args = command.split('\0');
  if (!/(^|\/)node$/.test(args[0]) || args[1] !== 'dist/addon-main.js') continue;
  const status = await readFile(`/proc/${pid}/status`, 'utf8');
  assert.match(status, /Uid:\s+1000\s+1000\s+1000\s+1000/);
  serviceFound = true;
}
assert.ok(serviceFound, 'Add-on process is running');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<h1>ARM64 browser ready</h1>');
  assert.equal(await page.locator('h1').innerText(), 'ARM64 browser ready');
} finally { await browser.close(); }
assert.equal((await fetch('http://127.0.0.1:3000/healthz')).status, 200);
assert.equal((await fetch('http://127.0.0.1:3000/mcp', { method: 'POST' })).status, 401);
const client = new Client({ name: 'container-smoke', version: '1' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3000/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${process.env.SMOKE_TOKEN}` } },
  }));
  assert.equal((await client.listTools()).tools.length, 3);
} finally { await client.close(); }
console.log('ARM64 Chromium, non-root HA entrypoint, health check, authentication, and MCP discovery passed.');
