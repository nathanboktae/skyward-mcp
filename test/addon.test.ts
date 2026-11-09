import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { addonEnvironment } from '../src/addon-options.js';
import { readConfig } from '../src/config.js';
import { readHttpConfig } from '../src/http.js';

const options = {
  skyward_url: 'https://example.org/district/', username: 'parent',
  password: 'example#password"with spaces', mcp_token: 'example-token-that-is-at-least-32-characters',
  timezone: 'America/Los_Angeles', timeout_ms: 60000,
};

test('HA options feed the existing browser and HTTP configuration without shell escaping', () => {
  const env = addonEnvironment(options);
  const config = readConfig(env);
  assert.equal(config.password, options.password);
  assert.equal(config.browser, 'chromium');
  assert.equal(config.timeout, 60000);
  assert.equal(readHttpConfig(env).host, '0.0.0.0');
  assert.equal(readHttpConfig(env).token, options.mcp_token);
  assert.equal(readConfig({ ...env, SKYWARD_BROWSER: 'chrome' }).browser, 'chrome');
  assert.throws(() => readConfig({ ...env, SKYWARD_BROWSER: 'invalid' }));
});

test('invalid HA secrets fail with field names, never secret values', () => {
  for (const invalid of [{ ...options, mcp_token: 'short-secret' }, { ...options, password: '' }, { ...options, timeout_ms: 1 }]) {
    assert.throws(() => addonEnvironment(invalid), error => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(options.password));
      assert.ok(!error.message.includes('short-secret'));
      return true;
    });
  }
  assert.throws(() => addonEnvironment(null));
});

test('add-on metadata, version, image, and options stay consistent', () => {
  const manifest = parse(readFileSync('skyward/config.yaml', 'utf8'));
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const repository = parse(readFileSync('repository.yaml', 'utf8'));
  assert.equal(manifest.version, pkg.version);
  assert.deepEqual(manifest.arch, ['aarch64']);
  assert.equal(manifest.image, 'ghcr.io/nathanboktae/skyward-mcp');
  assert.equal(repository.url, 'https://github.com/nathanboktae/skyward-mcp');
  assert.equal(manifest.watchdog, 'http://[HOST]:[PORT:3000]/healthz');
  assert.equal(manifest.init, true);
  assert.equal(manifest.ingress, true);
  assert.equal(manifest.ingress_port, 8099);
  assert.equal(manifest.panel_admin, true);
  assert.equal(manifest.ports['8099/tcp'], undefined);
  assert.equal(manifest.options.mcp_token, undefined);
  assert.equal(manifest.privileged, undefined);
  assert.equal(manifest.host_network, undefined);
  assert.equal(manifest.hassio_api, true);
  assert.equal(manifest.hassio_role, 'default');
  assert.deepEqual(Object.keys(manifest.schema).sort(), Object.keys(options).sort());
  assert.doesNotThrow(() => addonEnvironment({ ...manifest.options, ...options }));
  const translations = parse(readFileSync('skyward/translations/en.yaml', 'utf8'));
  for (const key of Object.keys(manifest.schema)) assert.ok(translations.configuration[key]);
});

test('automatic token persists, is private, and preserves explicit overrides', async () => {
  const { mkdtemp, rm, stat, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { loadAddonToken } = await import('../src/addon-token.js');
  const dir = await mkdtemp(join(tmpdir(), 'skyward-token-'));
  try {
    assert.equal(addonEnvironment({ ...options, mcp_token: null }).SKYWARD_HTTP_TOKEN, undefined);
    const first = await loadAddonToken(dir);
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.equal(await loadAddonToken(dir), first);
    assert.equal((await stat(join(dir, 'mcp-token'))).mode & 0o777, 0o600);
    assert.equal(await loadAddonToken(dir, options.mcp_token), options.mcp_token);
    await writeFile(join(dir, 'mcp-token'), 'corrupt');
    await assert.rejects(loadAddonToken(dir), /Stored MCP access token is invalid/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('ingress denies forged headers and serves secrets only to the Supervisor peer', async () => {
  const { handleIngress, isIngressPeer } = await import('../src/addon-ui.js');
  assert.ok(isIngressPeer('::ffff:172.30.32.2'));
  for (const peer of ['127.0.0.1', '172.30.32.3', undefined, '172.30.32.2']) {
    let status = 0; let body = ''; const headers: Record<string, string> = {};
    const response = { setHeader: (k: string, v: string) => { headers[k] = v; }, writeHead: (s: number) => { status = s; }, end: (s: string) => { body = s; } };
    await handleIngress({ socket: { remoteAddress: peer }, method: 'GET', url: '/', headers: { 'x-forwarded-for': '172.30.32.2' } } as any, response as any, options.mcp_token);
    assert.equal(status, peer === '172.30.32.2' ? 200 : 403);
    assert.equal(body.includes(options.mcp_token), peer === '172.30.32.2');
    assert.equal(headers['Cache-Control'], 'no-store');
  }
});

test('connection page renders, edits endpoint, and copies settings with manual fallback', async () => {
  const { chromium } = await import('playwright');
  const { connectionPage } = await import('../src/addon-ui.js');
  const browser = await chromium.launch({ channel: process.env.SKYWARD_BROWSER === 'chromium' ? undefined : 'chrome' });
  try {
    const page = await browser.newPage();
    await page.route('http://homeassistant.local:8123/**', route => route.fulfill({ contentType: 'text/html', body: connectionPage(options.mcp_token, 'test-nonce', null, 'test-csrf', true) }));
    let urlSecret: string | null = null;
    await page.route('**/secret/*', route => {
      urlSecret = route.request().url().endsWith('/disable') ? null : 'c'.repeat(64);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: urlSecret }) });
    });
    await page.route('**/bridge/install', route => route.fulfill({ status: 200, body: 'Installed.' }));
    await page.goto('http://homeassistant.local:8123/api/hassio_ingress/test/');
    await page.getByRole('button', { name: 'Enable Nabu Casa access' }).click();
    await page.getByText('Bridge installed.', { exact: false }).waitFor();
    const endpoint = page.getByLabel('MCP server URL');
    assert.equal(await endpoint.inputValue(), '');
    await endpoint.fill('https://mcp.example.org/mcp');
    await page.reload();
    assert.equal(await endpoint.inputValue(), 'https://mcp.example.org/mcp');
    const settings = JSON.parse(await page.getByLabel('Connection settings').inputValue());
    assert.equal(settings.mcpServers.skyward.url, 'https://mcp.example.org/mcp');
    assert.equal(settings.mcpServers.skyward.headers.Authorization, `Bearer ${options.mcp_token}`);
    await page.evaluate("Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.copied = value; } } })");
    await page.getByRole('button', { name: 'Copy connection settings' }).click();
    assert.equal(await page.evaluate(() => (window as any).copied), JSON.stringify(settings, null, 2));
    await page.getByRole('button', { name: 'Enable secret URL', exact: true }).click();
    await page.getByRole('button', { name: 'Rotate secret URL', exact: true }).waitFor();
    assert.equal(await page.locator('#secret').inputValue(), 'https://mcp.example.org/mcp/' + 'c'.repeat(64));
    await page.getByRole('button', { name: 'Copy secret URL', exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).copied), 'https://mcp.example.org/mcp/' + 'c'.repeat(64));
    await endpoint.fill('http://lan.example:3000/mcp');
    assert.equal(await page.locator('#secret').inputValue(), 'http://lan.example:3000/mcp/' + 'c'.repeat(64));
    await endpoint.fill('');
    assert.equal(await page.locator('#secret').inputValue(), '/mcp/' + 'c'.repeat(64));
    assert.ok(await page.getByRole('button', { name: 'Copy secret path', exact: true }).isEnabled());
    await page.getByRole('button', { name: 'Disable secret URL', exact: true }).click();
    await page.getByRole('button', { name: 'Enable secret URL', exact: true }).waitFor();
    assert.equal(await page.locator('#secret').inputValue(), '');

    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
    await page.getByRole('button', { name: 'Copy connection settings' }).click();
    assert.match(await page.locator('#status').innerText(), /Settings selected/);
    await page.getByRole('button', { name: 'Use this Home Assistant address' }).click();
    assert.equal(await endpoint.inputValue(), 'http://homeassistant.local:8123/api/skyward_mcp/mcp');
  } finally { await browser.close(); }
});

test('secret URL changes require ingress and CSRF, persist and can be revoked', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { SecretUrlStore } = await import('../src/secret-url.js');
  const { handleIngress } = await import('../src/addon-ui.js');
  const dir = await mkdtemp(join(tmpdir(), 'skyward-url-'));
  try {
    const store = new SecretUrlStore(dir); await store.load();
    const initial = store.current(); assert.match(initial!, /^[a-f0-9]{64}$/);
    const boot = new SecretUrlStore(dir); await boot.load(); assert.equal(boot.current(), initial);
    let status = 0;
    const res = { setHeader() {}, writeHead(s: number) { status = s; }, end() {} };
    for (const [peer, csrf] of [['127.0.0.1', 'valid'], ['172.30.32.2', 'wrong']]) {
      await handleIngress({ socket: { remoteAddress: peer }, method: 'POST', url: '/secret/rotate', headers: { 'x-skyward-csrf': csrf } } as any, res as any, options.mcp_token, store, 'valid');
      assert.equal(status, 403); assert.equal(store.current(), initial);
    }
    await handleIngress({ socket: { remoteAddress: '172.30.32.2' }, method: 'POST', url: '/secret/rotate', headers: { 'x-skyward-csrf': 'valid' } } as any, res as any, options.mcp_token, store, 'valid');
    assert.equal(status, 200);
    const first = store.current(); assert.match(first!, /^[a-f0-9]{64}$/);
    const restored = new SecretUrlStore(dir); await restored.load(); assert.equal(restored.current(), first);
    await store.change('rotate'); assert.notEqual(store.current(), first);
    await store.change('disable'); await restored.load(); assert.equal(restored.current(), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
