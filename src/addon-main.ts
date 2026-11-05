#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { addonEnvironment } from './addon-options.js';

try {
  let options: unknown;
  try {
    options = JSON.parse(await readFile('/data/options.json', 'utf8'));
  } catch {
    throw new Error('Cannot read Home Assistant configuration at /data/options.json.');
  }
  Object.assign(process.env, addonEnvironment(options));
  // Supervisor writes root-owned options. Read them once, then drop privileges
  // before starting HTTP or launching Chromium. No host directories are mounted.
  if (process.platform === 'linux' && process.getuid?.() === 0) {
    process.setgroups!([]);
    process.setgid!(1000);
    process.setuid!(1000);
  }
  process.env.HOME = '/home/node';
  await import('./http-main.js');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not start Skyward add-on.');
  process.exitCode = 1;
}
