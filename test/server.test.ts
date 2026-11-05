import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../src/server.js';
import type {SkywardClient} from '../src/client.js';
import {SkywardError} from '../src/domain.js';
test('MCP handshake, schemas, structured results, and safe errors',async()=>{
 const fake={listStudents:async()=>({students:[{studentId:'1',name:'Example Student'}]}),getSchedule:async()=>{throw Error('secret internal data');},getGrades:async()=>{throw new SkywardError('Term unavailable.');}} as unknown as SkywardClient;
 const server=createServer(fake),client=new Client({name:'test',version:'1'});
 const [a,b]=InMemoryTransport.createLinkedPair();
 try {await server.connect(a);await client.connect(b);
 const {tools}=await client.listTools();assert.deepEqual(tools.map(t=>t.name),['list_students','get_student_schedule','get_student_grades']);assert.ok(tools.every(t=>t.annotations?.readOnlyHint));
 const students=await client.callTool({name:'list_students',arguments:{}});assert.deepEqual(students.structuredContent,{students:[{studentId:'1',name:'Example Student'}]});
 const failure=await client.callTool({name:'get_student_schedule',arguments:{studentId:'1'}});assert.equal(failure.isError,true);assert.ok(!JSON.stringify(failure).includes('secret'));
 const invalid=await client.callTool({name:'get_student_grades',arguments:{studentId:'1',quarter:5}});assert.equal(invalid.isError,true);
 }finally {await client.close();await server.close();}
});
