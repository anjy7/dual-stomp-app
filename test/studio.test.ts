import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHRASES,parseTab,PhraseTracker,OnsetDetector,beatError } from '../public/lessons.js';
import {frequencyFor} from '../public/dsp.js';
test('supplied solo techniques become explicit pitch targets',()=>{
 assert.equal(PHRASES.length,10);
 assert.deepEqual(parseTab('3:10b12r10p8').map(n=>n.midi),[65,67,65,63]);
 assert.deepEqual(parseTab('1:pb20').map(n=>[n.fret,n.midi]),[[18,84]]);
 assert.deepEqual(parseTab('1:pbr18').map(n=>n.midi),[84,82]);
 assert.deepEqual(parseTab('2:13/15\\11').map(n=>n.midi),[72,74,70]);
 assert.equal(parseTab('3:x')[0].midi,null);
 assert.ok(PHRASES.every(p=>p.notes.length>0&&p.notes.every(n=>n.midi===null||n.midi>=40&&n.midi<=85)));
});
test('phrase match requires hold; repeated pitch needs release, wrong note and gaps reset',()=>{
 const t=new PhraseTracker(parseTab('4:8 4:8 3:10'));const f=frequencyFor(58);
 assert.equal(t.update(f,0),false);assert.equal(t.update(f,80),false);assert.equal(t.update(f,160),true);
 assert.equal(t.update(f,240),false);assert.equal(t.index,1);t.update(null,320);
 t.update(f,400);t.update(f,480);assert.equal(t.update(f,560),true);
 t.update(frequencyFor(65),640);t.update(frequencyFor(64),720);t.update(frequencyFor(65),800);
 assert.equal(t.update(frequencyFor(65),1200),false);assert.equal(t.index,2);
});
test('onset refractory interval and signed nearest-beat errors',()=>{
 const d=new OnsetDetector();assert.equal(d.update(-30,0),true);assert.equal(d.update(-30,80),false);d.update(-80,160);assert.equal(d.update(-30,240),true);
 assert.equal(beatError(1010,1000,60),10);assert.equal(beatError(1990,1000,60),-10);assert.equal(beatError(2050,1000,60,50),0);
});
