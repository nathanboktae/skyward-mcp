import { randomBytes } from 'node:crypto';
import { mkdir, lstat, readFile, writeFile, rename, chown } from 'node:fs/promises';
import { join } from 'node:path';
const marker = '.skyward-app-managed';
const files = ['__init__.py', 'proxy.py', 'config_flow.py', 'manifest.json', 'strings.json', 'translations/en.json'];

export class BridgeInstaller {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private target: string, private source: string, private hostname: () => Promise<string>) {}
  async prepare() {
    // Called before dropping root. Never take ownership of an existing integration.
    const parent = join(this.target, '..');
    await mkdir(parent, { recursive: true });
    if ((await lstat(parent)).isSymbolicLink()) throw new Error('Custom components directory must not be a symlink.');
    try { await mkdir(this.target); await writeFile(join(this.target, marker), 'Skyward MCP app\n'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
    if ((await lstat(this.target)).isSymbolicLink() || await readFile(join(this.target, marker), 'utf8') !== 'Skyward MCP app\n') throw new Error('An unmanaged Skyward integration already exists.');
    if (process.getuid?.() === 0) await chown(this.target, 1000, 1000);
  }
  async installed() {
    try { await readFile(join(this.target, 'manifest.json')); return true; } catch { return false; }
  }
  install(): Promise<void> {
    const job = this.queue.then(async () => {
      const hostname = await this.hostname();
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(hostname)) throw new Error('Invalid app hostname.');
      for (const file of [...files.filter(f => f !== 'manifest.json'), 'connection.json', 'manifest.json']) {
        const data = file === 'connection.json' ? JSON.stringify({ hostname }) : await readFile(join(this.source, file));
        const destination = join(this.target, file);
        await mkdir(join(destination, '..'), { recursive: true });
        if ((await lstat(join(destination, '..'))).isSymbolicLink()) throw new Error('Bridge subdirectory must not be a symlink.');
        const temporary = destination + '.' + randomBytes(8).toString('hex') + '.tmp';
        await writeFile(temporary, data, { mode: 0o644, flag: 'wx' });
        await rename(temporary, destination);
      }
    });
    this.queue = job.catch(() => {});
    return job;
  }
}

export async function supervisorHostname(): Promise<string> {
  const response = await fetch('http://supervisor/addons/self/info', { headers: { Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}` }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Cannot read app hostname from Supervisor.');
  const result = await response.json() as { data?: { hostname?: string } };
  if (!result.data?.hostname) throw new Error('Supervisor did not return an app hostname.');
  return result.data.hostname;
}
