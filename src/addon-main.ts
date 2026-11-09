#!/usr/bin/env node
import { BridgeInstaller, supervisorHostname } from './bridge-installer.js';
import { readFile, mkdir, chown } from 'node:fs/promises';
import { SecretUrlStore } from './secret-url.js';
import { startHttp } from './http-main.js';
import { loadAddonToken } from './addon-token.js';
import { createIngressApp } from './addon-ui.js';
import { addonEnvironment } from './addon-options.js';

try {
  let options: unknown;
  try {
    options = JSON.parse(await readFile('/data/options.json', 'utf8'));
  } catch {
    throw new Error('Cannot read Home Assistant configuration at /data/options.json.');
  }
  const env = addonEnvironment(options);
  env.SKYWARD_HTTP_TOKEN = await loadAddonToken('/data', env.SKYWARD_HTTP_TOKEN);
  Object.assign(process.env, env);
  const secretDirectory = '/data/connection';
  await mkdir(secretDirectory, { recursive: true, mode: 0o700 });
  if (process.getuid?.() === 0) await chown(secretDirectory, 1000, 1000);
  let bridge: BridgeInstaller | undefined;
  try {
    bridge = new BridgeInstaller('/homeassistant/custom_components/skyward_mcp', '/app/bridge/skyward_mcp', supervisorHostname);
    await bridge.prepare();
  } catch {
    bridge = undefined;
    console.error('Bundled bridge unavailable. Check the HA configuration mount and existing custom integration.');
  }
  // Supervisor writes root-owned options. Read them once, then drop privileges
  // before starting HTTP or launching Chromium. Only our managed bridge directory is writable by this user.
  if (process.platform === 'linux' && process.getuid?.() === 0) {
    process.setgroups!([]);
    process.setgid!(1000);
    process.setuid!(1000);
  }
  process.env.HOME = '/home/node';
  const secrets = new SecretUrlStore(secretDirectory);
  await secrets.load();
  await startHttp(secrets.current);
  if (bridge && await bridge.installed()) {
    try { await bridge.install(); } catch { console.error('Could not update the bundled bridge; use Enable Nabu Casa access to retry.'); }
  }
  const ui = createIngressApp(env.SKYWARD_HTTP_TOKEN, secrets, bridge);
  await new Promise<void>((resolve, reject) => {
    ui.once('error', reject);
    ui.listen(8099, '0.0.0.0', resolve);
  });
  const closeUi = () => { ui.close(); ui.closeAllConnections(); };
  process.once('SIGTERM', closeUi);
  process.once('SIGINT', closeUi);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not start Skyward add-on.');
  process.exit(1);
}
