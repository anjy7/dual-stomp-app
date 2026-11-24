import type { AudioMode } from './types.js';
import type { PitchResult } from './dsp.js';
import { element, errorText } from './dom.js';
import { mountPedalTuner } from './pedal-tuner.js';
mountPedalTuner();
import { TUNING, noteName, noteFor, positions, detectPitch, HoldTracker } from './dsp.js';
const $ = element;
let context: AudioContext | null = null, stream: MediaStream | null = null, analyser: AnalyserNode | null = null, sourceNode: OscillatorNode | MediaStreamAudioSourceNode | null = null, timer: ReturnType<typeof setInterval> | undefined, mode: AudioMode = 'idle', busy = false;
let samples = new Float32Array(0), bins = new Float32Array(0), currentMidi: number | null = null, target: { midi: number; string: number; fret: number } | null = null, practicing = false, hits = 0, best = 0, cooldown = 0;
import { mountStudio } from './studio.js';
const studio = mountStudio({getAudio: () => ({stream, mode})});
import { mountNavigation } from './navigation.js';
mountNavigation();
const hold = new HoldTracker();
try { best = Math.max(0, Number(localStorage.getItem('guitar-lab-best')) || 0); } catch {}
$('best').textContent = String(best);
const cells: {cell: HTMLDivElement; midi: number; string: number; fret: number}[] = [];
const board = $('fretboard');
for (let row = -1; row < 6; row++) {
  const label = document.createElement('div'); label.className = 'fret-label';
  label.textContent = row < 0 ? 'FRET' : `${row + 1} · ${noteName(TUNING[row])}`; board.append(label);
  for (let fret = 0; fret <= 21; fret++) {
    const cell = document.createElement('div');
    cell.className = row < 0 ? 'fret-label' : `fret-cell${fret === 0 ? ' open' : ''}`;
    if (row < 0) cell.textContent = String(fret);
    else {
      const midi = TUNING[row] + fret;
      const dot = document.createElement('span'); dot.textContent = noteName(midi).replace(/\d+$/, ''); cell.append(dot);
      cell.title = `String ${row + 1}, fret ${fret}: ${noteName(midi)}`;
      cells.push({ cell, midi, string: row + 1, fret });
    }
    board.append(cell);
  }
}
function fretboard() {
  const filter = Number($('string').value);
  for (const c of cells) {
    c.cell.classList.toggle('active', c.midi === currentMidi && (!filter || c.string === filter));
    c.cell.classList.toggle('target', practicing && target?.string === c.string && target?.fret === c.fret);
  }
  const found = currentMidi === null ? [] : positions(currentMidi).filter(p => !filter || p.string === filter);
  $('positions').textContent = currentMidi === null ? 'Waiting for a note.' : found.length ? found.map(p => `String ${p.string} · ${p.fret === 0 ? 'open' : `fret ${p.fret}`}`).join('  /  ') : 'No position in the displayed string/fret range.';
}
$('string').onchange = fretboard;
$('gate').oninput = () => $('gate-value').textContent = `${$('gate').value} dBFS`;
function status(message: string, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function controls() {
  $('start').disabled = busy || mode !== 'idle'; $('demo').disabled = busy || mode !== 'idle';
  $('stop').disabled = busy || mode === 'idle'; $('refresh').disabled = busy || mode !== 'idle'; $('input').disabled = busy || mode !== 'idle';
  $('source').textContent = mode === 'live' ? 'LIVE INPUT' : mode === 'demo' ? 'SIMULATED · A2' : 'IDLE';
}
async function listInputs() {
  const previous = $('input').value;
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
  $('input').replaceChildren(new Option('Default recording input', ''));
  devices.forEach((d, i) => $('input').add(new Option(d.label || `Input ${i + 1} (allow access for name)`, d.deviceId)));
  const preferred = devices.find(d => /JME|STOMPBOX|SORAN/i.test(d.label));
  $('input').value = devices.some(d => d.deviceId === previous) && previous ? previous : preferred?.deviceId || '';
}
function errorMessage(e: unknown) {
  const name = e instanceof Error ? e.name : "";
  return ({ NotAllowedError: 'Microphone access denied. Allow it in the browser site settings and Windows privacy settings.', NotFoundError: 'No recording input found. Reconnect the pedal and click Find inputs.', NotReadableError: 'Cannot open the input. Close other recording apps and check Windows audio settings.', OverconstrainedError: 'That input is unavailable. Click Find inputs and select it again.' } as Record<string, string>)[name] || `Audio error: ${errorText(e)}`;
}
$('refresh').onclick = async () => {
  busy = true; controls(); let permission;
  try { permission = await navigator.mediaDevices.getUserMedia({ audio: true }); await listInputs(); status('Inputs refreshed. Select JME STOMPBOX for the pedal.'); }
  catch (e) { status(errorMessage(e), true); }
  finally { permission?.getTracks().forEach(t => t.stop()); busy = false; controls(); }
};
async function stopAudio(message = 'Stopped. Audio input released.') {
  studio.stopped();
  clearInterval(timer); timer = undefined; mode = 'idle';
  stream?.getTracks().forEach(t => { t.onended = null; t.stop(); }); stream = null;
  sourceNode?.disconnect(); sourceNode = null;
  const oldContext = context; context = null; analyser = null;
  if (oldContext && oldContext.state !== 'closed') await oldContext.close().catch(() => {});
  hold.reset(); currentMidi = null; render(null); drawSpectrum(); controls(); status(message);
}
async function startAudio(demo = false) {
  busy = true; controls();
  try {
    if (!demo) {
      const id = $('input').value;
      stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: id ? { exact: id } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    }
    context = new AudioContext(); await context.resume();
    analyser = context.createAnalyser(); analyser.fftSize = 4096; analyser.smoothingTimeConstant = 0.6;
    if (demo) {
      practicing = false; target = null; $('practice').textContent = 'Begin practice'; $('target').textContent = 'Demo: a simulated A2 note';
      sourceNode = context.createOscillator(); sourceNode.frequency.value = 110; sourceNode.type = 'triangle';
      const demoGain = context.createGain(); demoGain.gain.value = 0.25;
      sourceNode.connect(demoGain).connect(analyser); sourceNode.start();
    } else {
      sourceNode = context.createMediaStreamSource(stream!); sourceNode.connect(analyser);
      stream!.getTracks().forEach(t => t.onended = () => { void stopAudio('Input disconnected. Reconnect it and find inputs again.'); });
    }
    // Analyser is deliberately NOT connected to speakers (no feedback/monitoring).
    samples = new Float32Array(analyser.fftSize); bins = new Float32Array(analyser.frequencyBinCount);
    mode = demo ? 'demo' : 'live';
    if (!demo) await listInputs();
    status(demo ? 'Demo signal only. Your microphone is not being used.' : `Listening to ${stream!.getAudioTracks()[0].label}. Play a single clean note.`);
    timer = setInterval(tick, 80); tick();
  } catch (e) { await stopAudio(); status(errorMessage(e), true); }
  finally { busy = false; controls(); }
}
$('start').onclick = () => startAudio(); $('demo').onclick = () => startAudio(true); $('stop').onclick = () => stopAudio();
function render(result: PitchResult | null) {
  const note = result?.frequency ? noteFor(result.frequency) : null;
  currentMidi = note?.midi ?? null;
  $('note').textContent = note?.name || '—';
  $('frequency').textContent = note ? `${result!.frequency!.toFixed(1)} Hz` : 'Play one string at a time';
  $('cents').textContent = note ? `${note.cents > 0 ? '+' : ''}${note.cents.toFixed(0)} cents · ${Math.abs(note.cents) <= 5 ? 'in tune' : note.cents < 0 ? 'flat' : 'sharp'}` : 'Waiting for a stable note';
  $('needle').style.opacity = note ? '1' : '0'; $('needle').style.left = `${50 + (note?.cents || 0)}%`;
  $('level').value = result?.level ?? -90; $('db').textContent = result ? `${Math.round(result.level)} dBFS` : '— dBFS';
  $('quality').textContent = (result?.peak ?? 0) >= 0.98 ? 'Clipping risk: reduce the pedal output / recording level.' : note ? `Pitch periodicity: ${Math.round(result!.confidence * 100)}% · single-note estimate, not string certainty` : 'Use a clean preset. Mute unused strings; avoid chords and effects.';
  fretboard();
}
function drawSpectrum() {
  const canvas = $('spectrum'), ctx = canvas.getContext('2d')!, w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h); ctx.font = '18px Segoe UI';
  const xFor = (f: number) => Math.log(f / 50) / Math.log(100) * w;
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000]) {
    const x = xFor(f); ctx.strokeStyle = '#354338'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h - 32); ctx.stroke();
    ctx.fillStyle = '#a5b3a7'; ctx.fillText(f >= 1000 ? `${f / 1000}k` : String(f), Math.min(w - 40, x + 3), h - 7);
  }
  if (!analyser || !context) return;
  analyser.getFloatFrequencyData(bins); ctx.strokeStyle = '#c0ed89'; ctx.lineWidth = 3; ctx.beginPath(); let started = false;
  for (let i = 1; i < bins.length; i++) {
    const f = i * context.sampleRate / analyser.fftSize; if (f < 50 || f > 5000) continue;
    const x = xFor(f), y = (1 - Math.max(0, Math.min(1, (bins[i] + 100) / 100))) * (h - 36);
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
function nextTarget() {
  const pool = TUNING.flatMap((open, i) => Array.from({ length: $('exercise').value === 'open' ? 1 : 6 }, (_, fret) => ({ midi: open + fret, string: i + 1, fret })));
  const options = pool.filter(p => p.midi !== target?.midi); target = options[Math.floor(Math.random() * options.length)];
  hold.reset(); $('target').textContent = `Find ${noteName(target.midi)}`;
  $('instruction').textContent = `Try string ${target.string}, ${target.fret ? `fret ${target.fret}` : 'open'}. Hold within ±25 cents for half a second.`; fretboard();
}
$('practice').onclick = () => {
  if (mode === 'demo') { status('Stop the demo and start your guitar input to practice.', true); return; }
  practicing = !practicing; hold.reset();
  $('practice').textContent = practicing ? 'End practice' : 'Begin practice';
  if (practicing) { hits = 0; cooldown = 0; $('hits').textContent = String(hits); nextTarget(); }
  else { target = null; $('target').textContent = 'Session finished. Nice work.'; fretboard(); }
};
$('exercise').onchange = () => { if (practicing) { cooldown = 0; nextTarget(); } };
function tick() {
  if (!analyser || context?.state !== 'running') { hold.reset(); render(null); studio.sample(null, performance.now(), 'idle'); return; }
  analyser.getFloatTimeDomainData(samples);
  const result = detectPitch(samples, context.sampleRate, Number($('gate').value)); render(result); drawSpectrum();
  const now = performance.now();
  studio.sample(result, now, mode);
  if (!$('playback').paused) { hold.reset(); return; }
  if (!practicing || mode !== 'live' || !target) return;
  if (cooldown) { if (now >= cooldown) { cooldown = 0; nextTarget(); } return; }
  const note = result.frequency ? noteFor(result.frequency) : null;
  if (hold.update(note !== null && note.midi === target.midi && Math.abs(note.cents) <= 25, now)) {
    hits++; $('hits').textContent = String(hits); best = Math.max(best, hits); $('best').textContent = String(best);
    try { localStorage.setItem('guitar-lab-best', String(best)); } catch {}
    $('target').textContent = 'Pitch matched ✓'; cooldown = now + 900; hold.reset();
  }
}
navigator.mediaDevices?.addEventListener('devicechange', () => { if (mode === 'idle' && !busy) listInputs().catch(() => {}); });
window.addEventListener('pagehide', () => { stream?.getTracks().forEach(t => t.stop()); void context?.close(); });
if (navigator.mediaDevices) listInputs().catch(e => status(errorMessage(e), true));
else { status('Audio capture unavailable. Open this app at http://127.0.0.1:4317 in Chrome or Edge.', true); $('start').disabled = true; $('refresh').disabled = true; }
drawSpectrum();
