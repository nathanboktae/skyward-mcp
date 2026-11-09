import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext } from 'playwright';
import type { Config } from './config.js';
import { SkywardError } from './domain.js';

type State = Awaited<ReturnType<BrowserContext['storageState']>>;

/** Persist cookies and origin storage without mixing accounts or districts. */
export class BrowserStateStore {
  private directory: string;
  private path: string;
  constructor(config: Pick<Config, 'baseUrl' | 'username' | 'stateDirectory'>) {
    this.directory = config.stateDirectory || fileURLToPath(new URL('../.skyward-state/', import.meta.url));
    const key = createHash('sha256').update(JSON.stringify([config.baseUrl, config.username])).digest('hex');
    this.path = join(this.directory, `${key}.json`);
  }
  async load(): Promise<State | undefined> {
    try {
      const state = JSON.parse(await readFile(this.path, 'utf8')) as State;
      if (!Array.isArray(state.cookies) || !Array.isArray(state.origins)) throw new Error('Invalid state');
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw new SkywardError('Cannot read saved Skyward browser state. Check the state directory permissions or restore it from backup.');
    }
  }
  async save(context: BrowserContext): Promise<void> {
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const state = await context.storageState({ indexedDB: true });
      await writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
      await rename(temporary, this.path);
    } catch {
      throw new SkywardError('Cannot persist Skyward browser state. Check that the state directory is writable.');
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
