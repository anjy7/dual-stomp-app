import { element, errorText } from './dom.js';
// Views share their original DOM nodes: navigation never recreates media/MIDI owners.
export function mountNavigation(){
 const $ = element;
 for(const [source,target]of [['studio-lessons','tool-lessons'],['studio-bends','tool-bends'],['studio-timing','tool-timing'],['studio-takes','view-recordings'],['studio-progress','settings-progress'],['studio-foot','settings-foot']] as const)$(target).append($(source));
 $('studio').remove();
 const controls=document.querySelector('.pedal-controls')!;$('tool-tone').append(controls);
 const connection=document.createElement('div');connection.className='midi-connection';connection.setAttribute('aria-label','MIDI connection');$('pedal-connect').textContent='Connect MIDI';connection.append($('pedal-connect'),$('pedal-disconnect'),$('pedal-status'));$('view-pedal').prepend(connection);
 // Supporting explanations stay available without competing with the main task.
 for(const id of ['studio-lessons','studio-bends','studio-timing','studio-takes'] as const){
  const section=$(id),hint=section.querySelector(':scope > p.muted:last-child');if(!hint)continue;const detail=document.createElement('details'),summary=document.createElement('summary');summary.textContent=id==='studio-takes'?'Storage & playback details':'How this works';detail.append(summary,hint);section.append(detail);
 }
 const names={practice:'Practice',pedal:'Pedal',recordings:'Recordings',settings:'Settings'},captions={practice:'One thing at a time.',pedal:'Shape your sound. Keep your presets safe.',recordings:'Listen back. Hear your progress.',settings:'Set up once. Make yourself at home.'};
 function render(focus=false){
  const parts=location.hash.replace(/^#\/?/,'').split('/'),page=Object.hasOwn(names,parts[0])?parts[0] as keyof typeof names:'practice';
  const tool=page==='practice'&&['bends','timing','notes'].includes(parts[1])?parts[1]:'lessons';const pedalTool=page==='pedal'&&parts[1]==='tuner'?'tuner':'tone';
  const canonical=`#/${page}${page==='practice'&&tool!=='lessons'?'/'+tool:page==='pedal'&&pedalTool==='tuner'?'/tuner':''}`;
  if(location.hash!==canonical)history.replaceState(null,'',canonical);
  for(const el of document.querySelectorAll<HTMLElement>('[data-view]'))el.hidden=el.dataset.view!==page;
  for(const el of document.querySelectorAll<HTMLElement>('[data-practice-tool]'))el.hidden=el.dataset.practiceTool!==tool;
  for(const el of document.querySelectorAll<HTMLElement>('[data-pedal-view]'))el.hidden=el.dataset.pedalView!==pedalTool;
  for(const [selector,key,current]of [['[data-page]','page',page],['[data-tool]','tool',tool],['[data-pedal-tool]','pedalTool',pedalTool]])for(const a of document.querySelectorAll<HTMLElement>(selector)){if(a.dataset[key]===current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
  $('page-title').textContent=names[page];$('page-caption').textContent=captions[page];document.title=`${names[page]} · Guitar Lab`;
  if(focus){$('page-title').focus({preventScroll:true});window.scrollTo(0,0);}
 }
 function activity(){ $('record-activity').hidden=$('record-stop').disabled;$('metro-activity').hidden=$('metro').textContent!=='Stop metronome';$('midi-activity').hidden=$('pedal-disconnect').disabled; }
 const observer=new MutationObserver(activity);for(const id of ['record-stop','metro','pedal-disconnect'] as const)observer.observe($(id),{attributes:true,childList:true,subtree:true,characterData:true});activity();
 window.addEventListener('hashchange',()=>render(true));render();
}
