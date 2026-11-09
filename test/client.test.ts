import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkywardClient } from '../src/client.js';

test('browser identity survives queries, client restart, expired sessions, and query failures', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skyward-browser-'));
  let logins = 0, recognized = 0, expire = false;
  const server = createServer((req, res) => {
    if (req.url === '/favicon.ico') { res.writeHead(204).end(); return; }
    res.setHeader('Content-Type', 'text/html');
    if (req.method === 'POST') {
      logins++;
      if (req.headers.cookie?.includes('device=known')) recognized++;
      res.setHeader('Set-Cookie', ['device=known; Max-Age=31536000; HttpOnly; Path=/', 'session=valid; HttpOnly; Path=/']);
      res.writeHead(302, { Location: '/district/' }).end(); return;
    }
    if (expire || !req.headers.cookie?.includes('session=valid')) {
      expire = false;
      res.end('<form method="post"><input id="UserName" name="username"><input id="Password" name="password" type="password"><button>Sign In</button></form>');
    } else {
      res.end('<div id="familyAccessHeaderSelect"><div class="familyAccessHeaderSelectTile" data-studentid="1"><span class="familyAccessStudentNameText">Test Student</span></div></div><script>localStorage.setItem("remembered-device", "known");</script>');
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as {port:number};
  const config = {baseUrl:`http://127.0.0.1:${address.port}/district/`, username:'parent', password:'synthetic', timezone:'America/Los_Angeles', timeout:3000, browser:process.env.SKYWARD_BROWSER === 'chromium' ? 'chromium' as const : 'chrome' as const, stateDirectory:directory};
  let client = new SkywardClient(config);
  try {
    assert.equal((await client.listStudents()).students[0].name, 'Test Student');
    await client.listStudents();
    assert.equal(logins, 1, 'valid sessions avoid another login');
    await client.close();
    client = new SkywardClient(config);
    await client.listStudents();
    assert.equal(logins, 1, 'session survives a new browser and client');
    expire = true;
    await client.listStudents();
    assert.equal(logins, 2);
    assert.equal(recognized, 1, 'device cookie is sent even when session expires');
    await assert.rejects(client.getGrades('999'), /Unknown studentId/);
    await client.listStudents();
    assert.equal(logins, 2, 'query failure preserves authentication');
    const [file] = await readdir(directory);
    assert.equal((await stat(join(directory, file))).mode & 0o777, 0o600);
    const state = JSON.parse(await readFile(join(directory, file), 'utf8'));
    assert.ok(state.origins[0].localStorage.some((item:{name:string})=>item.name==='remembered-device'));
    await client.close();
    client = new SkywardClient({...config,username:'different-parent'});
    await client.listStudents();
    assert.equal(logins, 3, 'accounts have separate browser identities');
    assert.equal(recognized, 1);
  } finally {
    await client.close();
    await new Promise<void>(resolve => server.close(()=>resolve()));
    await rm(directory, {recursive:true,force:true});
  }
});
