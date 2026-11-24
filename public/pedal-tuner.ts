import { element, errorText } from './dom.js';
import type { Elements } from './dom.js';
import type { MidiBytes } from './types.js';
import { TunerControl } from './tuner-control.js';
import { PedalControl } from './pedal-control.js';
import { mountPedalControls } from './pedal-controls-ui.js';
// Soran Stomp Manager 1.0.2.2 note-image table, confirmed through read-only
// inspection. CC assignments match the observed JME capture and related NUX
// protocol. Not a vendor-supported API; see docs/pedal-tuner.md.
export const PEDAL_NOTES = ['A', 'B♭', 'B', 'C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯'];
export class PedalTunerState {
  active = false; note: string | null = null; position: number | null = null; last: number | null = null; messages = 0;
  constructor() { this.reset(); }
  reset() { this.active = false; this.note = null; this.position = null; this.last = null; this.messages = 0; }
  receive(data: MidiBytes, now: number) {
    // Only channel-one CCs observed on this specific device. Ignore SysEx,
    // notes from MIDI keyboards, malformed values, and other channels.
    if (data.length !== 3 || data[0] !== 0xb0 || ![69, 70, 72].includes(data[1]) || !Number.isInteger(data[2]) || data[2] < 0 || data[2] > 127) return false;
    const [, cc, value] = data;
    if ((cc === 69 && value > 1) || (cc === 70 && value > 11) || (cc === 72 && value > 100)) return false;
    if (cc === 69) this.active = value === 1;
    if (cc === 70) this.note = PEDAL_NOTES[value];
    if (cc === 72) this.position = value;
    this.last = now; this.messages++;
    return true;
  }
  view(now: number) {
    const fresh = this.last !== null && now - this.last <= 2000;
    const visible = fresh && this.active && this.note !== null && this.position !== null;
    return { visible, fresh, note: visible ? this.note : null, position: visible ? this.position : null,
      direction: !visible ? null : this.position! < 48 ? 'flat' : this.position! > 52 ? 'sharp' : 'centered' };
  }
}
export function mountPedalTuner(doc = document, nav = navigator) {
  const $ = <K extends keyof Elements>(id: K) => element(id, doc), state = new PedalTunerState();
  let access: MIDIAccess | null = null, input: MIDIInput | null = null, output: MIDIOutput | null = null, control: TunerControl | null = null, pedalControl: PedalControl | null = null, timer: ReturnType<typeof setInterval> | undefined, busy = false;
  const controlsUI=mountPedalControls(doc,async fn=>{if(busy||!pedalControl)throw Error('Connect MIDI and wait for the current operation.');busy=true;buttons();try{return await fn(pedalControl);}finally{busy=false;buttons();}});
  function buttons() {
    for (const id of ['pedal-on','pedal-off'] as const) $(id).disabled = !control || busy;
  }
  async function setTuner(enabled: boolean) {
    if (!control || busy) return;
    const current = control;
    busy = true; controlsUI.busy(true); buttons();
    message('Reading settings and requesting tuner ' + (enabled ? 'on' : 'off') + '…');
    try {
      const on = await current.run(enabled);
      if (control !== current) return;
      $('pedal-mode').textContent = on ? 'Tuner ON · confirmed by pedal' : 'Tuner OFF · confirmed by pedal';
      if (!on) { state.reset(); draw(); }
      message(on ? 'Tuner enabled. Pluck one string. The pedal may mute audio while tuning.' : 'Tuner disabled. You can resume audio-based practice.');
    } catch (e) { if (control === current) { $('pedal-mode').textContent = 'Tuner state unknown'; message(errorText(e)); } }
    finally { busy = false; controlsUI.busy(false); buttons(); $('pedal-connect').disabled = Boolean(input); }
  }
  $('pedal-on').onclick = () => setTuner(true);
  $('pedal-off').onclick = () => setTuner(false);
  function message(text: string) { $('pedal-status').textContent = text; }
  function draw() {
    const v = state.view(performance.now());
    $('pedal-note').textContent = v.note || '—';
    $('pedal-needle').style.opacity = v.visible ? '1' : '0';
    $('pedal-needle').style.left = `${v.position ?? 50}%`;
    $('pedal-reading').textContent = !v.visible ? 'Waiting for pedal readings' : v.direction === 'centered' ? 'Centred · in tune' : v.direction === 'flat' ? 'Flat · tighten gently' : 'Sharp · loosen gently';
    $('pedal-reading').dataset.direction = v.direction || '';
    $('pedal-raw').textContent = v.visible ? `Pedal indicator: ${v.position} / 100 · centre 50` : 'No frequency or octave is reported by this integration.';
    $('pedal-badge').textContent = !input ? 'NOT CONNECTED' : v.visible ? 'PEDAL MIDI' : v.fresh ? 'NO STABLE NOTE' : 'WAITING';
  }
  async function disconnect(text = 'MIDI disconnected. The pedal’s tuner mode is unchanged.') {
    clearInterval(timer); timer = undefined;
    if (access) access.onstatechange = null;
    control?.close(); control = null; pedalControl?.close(); pedalControl=null; controlsUI.connection(false);
    const oldOutput = output; output = null;
    if (oldOutput) await oldOutput.close().catch(() => {});
    $('pedal-mode').textContent = 'Tuner state unknown'; buttons();
    const old = input; input = null;
    if (old) { old.onmidimessage = null; await old.close().catch(() => {}); }
    state.reset(); draw();
    $('pedal-connect').disabled = busy; $('pedal-disconnect').disabled = true; message(text);
  }
  $('pedal-connect').onclick = async () => {
    if (busy || input) return;
    if (!nav.requestMIDIAccess) { message('Web MIDI is unavailable. Use Chrome or Edge on this PC.'); return; }
    busy = true; $('pedal-connect').disabled = true;
    try {
      // SysEx is needed for the narrowly scoped tuner GET/SET controls.
      access = await nav.requestMIDIAccess({ sysex: true });
      const matches = [...access.inputs.values()].filter(p => /^JME STOMPBOX$/i.test(p.name || '') && p.state === 'connected');
      if (matches.length !== 1) throw new Error(matches.length ? 'Multiple matching MIDI inputs. Disconnect extra pedals and retry.' : 'No JME STOMPBOX MIDI input found. Reconnect the pedal and retry.');
      input = matches[0];
      input.onmidimessage = event => {
        if (!event.data) return;
        if(!busy) window.dispatchEvent(new CustomEvent('pedal-message', {detail:[...event.data]}));
        control?.receive(event.data); pedalControl?.receive(event.data);
        if(!busy && [177,193].includes(event.data[0])) controlsUI.invalidate();
        if (state.receive(event.data, performance.now())) draw();
      };
      await input.open();
      const outputs = [...access.outputs.values()].filter(p => p.name === input?.name && p.state === 'connected');
      if (outputs.length !== 1) throw new Error('Need exactly one matching pedal MIDI output for tuner control.');
      output = outputs[0]; await output.open();
      control = new TunerControl(output); pedalControl=new PedalControl(output); controlsUI.connection(true);
      access.onstatechange = () => { if (input?.state === 'disconnected' || output?.state === 'disconnected') void disconnect('Pedal unplugged. Reconnect it, then click Connect pedal tuner.'); };
      timer = setInterval(draw, 150);
      $('pedal-disconnect').disabled = false;
      message(`Connected to ${input.name}. Use Turn tuner on or Turn tuner off. The separate Pedal controls panel can read presets and make temporary edits.`);
      draw();
    } catch (e) {
      await disconnect(e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'MIDI permission denied. Allow MIDI access in the browser’s site settings, then retry.' : `Cannot receive pedal MIDI: ${errorText(e)} Close Stomp Manager if it is holding the input.`);
    } finally { busy = false; $('pedal-connect').disabled = Boolean(input); buttons(); }
  };
  $('pedal-disconnect').onclick = () => disconnect();
  window.addEventListener('pagehide', () => { clearInterval(timer); control?.close(); pedalControl?.close(); if (output) void output.close(); if (input) { input.onmidimessage = null; void input.close(); } });
  draw();
}
