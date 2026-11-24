import type { Elements } from './dom.js';
import type { AudioSession, AudioMode } from './types.js';
import type { PitchResult } from './dsp.js';
import { element, errorText } from './dom.js';
import { PHRASES, PhraseTracker, OnsetDetector, beatError } from './lessons.js';
import { TUNING, noteName, HoldTracker } from './dsp.js';
export function mountStudio({getAudio}: {getAudio: () => AudioSession}) {
 const $ = element;
 $('studio').innerHTML=`<h2>Practice studio</h2>
 <p class="muted">Use Start listening with a clean guitar input. Demo never earns credit. Turn the pedal tuner off for lessons if it mutes USB audio.</p>
 <div class="studio-grid"><section id="studio-lessons" class="panel"><h2>Bohemian Rhapsody</h2><p class="muted">Play through your supplied solo, one phrase at a time.</p>
 <label>Phrase<select id="phrase"></select></label><p id="phrase-tab" class="tab-text"></p><div id="phrase-notes" class="phrase-notes" aria-label="Phrase pitch targets"></div>
 <div class="pedal-actions"><button id="lesson-start">Start phrase</button><button id="lesson-next">Skip / next</button><label><input id="lesson-loop" type="checkbox"> Loop phrase</label></div>
 <h3 id="lesson-target">Choose a phrase</h3><p id="lesson-detail"></p><progress id="lesson-progress" value="0" max="1"></progress>
 <p class="muted">Wait-for-pitch practice: hold each target for ~160 ms within ±35 cents. Repeated notes need a fresh attack or gap. Checks pitches, not fingering, articulation or song rhythm. Rakes are manual. The final slide-down with no destination is ungraded; vibrato/staccato are cues, not scored.</p>
 </section><section id="studio-bends" class="panel"><h2>Bend trainer</h2><div class="studio-row">
 <label>String<select id="bend-string">${TUNING.map((n,i)=>`<option value="${i}">${i+1} · ${noteName(n)}</option>`).join('')}</select></label>
 <label>Starting fret<input id="bend-fret" type="number" min="0" max="19" value="15"></label>
 <label>Bend<select id="bend-step"><option value="1">Half step</option><option value="2" selected>Whole step</option></select></label></div>
 <p id="bend-target"></p><h3 id="bend-reading">Play a note</h3><canvas id="bend-chart" width="600" height="180" aria-label="Recent pitch relative to bend target"></canvas>
 <p class="muted">Reach the target and hold within ±15 cents for 450 ms. Play the starting pitch first to arm each attempt. A target hit does not prove the bending technique.</p>
 </section><section id="studio-timing" class="panel"><h2>Metronome & timing</h2><div class="studio-row"><label>BPM<input id="bpm" type="number" min="30" max="240" value="70"></label><label>Input latency correction (ms)<input id="latency" type="number" min="-500" max="500" value="0"></label></div>
 <div class="pedal-actions"><button id="metro">Start metronome</button><button id="tap">Tap / Space on beat</button></div><h3 id="beat">Stopped</h3><p id="timing">Use headphones. Clicks and playback use the browser’s output device.</p>
 <p class="muted">Single-note attacks are compared with the nearest beat, not the song’s rhythm. Audio attack estimates are coarse (~80 ms sampling plus USB latency); legato or effects may hide attacks. Tap feedback measures your key/button timing, not audio latency calibration.</p>
 </section><section id="studio-takes" class="panel"><h2>Your takes</h2><div class="pedal-actions"><button id="record">Record take</button><button id="record-stop" disabled>Finish take</button></div><p id="record-status">Auto-stops at 5 minutes or approximately 20 MB per take. No automatic upload or permanent audio storage.</p>
 <label>Compare takes<select id="takes"><option value="">No recordings yet</option></select></label><audio id="playback" controls></audio><a id="download" hidden>Download selected take</a><button id="delete-takes">Delete takes</button>
 <p class="muted">Keeps the latest five takes in this tab’s memory. Download to keep them before closing/reloading. Playback is never scored as practice. Headphones prevent feedback.</p>
 </section></div>
 <section id="studio-progress" class="panel"><h2>Progress & practice setup</h2><p id="progress-summary"></p><div class="pedal-actions"><button id="save-setup">Save practice setup</button><button id="load-setup">Recall practice setup</button><button id="export-progress">Export progress</button><button id="clear-progress">Clear progress</button></div><p id="setup-status" role="status">Setup saves phrase, tempo, bend target and latency locally—not pedal presets.</p>
 </section><section id="studio-foot"><h2>Footswitch input</h2><div class="pedal-actions"><label>Action<select id="foot-action"><option value="next">Next note (manual skip)</option><option value="lesson">Start/stop phrase</option></select></label><button id="foot-learn">Learn next MIDI switch message</button><button id="foot-clear">Clear mapping</button></div><p id="foot-status">Connect pedal MIDI first. Learning accepts non-tuner CC or Program Change messages only. Support depends on what the pedal sends; pressing its switch may also change its own sound.</p>
 </section>`;
 let stats: {phrases: number; matched: number; skipped: number; bends: number; timing: number[]}={phrases:0,matched:0,skipped:0,bends:0,timing:[]},storageOK=true;
 try {const s=JSON.parse(localStorage.getItem('guitar-lab-progress')||'null');if(s&&['phrases','matched','skipped','bends'].every(k=>Number.isFinite(s[k])&&s[k]>=0)&&Array.isArray(s.timing))stats={...s,timing:s.timing.filter(Number.isFinite).slice(-100)};}catch{storageOK=false;}
 function progress(){ $('progress-summary').textContent=`${stats.phrases} phrases completed without pitched-note skips · ${stats.matched} pitch targets matched · ${stats.skipped} manually skipped · ${stats.bends} bend targets held · ${stats.timing.length?Math.round(stats.timing.reduce((s,v)=>s+Math.abs(v),0)/stats.timing.length)+' ms mean absolute beat error (last '+stats.timing.length+' attacks)':'no timed attacks yet'}${storageOK?'':' · local storage unavailable'}`; }
 function save(){try{localStorage.setItem('guitar-lab-progress',JSON.stringify(stats));}catch{storageOK=false;}progress();}
 PHRASES.forEach(p=>$('phrase').add(new Option(p.name,String(p.id))));
 let tracker: PhraseTracker | null=null,running=false,completeAt=0,phraseSkips=0;
 function chosen(){return PHRASES[Number($('phrase').value)];}
 function showLesson(){const p=chosen(),n=tracker?.notes[tracker.index];$('phrase-notes').replaceChildren(...p.notes.map((note,i)=>{const el=document.createElement('span');el.textContent=note.midi===null?'×':noteName(note.midi);el.title=`${i+1}: ${note.token} · ${note.label}`;el.className=tracker&&i===tracker.index?'current':tracker&&i<tracker.index?'passed':'';if(tracker&&i===tracker.index)el.setAttribute('aria-current','step');return el;}));$('phrase-tab').textContent=p.tab;$('lesson-progress').max=p.notes.length;$('lesson-progress').value=tracker?.index||0;$('lesson-target').textContent=n?`${tracker!.index+1}/${p.notes.length} · ${n.label}`:tracker?'Phrase complete':'Choose a phrase';$('lesson-detail').textContent=n?`String ${n.string}${n.fret===null?'':`, fret ${n.fret}`} · ${n.token}`:'';$('lesson-start').textContent=running?'Stop phrase':'Start phrase';}
 function startLesson(){if(running){running=false;showLesson();return;}if(getAudio().mode!=='live'){$('lesson-detail').textContent='Start your guitar audio input first (not demo).';return;}tracker=new PhraseTracker(chosen().notes);phraseSkips=0;running=true;completeAt=0;showLesson();}
 function finish(now: number){if(!tracker)return;if(tracker.index>=tracker.notes.length){if(!phraseSkips)stats.phrases++;save();if($('lesson-loop').checked)completeAt=now+1000;else running=false;}showLesson();}
 $('lesson-start').onclick=startLesson;
 $('lesson-next').onclick=()=>{if(!running||completeAt||!tracker)return;if(tracker.notes[tracker.index]?.midi!==null){phraseSkips++;stats.skipped++;}tracker.skip();finish(performance.now());save();};
 $('phrase').onchange=()=>{running=false;tracker=null;completeAt=0;showLesson();};showLesson();
 const hold=new HoldTracker();let bendArmed=false,trace: (number | null)[]=[];
 const bounded=(id: "bend-string" | "bend-fret" | "bend-step" | "bpm" | "latency",min: number,max: number,fallback: number)=>{const v=Number($(id).value);return Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;};
 function bendConfig(){const string=bounded('bend-string',0,5,0),fret=Math.round(bounded('bend-fret',0,19,15)),step=bounded('bend-step',1,2,2);return {base:TUNING[string]+fret,target:TUNING[string]+fret+step};}
 function bendLabel(){const b=bendConfig();$('bend-target').textContent=`Start ${noteName(b.base)} → target ${noteName(b.target)}`;hold.reset();bendArmed=false;trace=[];}
 for(const id of ['bend-string','bend-fret','bend-step'] as const)$(id).onchange=bendLabel;bendLabel();
 let metroContext: AudioContext | null=null,metroTimer: ReturnType<typeof setInterval> | undefined,metroBusy=false,nextBeat=0,beatCount=0,beatOrigin=0,metroBpm=70;const oscillators=new Set<OscillatorNode>();
 async function stopMetro(){clearInterval(metroTimer);metroTimer=undefined;for(const o of oscillators){try{o.stop();}catch{}}oscillators.clear();const c=metroContext;metroContext=null;if(c)await c.close().catch(()=>{});$('metro').textContent='Start metronome';$('beat').textContent='Stopped';}
 $('metro').onclick=async()=>{if(metroBusy)return;metroBusy=true;try{if(metroContext){await stopMetro();return;}const c=new AudioContext();metroContext=c;await c.resume();metroBpm=bounded('bpm',30,240,70);$('bpm').value=String(metroBpm);nextBeat=c.currentTime+.15;beatOrigin=performance.now()+150;beatCount=0;
 const schedule=()=>{if(c.state!=='running'){void stopMetro();return;}while(nextBeat<c.currentTime+.12){const o=c.createOscillator(),g=c.createGain();o.frequency.value=beatCount%4?800:1200;g.gain.setValueAtTime(.06,nextBeat);g.gain.exponentialRampToValueAtTime(.001,nextBeat+.04);o.connect(g).connect(c.destination);oscillators.add(o);o.onended=()=>{oscillators.delete(o);o.disconnect();g.disconnect();};o.start(nextBeat);o.stop(nextBeat+.05);nextBeat+=60/metroBpm;beatCount++;}$('beat').textContent=`Beat ${Math.max(0,Math.floor((performance.now()-beatOrigin)/(60000/metroBpm)))%4+1} · ${metroBpm} BPM`;};schedule();metroTimer=setInterval(schedule,25);$('metro').textContent='Stop metronome';}catch(e){await stopMetro();$('timing').textContent=errorText(e);}finally{metroBusy=false;}};
 $('bpm').onchange=()=>{if(metroContext){void stopMetro();$('timing').textContent='Tempo changed. Restart the metronome.';}};
 function timing(now: number,kind: "Audio" | "Tap"){if(!metroContext||now<beatOrigin)return;const error=beatError(now,beatOrigin,metroBpm,kind==='Audio'?bounded('latency',-500,500,0):0);$('timing').textContent=`${kind}: ${Math.round(Math.abs(error))} ms ${error<0?'early':'late'} (nearest beat)`;if(kind==='Audio'){stats.timing.push(error);stats.timing=stats.timing.slice(-100);save();}}
 $('tap').onclick=()=>timing(performance.now(),'Tap');window.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!/INPUT|SELECT|TEXTAREA|BUTTON/.test((e.target instanceof Element ? e.target.tagName : ""))&&metroContext){e.preventDefault();timing(performance.now(),'Tap');}});
 let recorder: MediaRecorder | null=null,recordTimer: ReturnType<typeof setTimeout> | undefined,takes: {id: string; url: string; filename: string}[]=[],recBytes=0,recordStarted=0;
 function selectedTake(){const t=takes.find(t=>t.id===$('takes').value);$('playback').pause();$('playback').src=t?.url||'';$('download').hidden=!t;if(t){$('download').href=t.url;$('download').download=t.filename;}}
 $('takes').onchange=selectedTake;
 function stopRecord(){if(recorder?.state==='recording')recorder.stop();clearTimeout(recordTimer);}
 $('record').onclick=()=>{if(recorder)return;const a=getAudio();if(a.mode!=='live'||!a.stream){$('record-status').textContent='Start listening to your guitar first.';return;}if(!window.MediaRecorder){$('record-status').textContent='Recording is unsupported in this browser.';return;}
 try{$('playback').pause();const chunks: Blob[]=[];recBytes=0;recordStarted=Date.now();const r=new MediaRecorder(a.stream);recorder=r;
 r.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);recBytes+=e.data.size;if(recBytes>=20*1024*1024)stopRecord();}};
 r.onerror=()=>{$('record-status').textContent='Recording error. Any available audio will be kept.';stopRecord();};
 r.onstop=()=>{clearTimeout(recordTimer);if(recorder===r)recorder=null;$('record').disabled=false;$('record-stop').disabled=true;
 if(!chunks.length){$('record-status').textContent='No audio captured.';return;}const blob=new Blob(chunks,{type:r.mimeType}),id=String(recordStarted),filename=`guitar-take-${id}.${r.mimeType.includes('ogg')?'ogg':r.mimeType.includes('mp4')?'mp4':'webm'}`;
 takes.push({id,url:URL.createObjectURL(blob),filename});if(takes.length>5)URL.revokeObjectURL(takes.shift()!.url);$('takes').replaceChildren(...takes.map((t,i)=>new Option(`Take ${i+1} · ${new Date(Number(t.id)).toLocaleTimeString()}`,t.id)));$('takes').value=id;selectedTake();$('record-status').textContent=`Take ready · ${(blob.size/1024).toFixed(0)} KB. Download to keep it.`;};
 r.start(500);recordTimer=setTimeout(stopRecord,5*60*1000);$('record').disabled=true;$('record-stop').disabled=false;$('record-status').textContent='Recording guitar USB audio…';}catch(e){recorder=null;$('record-status').textContent=errorText(e);}};
 $('record-stop').onclick=stopRecord;
 $('delete-takes').onclick=()=>{if(recorder){$('record-status').textContent='Finish recording before deleting takes.';return;}$('playback').pause();$('playback').removeAttribute('src');$('playback').load();takes.forEach(t=>URL.revokeObjectURL(t.url));takes=[];$('takes').replaceChildren(new Option('No recordings yet',''));$('download').hidden=true;$('record-status').textContent='Takes deleted from this tab.';};
 const setupIds=['phrase','bpm','latency','bend-string','bend-fret','bend-step'] as const;
 $('save-setup').onclick=()=>{try{localStorage.setItem('guitar-lab-setup',JSON.stringify(Object.fromEntries(setupIds.map(id=>[id,$(id).value]))));$('setup-status').textContent='Practice setup saved locally. No pedal settings were changed.';}catch{$('setup-status').textContent='Local storage unavailable.';}};
 $('load-setup').onclick=()=>{try{const s=JSON.parse(localStorage.getItem('guitar-lab-setup') || 'null');if(!s)throw new Error('No saved setup.');for(const id of setupIds){if(typeof s[id]!=='string')throw new Error('Invalid saved setup.');}if(!PHRASES.some(p=>String(p.id)===s.phrase)||!['0','1','2','3','4','5'].includes(s['bend-string'])||!['1','2'].includes(s['bend-step'])||!Number.isFinite(Number(s.bpm))||Number(s.bpm)<30||Number(s.bpm)>240||!Number.isFinite(Number(s.latency))||Math.abs(Number(s.latency))>500||!Number.isInteger(Number(s['bend-fret']))||Number(s['bend-fret'])<0||Number(s['bend-fret'])>19)throw new Error('Invalid saved setup.');setupIds.forEach(id=>$(id).value=s[id]);$('phrase').dispatchEvent(new Event('change'));bendLabel();void stopMetro();$('setup-status').textContent='Practice setup recalled. Start the phrase/metronome when ready. Pedal unchanged.';}catch(e){$('setup-status').textContent=errorText(e);}};
 $('clear-progress').onclick=()=>{if(!confirm('Clear local practice progress? Recordings and saved setup are not affected.'))return;stats={phrases:0,matched:0,skipped:0,bends:0,timing:[]};save();};
 $('export-progress').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({exportedAt:new Date().toISOString(),...stats},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='guitar-lab-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};progress();
 let learning=false,foot: {data: string; action: string} | null=null,footAt=-Infinity;
 $('foot-learn').onclick=()=>{learning=true;$('foot-status').textContent='Waiting for one non-tuner CC or Program Change. Press the intended switch once. Mapping lasts for this tab only.';};
 $('foot-clear').onclick=()=>{foot=null;learning=false;$('foot-status').textContent='Footswitch mapping cleared.';};
 window.addEventListener('pedal-message',e=>{const d=e.detail;if(!Array.isArray(d)||!((d[0]&240)===176&&d.length===3&&! [69,70,71,72].includes(d[1])||(d[0]&240)===192&&d.length===2))return;
 if(learning){foot={data:d.join(','),action:$('foot-action').value};learning=false;footAt=performance.now();$('foot-status').textContent=`Mapped ${d.map(v=>v.toString(16)).join(' ')} → ${foot.action}. No MIDI commands are sent by this mapping.`;return;}
 if(foot?.data===d.join(',')&&performance.now()-footAt>350){footAt=performance.now();if(foot.action==='next')$('lesson-next').click();else startLesson();}});
 const onset=new OnsetDetector();
 function sample(result: PitchResult | null,now: number,mode: AudioMode){
  const allowed=mode==='live'&&$('playback').paused;if(!allowed)bendArmed=false;const frequency=allowed?result?.frequency:null;
  const attack=onset.update(allowed?result?.level??-90:-90,now);
  if(attack)timing(now,'Audio');
  if(running&&allowed&&tracker){if(completeAt){if(now>=completeAt){tracker=new PhraseTracker(chosen().notes);phraseSkips=0;completeAt=0;showLesson();}}else if(tracker.update(frequency,now,attack)){stats.matched++;finish(now);save();}}
  else if(tracker){tracker.since=null;tracker.last=null;}
  const b=bendConfig(),exact=frequency?69+12*Math.log2(frequency/440):null,cents=exact===null?null:(exact-b.target)*100;
  if(exact!==null&&Math.abs(exact-b.base)<.2)bendArmed=true;
  if(hold.update(bendArmed&&cents!==null&&Math.abs(cents)<=15,now)){stats.bends++;bendArmed=false;hold.reset();save();}
  $('bend-reading').textContent=cents===null?'Play the starting note':`${Math.round(cents)>0?'+':''}${Math.round(cents)} cents from target${bendArmed?' · armed':''}`;
  trace.push(cents);if(trace.length>100)trace.shift();const c=$('bend-chart'),ctx=c.getContext('2d')!;ctx.clearRect(0,0,c.width,c.height);ctx.strokeStyle='#71846a';ctx.beginPath();ctx.moveTo(0,60);ctx.lineTo(c.width,60);ctx.stroke();ctx.strokeStyle='#c0ed89';ctx.beginPath();let pen=false;trace.forEach((v,i)=>{if(v===null){pen=false;return;}const x=i/99*c.width,y=Math.max(0,Math.min(180,60-v*.4));if(pen)ctx.lineTo(x,y);else ctx.moveTo(x,y);pen=true;});ctx.stroke();
 }
 function stopped(){stopRecord();running=false;completeAt=0;showLesson();hold.reset();bendArmed=false;sample(null,performance.now(),'idle');}
 window.addEventListener('pagehide',()=>{stopRecord();void stopMetro();takes.forEach(t=>URL.revokeObjectURL(t.url));});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){void stopMetro();running=false;showLesson();}});
 return {sample,stopped};
}
