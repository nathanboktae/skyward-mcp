import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BridgeInstaller } from '../src/bridge-installer.js';
import { handleIngress } from '../src/addon-ui.js';

test('bridge installs and updates only its managed directory with fixed backend metadata', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skyward-bridge-'));
  try {
    const target = join(dir, 'custom_components', 'skyward_mcp');
    const installer = new BridgeInstaller(target, resolve('bridge/skyward_mcp'), async () => 'example-skyward-mcp');
    await installer.prepare(); assert.equal(await installer.installed(), false);
    await installer.install();
    assert.equal(await installer.installed(), true);
    assert.deepEqual(JSON.parse(await readFile(join(target, 'connection.json'), 'utf8')), { hostname: 'example-skyward-mcp' });
    assert.equal(JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8')).version, '0.6.0');
    await installer.install();
    const bad = new BridgeInstaller(target, resolve('bridge/skyward_mcp'), async () => 'evil.example/path');
    await assert.rejects(bad.install());
    const other = join(dir, 'custom_components', 'other'); await mkdir(other); await writeFile(join(other, '__init__.py'), 'user code');
    await assert.rejects(new BridgeInstaller(other, resolve('bridge/skyward_mcp'), async () => 'host').prepare());
    assert.equal(await readFile(join(other, '__init__.py'), 'utf8'), 'user code');
    await symlink(other, join(dir, 'custom_components', 'linked'));
    await assert.rejects(new BridgeInstaller(join(dir, 'custom_components', 'linked'), '', async () => 'host').prepare());
    let calls = 0; let status = 0;
    const fake = { install: async () => { calls++; } } as unknown as BridgeInstaller;
    const response = { setHeader() {}, writeHead(s: number) { status = s; }, end() {} };
    for (const [peer, csrf] of [['127.0.0.1', 'valid'], ['172.30.32.2', 'wrong'], ['172.30.32.2', 'valid']]) {
      await handleIngress({ socket: { remoteAddress: peer }, method: 'POST', url: '/bridge/install', headers: { 'x-skyward-csrf': csrf } } as any, response as any, 'token', undefined, 'valid', fake);
      assert.equal(status, peer === '172.30.32.2' && csrf === 'valid' ? 200 : 403);
    }
    assert.equal(calls, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
