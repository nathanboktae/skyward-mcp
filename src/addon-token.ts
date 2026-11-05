import { randomBytes } from 'node:crypto';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';

export async function loadAddonToken(directory: string, configured?: string): Promise<string> {
  // Preserve manually configured tokens on upgrade. Otherwise persist once in HA's data volume.
  if (configured) return configured;
  const path = join(directory, 'mcp-token');
  try {
    await writeFile(path, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new Error('Cannot create MCP access token.');
  }
  await chmod(path, 0o600);
  const token = await readFile(path, 'utf8');
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Stored MCP access token is invalid. Restore /data/mcp-token from backup.');
  return token;
}
