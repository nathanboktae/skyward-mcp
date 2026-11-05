import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isoDate,resolveTerm,SerialQueue} from '../src/domain.js';
import {readConfig} from '../src/config.js';
test('quarter aliases, semester selection, and unavailable terms',()=>{
 const terms=['T1','T2','T3','T4','S1','S2'];
 assert.equal(resolveTerm(terms,{quarter:3}),'T3');assert.equal(resolveTerm(terms,{semester:2}),'S2');
 assert.equal(resolveTerm(['Q1'],{quarter:1}),'Q1');assert.equal(resolveTerm(terms,{term:'s1'}),'S1');
 assert.throws(()=>resolveTerm(terms,{quarter:1,semester:1}));assert.throws(()=>resolveTerm(['T1'],{quarter:4}));
});
test('dates and safe configuration',()=>{
 assert.equal(isoDate('11/2/2026 12:00:00 AM'),'2026-11-02');assert.equal(isoDate(null),null);
 const env={SKYWARD_BASE_URL:'https://example.org/district',SKYWARD_USERNAME:'parent',SKYWARD_PASSWORD:'secret'};
 assert.equal(readConfig(env).baseUrl,'https://example.org/district/');
 for(const url of ['http://example.org/district/','https://example.org/district/?p=session','https://user:pass@example.org/district/']) assert.throws(()=>readConfig({...env,SKYWARD_BASE_URL:url}));
});
test('queries serialize and recover after failures',async()=>{
 const queue=new SerialQueue();const order:string[]=[];
 const a=queue.run(async()=>{order.push('a');await new Promise(r=>setTimeout(r,15));order.push('a-end');throw Error('expected');});
 const b=queue.run(async()=>{order.push('b');return 2;});
 await assert.rejects(a);assert.equal(await b,2);assert.deepEqual(order,['a','a-end','b']);
});
