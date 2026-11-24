import { TUNING, noteName } from './dsp.js';
// Manual transcription of the user's supplied tab, not a rhythm transcription.
// Each token is string:fret with optional pitch-transition technique.
export const PHRASES = [
 ['Solo 1 · opening', '4:8 4:8~ 3:10b12r10p8 2:11~ 2:8 2:11b13~'],
 ['Solo 1 · climb and pre-bend', '3:x 4:x 2:13~ 2:15 2:16 2:13~ 2:15 2:16 2:pb18~ 2:13 2:18 1:15 1:16 1:18 1:pb20~'],
 ['Solo 1 · high-string release', '1:pbr18 1:16 1:15 1:16 1:15h16p15 2:18 1:15'],
 ['Solo 1 · descending run', '2:18 2:16 2:15 2:16 2:15h16p15 3:17 2:15 3:17 3:15~'],
 ['Solo 1 · climb again', '3:15 3:17 2:15 2:16 2:18 1:15 1:16 1:18~ 3:15 3:17 2:15 2:16 2:18 1:15 1:16 1:18 1:pb20~'],
 ['Solo 1 · repeated motif', '2:15 2:16 2:13~ 2:15 2:16 2:13~ 2:15 2:16 2:pb18~'],
 ['Solo 1 · ending', '3:10 3:12 3:13~ 1:13 3:13~ 2:14 2:14 2:14 2:14 2:14~ 3:6h7p6 4:7'],
 ['Solo 2 · opening', '4:8 3:8 2:8 2:11~ 4:8 3:7 3:10 2:11~ 4:10 3:8 2:8 2:11b13~'],
 ['Solo 2 · middle', '3:7 3:8 3:7 3:10 3:8~ 3:10 2:8 2:9 2:8'],
 ['Solo 2 · slides and final bend', '1:10/15 1:14 1:15 1:17 1:17b18 2:13 2:13/15\\11 2:13 2:13/15\\11']
].map(([name,tab],id)=>({id,name,tab,notes:parseTab(tab)}));
export function parseTab(tab) {
 return tab.split(/\s+/).flatMap(token=>{
  const [s,notation]=token.split(':'),string=Number(s);
  if(!(string>=1&&string<=6)) throw new Error('Invalid string');
  if(notation==='x')return [{string,fret:null,midi:null,label:'Muted rake · manually advance',token}];
  const nums=[...notation.matchAll(/\d+/g)]; if(!nums.length)throw new Error('Missing fret');
  const result=[]; let base=Number(nums[0][0]);
  if(notation.startsWith('pbr')) result.push({string,fret:base,midi:TUNING[string-1]+base+2,label:'Pick pre-bent +2 semitones, then release',token});
  if(notation.startsWith('pb')&&!notation.startsWith('pbr')) base-=2;
  nums.forEach((m,i)=>{
   const fret=Number(m[0]),prefix=notation.slice(i?nums[i-1].index+nums[i-1][0].length:0,m.index);
   const technique=prefix.includes('pbr')?'Release':prefix.includes('pb')?'Pre-bend':prefix.includes('b')?'Bend':prefix.includes('r')?'Release':prefix.includes('h')?'Hammer-on':prefix.includes('p')?'Pull-off':/[\\/]/.test(prefix)?'Slide':'Pick';
   const physical=/Bend|Pre-bend|Release/.test(technique)?base:fret;
   result.push({string,fret:physical,midi:TUNING[string-1]+fret,label:`${technique} → ${noteName(TUNING[string-1]+fret)}${notation.includes('~')?' · vibrato':''}`,token});
  });return result;
 });
}
export class PhraseTracker {
 constructor(notes){this.notes=notes;this.index=0;this.since=null;this.last=null;this.release=false;this.previous=null;}
 update(frequency,now,onset=false){
  const note=this.notes[this.index];if(!note||note.midi===null)return false;
  if(!frequency){this.release=false;this.since=null;this.last=now;return false;}
  const exact=69+12*Math.log2(frequency/440);
  if(this.release && !onset && Math.abs(exact-this.previous)<.5)return false;
  this.release=false;
  if(Math.abs(exact-note.midi)>.35||this.last!==null&&now-this.last>250)this.since=null;
  this.last=now;
  if(Math.abs(exact-note.midi)>.35)return false;
  this.since??=now;
  if(now-this.since<160)return false;
  this.previous=note.midi;this.index++;this.since=null;this.release=true;return true;
 }
 skip(){this.index++;this.since=null;this.release=false;}
}
export class OnsetDetector {
 constructor(){this.previous=-90;this.last=-Infinity;}
 update(level,now){const hit=level>-48&&level-this.previous>7&&now-this.last>150;this.previous=level;if(hit)this.last=now;return hit;}
}
export function beatError(now,start,bpm,latency=0){const beat=60000/bpm;return ((now-start-latency+beat/2)%beat+beat)%beat-beat/2;}
