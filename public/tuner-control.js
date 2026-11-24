// Soran Stomp Manager 1.0.2.2: getTuner 0x661bdc (6f/0),
// setTuner 0x662030 (6f/1). Preserve the complete received settings payload.
const HEADER = [240,0,33,122,112,111];
export const TUNER_GET = Object.freeze([...HEADER,0,0,0,0,0,0,0,0,0,247]);
export function tunerPacket(data, direction) {
  return data.length === 16 && HEADER.every((v,i)=>data[i]===v) && data[6]===direction && data[15]===247 && [...data].slice(7,15).every(v=>Number.isInteger(v)&&v>=0&&v<128);
}
export function tunerSet(snapshot, enabled) {
  if (!tunerPacket(snapshot,2) || ![0,1].includes(snapshot[7]) || typeof enabled !== 'boolean') throw new Error('Unrecognized tuner settings; nothing was changed.');
  const result = [...snapshot]; result[6]=1; result[7]=Number(enabled); return result;
}
export class TunerControl {
  constructor(output, timeout=2500) { this.output=output; this.timeout=timeout; this.pending=null; this.busy=false; this.closed=false; }
  receive(data) {
    const p=this.pending;
    if (p && tunerPacket(data,p.direction)) { clearTimeout(p.timer);this.pending=null;p.resolve([...data]); }
  }
  close() { this.closed=true; if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(new Error('MIDI disconnected; tuner state unknown.'));this.pending=null;} }
  exchange(packet,direction) {
    if(this.closed) return Promise.reject(new Error('MIDI disconnected.'));
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending=null;reject(new Error('No tuner reply. State is unknown; check the pedal. No automatic retry was sent.'));},this.timeout);
      this.pending={resolve,reject,timer,direction};
      try {this.output.send(packet);} catch(e){clearTimeout(timer);this.pending=null;reject(e);}
    });
  }
  async run(enabled) {
    if(this.busy) throw new Error('A tuner request is already in progress.');
    this.busy=true;
    try {
      const snapshot=await this.exchange(TUNER_GET,2);
      if(![0,1].includes(snapshot[7])) throw new Error('Unknown tuner state; nothing was changed.');
      if(enabled === undefined) return Boolean(snapshot[7]);
      const packet=tunerSet(snapshot,enabled);
      if(snapshot[7]!==Number(enabled)) {
        const ack=await this.exchange(packet,3);
        if(ack[7]!==1) throw new Error('Pedal did not acknowledge the tuner change. Check the pedal.');
      }
      const verified=await this.exchange(TUNER_GET,2);
      if(verified[7]!==Number(enabled) || verified.slice(8,15).some((v,i)=>v!==snapshot[i+8])) throw new Error('Tuner readback did not match. Check the pedal; no further changes were sent.');
      return Boolean(verified[7]);
    } finally {this.busy=false;}
  }
}
