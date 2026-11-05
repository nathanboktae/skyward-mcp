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
  assert.equal(manifest.privileged, undefined);
  assert.equal(manifest.host_network, undefined);
  assert.equal(manifest.hassio_api, undefined);
  assert.deepEqual(Object.keys(manifest.schema).sort(), Object.keys(options).sort());
  assert.doesNotThrow(() => addonEnvironment({ ...manifest.options, ...options }));
  const translations = parse(readFileSync('skyward/translations/en.yaml', 'utf8'));
  for (const key of Object.keys(manifest.schema)) assert.ok(translations.configuration[key]);
});
