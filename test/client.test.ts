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
    assert.throws(()=>client.getAssignments('1','2',{}),/exactly one/);
    assert.throws(()=>client.getAssignments('1','2',{quarter:1,semester:1}),/exactly one/);
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

test('assignments navigate the requested class/term and wait for both panel loading stages', async () => {
  const {SkywardClient: ProductionClient}=await import('../dist/client.js');
  const directory=await mkdtemp(join(tmpdir(),'skyward-assignments-'));
  const selected:string[]=[];
  const header='<div id="familyAccessHeaderSelect"><div class="familyAccessHeaderSelectTile selected" data-studentid="1"><span class="familyAccessStudentNameText">Example</span></div></div>';
  const server=createServer((req,res)=>{
    res.setHeader('Content-Type','text/html');
    if (req.url?.startsWith('/selected/')) {selected.push(req.url);res.end('ok');return;}
    if (!req.url?.includes('/Grading/')) {
      res.end(header+'<a id="1-studentGrades_Widget" href="/Grading/StudentSection/FamilyAccess">Grades</a>');return;
    }
    res.end(header+`<a href="#" aria-current="true">All Year</a><div class="browse" id="StudentGrades-1"><table><tr class="unlockedHeaderTableRow">${['Class','Missing Assignments','T1','S1','T2'].map(t=>`<td><div class="headerTextDiv">${t}</div></td>`).join('')}</tr>
      ${['123','456'].map(id=>`<tr class="browseRow" id="${id}_unlockedRow"><td class="browseDataCell"><a data-studentsectionid="${id}" data-coursedescription="Example course"></a></td><td class="browseDataCell"></td>${['T1','S1'].map(term=>`<td class="browseDataCell"><button class="linkPanelButton" onclick="openAssignments('${id}','${term}')">A</button></td>`).join('')}<td class="browseDataCell"></td></tr>`).join('')}</table></div>
      <script>function openAssignments(id,term) {
        fetch('/selected/'+id+'/'+term);
        setTimeout(()=>{
          const panel=document.createElement('div');panel.id='GradeBucketAssignmentsSegmentedOuterContainer';document.body.append(panel);
          setTimeout(()=>{panel.innerHTML='<div class="SegmentedAssignmentsReferenceInformation"><span class="SegmentedAssignmentsInformationCell">Class</span><span class="SegmentedAssignmentsInformationCell"><span class="visualLabel">'+term+'</span></span></div><table><tr class="unlockedHeaderTableRow"><td><div class="headerTextDiv">Description</div></td><td><div class="headerTextDiv">Due Date</div></td><td><div class="headerTextDiv">Points Earned</div></td></tr><tr class="browseRow" id="assignment_unlockedRow1"><td class="browseDataCell"><a data-assignment-id="99">Practice</a></td><td class="browseDataCell">11/09/2026</td><td class="browseDataCell">0 / 10</td></tr></table>';},100);
        },100);
      }</script>`);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const client=new ProductionClient({baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/district/`,username:'test',password:'test',timeout:3000,timezone:'America/Los_Angeles',browser:process.env.SKYWARD_BROWSER==='chromium'?'chromium':'chrome',stateDirectory:directory});
  try {
    const result=await client.getAssignments('1','456',{semester:1});
    assert.deepEqual(selected,['/selected/456/S1']);
    assert.equal(result.selectedTerm,'S1');assert.equal(result.class.classId,'456');
    assert.equal(result.assignments[0].dueDate,'2026-11-09');assert.equal(result.assignments[0].pointsEarned,0);
    await assert.rejects(client.getAssignments('1','456',{quarter:2}),/no assignment breakdown/);
    await assert.rejects(client.getAssignments('1','789',{quarter:1}),/No grade row/);
    assert.equal(selected.length,1,'unavailable terms/classes must not open a different grade');
  } finally {
    await client.close();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});
  }
});
