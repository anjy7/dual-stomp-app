import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PedalTunerState, PEDAL_NOTES } from '../public/pedal-tuner.js';
test('pedal CC decoding: observed capture prefix, table and display boundaries', () => {
  const s = new PedalTunerState();
  // First observed CC triplet from the receive-only JME STOMPBOX capture.
  for (const data of [[0xb0,69,1],[0xb0,70,6],[0xb0,72,27]]) assert.equal(s.receive(data, 100), true);
  assert.equal(s.view(100).note, 'E♭'); assert.equal(s.view(100).direction, 'flat');
  for (const [position, direction] of [[47,'flat'],[48,'centered'],[50,'centered'],[52,'centered'],[53,'sharp']] as const) {
    s.receive([0xb0,72,position], 101); assert.equal(s.view(101).direction,direction);
  }
  PEDAL_NOTES.forEach((note,i) => { s.receive([0xb0,70,i],102); assert.equal(s.view(102).note,note); });
});
test('pedal lifecycle: partial, inactive, stale, change-only cached note and reset', () => {
  const s = new PedalTunerState();
  s.receive([176,69,1],0); assert.equal(s.view(0).visible,false);
  s.receive([176,70,0],0); s.receive([176,72,50],0); assert.equal(s.view(0).visible,true);
  s.receive([176,69,0],10); assert.equal(s.view(10).visible,false);
  s.receive([176,69,1],20); assert.equal(s.view(20).note,'A');
  assert.equal(s.view(2021).visible,false);
  s.receive([176,72,49],2030); assert.equal(s.view(2030).visible,true);
  s.reset(); assert.equal(s.view(2030).visible,false); assert.equal(s.messages,0);
});
test('pedal ignores invalid, unrelated and other-channel messages', () => {
  const s = new PedalTunerState();
  for (const data of [[],[176,69],[176,69,2],[176,70,12],[176,72,101],[176,72,-1],[176,72,1.5],[177,69,1],[144,70,1],[176,71,1],[240,0,33,122,247]]) assert.equal(s.receive(data,0),false);
  assert.equal(s.last,null);
});
