import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TunerControl,tunerSet,TUNER_GET } from '../public/tuner-control.js';
const snapshot=[240,0,33,122,112,111,2,0,1,10,1,0,0,0,0,247];
test('SET modifies only direction and tuner enable, never mode/reference/mute',()=>{
 const p=tunerSet(snapshot,true); assert.equal(p[6],1); assert.equal(p[7],1);
 assert.deepEqual(p.slice(8),snapshot.slice(8));assert.equal(snapshot[7],0);
 assert.throws(()=>tunerSet([],true));assert.throws(()=>tunerSet(snapshot,1));
});
test('fresh query, SET acknowledgement and full settings readback',async()=>{
 const sent=[];let current=[...snapshot];let c;
 c=new TunerControl({send:p=>{sent.push([...p]); if(p[6]===1)current[7]=p[7];queueMicrotask(()=>c.receive(p[6]===0 ? current : [240,0,33,122,112,111,3,1,0,0,0,0,0,0,0,247]));}});
 assert.equal(await c.run(true),true);assert.deepEqual(sent.map(p=>p[6]),[0,1,0]);
 assert.deepEqual(sent[0],TUNER_GET);assert.deepEqual(sent[1].slice(8),snapshot.slice(8));
 assert.equal(await c.run(false),false);c.close();
});
test('query timeout never sends a SET; disconnect rejects pending request',async()=>{
 const sent=[];const c=new TunerControl({send:p=>sent.push(p)},15);
 await assert.rejects(c.run(true),/No tuner reply/);assert.equal(sent.length,1);assert.equal(sent[0][6],0);
 const pending=c.run(false);c.close();await assert.rejects(pending,/disconnected/);
});
test('readback mismatch is not success and requests are serialized',async()=>{
 let c;const sent=[];
 c=new TunerControl({send:p=>{sent.push(p);queueMicrotask(()=>c.receive(p[6]===0?snapshot:[240,0,33,122,112,111,3,1,0,0,0,0,0,0,0,247]));}});
 const p=c.run(true);await assert.rejects(c.run(false),/already/);await assert.rejects(p,/readback/);assert.equal(sent.length,3);
});
