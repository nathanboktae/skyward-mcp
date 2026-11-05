import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';

export interface Config { baseUrl: string; username: string; password: string; timeout: number; timezone: string }
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = (key: string) => { const v = env[key]; if (!v) throw new Error(`Missing ${key}. Configure your private .env file.`); return v; };
  let url: URL;
  try { url = new URL(required('SKYWARD_BASE_URL')); } catch { throw new Error('SKYWARD_BASE_URL must be an HTTPS district root URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !/^\/[\w-]+\/?$/.test(url.pathname)) {
    throw new Error('Use an HTTPS district root, e.g. https://www.q.wa-k12.net/lkwash/, without session parameters.');
  }
  url.pathname = url.pathname.replace(/\/?$/, '/');
  const timeout = Number(env.SKYWARD_TIMEOUT_MS ?? 45000);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 180000) throw new Error('SKYWARD_TIMEOUT_MS must be 1000–180000.');
  const timezone = env.SKYWARD_TIMEZONE || 'America/Los_Angeles';
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { throw new Error('Invalid SKYWARD_TIMEZONE.'); }
  return {baseUrl:url.href, username:required('SKYWARD_USERNAME'), password:required('SKYWARD_PASSWORD'), timeout, timezone};
}
export function loadConfig(): Config {
  const result = dotenv({path:process.env.SKYWARD_ENV_FILE || fileURLToPath(new URL('../.env', import.meta.url)), quiet:true});
  if (process.env.SKYWARD_ENV_FILE && result.error) throw new Error('Cannot read SKYWARD_ENV_FILE.');
  return readConfig();
}
