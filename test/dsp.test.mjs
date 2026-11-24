import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch, frequencyFor, noteFor, positions, HoldTracker } from '../public/dsp.js';
function signal(f, rate, harmonics = false) {
  return Float32Array.from({length: 4096}, (_, i) => {
    const phase = 2 * Math.PI * f * i / rate;
    return harmonics ? .16 * Math.sin(phase) + .3 * Math.sin(2 * phase) + .1 * Math.sin(3 * phase) : .4 * Math.sin(phase);
  });
}
for (const rate of [44100, 48000, 96000]) {
  test(`all guitar pitches ±3 cents at ${rate} Hz`, () => {
    for (let midi = 40; midi <= 85; midi++) for (const harmonics of [false, true]) {
      const f = frequencyFor(midi), result = detectPitch(signal(f, rate, harmonics), rate);
      assert.ok(result.frequency, `missing MIDI ${midi}`);
      assert.ok(Math.abs(1200 * Math.log2(result.frequency / f)) < 3, `MIDI ${midi}: ${result.frequency}`);
    }
  });
}
test('silence, DC, low-level noise rejected', () => {
  for (const samples of [new Float32Array(4096), new Float32Array(4096).fill(.1), Float32Array.from({length:4096}, (_, i) => .0001 * Math.sin(i * 9))]) {
    assert.equal(detectPitch(samples, 48000).frequency, null);
  }
});
test('nonperiodic noise rejected', () => {
  let state = 123;
  const noise = Float32Array.from({length:4096}, () => { state = (1664525 * state + 1013904223) >>> 0; return (state / 2 ** 32 - .5) * .5; });
  assert.equal(detectPitch(noise, 48000).frequency, null);
});
test('notes and ambiguous positions', () => {
  assert.equal(noteFor(440).name, 'A4');
  assert.ok(Math.abs(noteFor(440 * 2 ** (20 / 1200)).cents - 20) < 1e-9);
  assert.deepEqual(positions(40), [{string:6,fret:0}]);
  assert.deepEqual(positions(64), [{string:1,fret:0},{string:2,fret:5},{string:3,fret:9},{string:4,fret:14},{string:5,fret:19}]);
  assert.deepEqual(positions(10), []);
});
test('practice requires sustained match and resets on silence / long gap', () => {
  const h = new HoldTracker();
  for (const t of [0, 80, 160, 240, 320, 400]) assert.equal(h.update(true, t), false);
  assert.equal(h.update(true, 480), true);
  assert.equal(h.update(false, 560), false);
  assert.equal(h.update(true, 640), false);
  assert.equal(h.update(true, 2000), false);
});
