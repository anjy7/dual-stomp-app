// JME-01 firmware 1.1.1; captured Stomp Manager 1.0.2.2 commands.
import type { MidiBytes, MidiSender, PendingReply } from './types.js';
export type Preset = ReturnType<typeof decodePreset> & { index: number };
export interface PedalSnapshot { index: number; packet: number[]; name: string; savedAt: string }
const HEADER=[240,0,33,122,112];
export const EFFECTS=['OD/FX','AMP','CAB','MOD','DEL','REV','GATE','EQ'];
export const request=(op: number,index=0)=>[...HEADER,op,0,...(op===21?[]:[index,...Array(13).fill(0)]),247];
export function unpack(data: MidiBytes){let bits=0,value=0;const out=[];for(const b of data){if(!Number.isInteger(b)||b<0||b>127)throw Error('Invalid packed data');value|=b<<bits;bits+=7;while(bits>=8){out.push(value&255);value>>>=8;bits-=8;}}if(value)throw Error('Nonzero padding');return out;}
export function decodePreset(packet: MidiBytes,op=12){
 if(packet.length!==134||!HEADER.every((v,i)=>packet[i]===v)||packet[5]!==op||packet[6]!==2||packet.at(-1)!==247)throw Error('Unrecognized preset packet');
 const raw=unpack(packet.slice(7,-1));
 if(raw.length!==110||raw[8]!==98||raw.slice(9,12).some(Boolean)||raw.slice(12,20).some(v=>v>127)||raw[33]>100)throw Error('Unsupported preset layout');
 return {raw,name:String.fromCharCode(...raw.slice(94,110)).replace(/\0.*$/s,''),effects:raw.slice(12,20).map(v=>({model:v&63,enabled:!(v&64)})),gain:raw[33],packet:[...packet]};
}
export class PedalControl {
 output: MidiSender; timeout: number; pending: (PendingReply & {op: number; index: number}) | null; busy: boolean; closed: boolean;
 constructor(output: MidiSender,timeout=2500){this.output=output;this.timeout=timeout;this.pending=null;this.busy=false;this.closed=false;}
 receive(data: MidiBytes){const p=this.pending;if(!p||!HEADER.every((v,i)=>data[i]===v)||data[5]!==p.op||data[6]!==2||data.at(-1)!==247||(p.op===11&&data[7]!==p.index))return;clearTimeout(p.timer);this.pending=null;p.resolve([...data]);}
 close(){this.closed=true;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error('Pedal disconnected; state unknown.'));this.pending=null;}}
 query(op: number,index=0): Promise<number[]>{if(this.closed)throw Error('Pedal disconnected');return new Promise<number[]>((resolve,reject)=>{const timer=setTimeout(()=>{this.pending=null;reject(Error('No pedal reply; state unknown. No automatic retry.'));},this.timeout);this.pending={op,index,resolve,reject,timer};try{this.output.send(request(op,index));}catch(e){clearTimeout(timer);this.pending=null;reject(e);}});}
 async exclusive<T>(fn: () => Promise<T>): Promise<T>{if(this.busy)throw Error('Pedal operation already in progress');if(this.closed)throw Error('Pedal disconnected');this.busy=true;try{return await fn();}finally{this.busy=false;}}
 async read(){const indexPacket=await this.query(21);if(indexPacket.length!==16||!Number.isInteger(indexPacket[7])||indexPacket[7]<0||indexPacket[7]>98)throw Error('Unknown preset number');const preset=decodePreset(await this.query(12));const end=await this.query(21);if(end.length!==16||end[7]!==indexPacket[7])throw Error('Preset changed while reading; retry');return {...preset,index:end[7]};}
 refresh(){return this.exclusive(()=>this.read());}
 restore(snapshot: Pick<PedalSnapshot, "index" | "packet">){return this.exclusive(async()=>{
  if(!snapshot||!Number.isInteger(snapshot.index)||snapshot.index<0||snapshot.index>98)throw Error('Invalid snapshot');
  const target=decodePreset(snapshot.packet),stored=decodePreset(await this.query(11,snapshot.index),11);
  const base=[...stored.raw];base.fill(0,0,8);
  const allowed=new Set([...Array.from({length:8},(_,i)=>12+i),33]);
  if(target.raw.some((v,i)=>!allowed.has(i)&&v!==base[i])||target.effects.some((e,i)=>e.model!==stored.effects[i].model)||(target.gain!==stored.gain&&target.effects[1].model!==7))throw Error('Snapshot contains settings that cannot yet be restored safely. Nothing changed.');
  await this.read();this.output.send([193,snapshot.index]);const selected=await this.read();
  if(selected.index!==snapshot.index||selected.raw.some((v,i)=>v!==base[i]))throw Error('Selected preset did not match preflight; recall stopped.');
  for(let i=0;i<8;i++)if(target.raw[12+i]!==base[12+i])this.output.send([177,i,target.raw[12+i]]);
  if(target.gain!==stored.gain)this.output.send([177,18,target.gain]);
  const after=await this.read();if(after.index!==snapshot.index||after.raw.some((v,i)=>v!==target.raw[i]))throw Error('Snapshot recall not confirmed; state unknown. No automatic retry.');return after;
 });}
 select(index: number){return this.exclusive(async()=>{if(!Number.isInteger(index)||index<0||index>98)throw Error('Preset must be P01–P99');await this.read();this.output.send([193,index]);const after=await this.read();if(after.index!==index)throw Error('Preset selection not confirmed; state unknown');return after;});}
 edit(kind: "effect", index: number, value: boolean): Promise<Preset>;
 edit(kind: "gain", index: number, value: number): Promise<Preset>;
 edit(kind: string,index: number,value: number | boolean){return this.exclusive(async()=>{
 if(kind==='effect'&&(!Number.isInteger(index)||index<0||index>7||typeof value!=='boolean'))throw Error('Invalid effect');
 if(kind==='gain'&&(typeof value!=='number'||!Number.isInteger(value)||value<0||value>100))throw Error('Gain must be 0–100');
 if(!['effect','gain'].includes(kind))throw Error('Unsupported parameter');
 const before=await this.read(),expected=[...before.raw];
 if(kind==='gain' && typeof value==='number'){// Only the directly traced Vox 30HW model has a verified gain mapping.
  if(before.effects[1].model!==7)throw Error('Gain editing is verified only for amp model 8 (Vox 30HW)');expected[33]=value;this.output.send([177,18,value]);
 }else{expected[12+index]=before.effects[index].model|(value?0:64);this.output.send([177,index,expected[12+index]]);}
 const after=await this.read();if(after.index!==before.index||after.raw.some((v,i)=>v!==expected[i]))throw Error('Readback differed from requested change; inspect pedal. No further commands sent.');return after;
 });}
}
