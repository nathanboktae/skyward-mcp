import { randomBytes } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export class SecretUrlStore {
  private token: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private directory: string) {}
  current = () => this.token;
  async load() {
    try {
      const value = JSON.parse(await readFile(join(this.directory, 'secret-url.json'), 'utf8'));
      if (value !== null && (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) throw new Error();
      this.token = value;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Cannot read secret URL configuration.');
      await this.change('rotate');
    }
  }
  change(action: 'rotate' | 'disable'): Promise<void> {
    const operation = this.queue.then(async () => {
      const next = action === 'rotate' ? randomBytes(32).toString('hex') : null;
      const temporary = join(this.directory, 'secret-url.tmp');
      await writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
      await rename(temporary, join(this.directory, 'secret-url.json'));
      this.token = next;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
