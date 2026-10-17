import { StageRenderer } from './renderer';
import { WebcamTracker, type TrackerStatus } from './tracker';
import { defaultState, loadState, persistState, reorderScene, sanitizeState, sceneById, session, limits } from './state';
import { demoFrame } from './demo';
import { t, spanishScenes, type Key, type Language } from './i18n';
import type { BusMessage, Look, TrackingFrame } from './types';

const escape = (text: string) => text.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function mountController(root: HTMLElement) {
  let state = loadState(), armed = state.sceneId, tab: 'movement'|'appearance'|'camera' = 'movement';
  let language: Language = 'en'; try { if(localStorage.getItem('ailin-language')==='es')language='es'; } catch {}
  let status: TrackerStatus = {phase:'idle',message:''}, devices: MediaDeviceInfo[] = [], selectedDevice = '', refine = true;
  let demo = false, demoTimer = 0, lastFrame: TrackingFrame|undefined, lastFrameAt = 0, heartbeatAt = 0, stageFps = 0;
  let notice = '', graphicsError = '', preview: StageRenderer|undefined, disposed = false;
  const tr = (key: Key) => t(language,key);
  const title = (id: string) => state.labels[id] || (language==='es' ? spanishScenes[id] : sceneById.get(id)?.title) || id;
  const bus = new BroadcastChannel(`ailin:${session}`);
  const stageHost = document.createElement('div'); stageHost.className = 'preview-canvas';
  const cameraHost = document.createElement('div'); cameraHost.className = 'camera-view';
  const video = document.createElement('video'); video.muted=true; video.playsInline=true;
  const overlay = document.createElement('canvas'); overlay.width=512;overlay.height=288;
  cameraHost.append(video,overlay);
  const tracker = new WebcamTracker(video,onFrame,s=>{status=s;render();void refreshDevices(false);});
  function broadcast() {
    if(!persistState(state))notice=tr('storage');
    preview?.applyState(state);bus.postMessage({type:'state',state});
  }
  function onFrame(frame: TrackingFrame) {
    lastFrame=frame;lastFrameAt=performance.now();preview?.receiveFrame(frame);bus.postMessage({type:'frame',frame});drawTracking(frame);
  }
  function drawTracking(frame: TrackingFrame) {
    const ctx=overlay.getContext('2d')!,w=overlay.width,h=overlay.height;
    ctx.clearRect(0,0,w,h);video.style.transform=state.calibration.mirror?'scaleX(-1)':'';
    const x=(n:number)=>(state.calibration.mirror?1-n:n)*w;
    if(frame.demo){
      const small=document.createElement('canvas');small.width=frame.width;small.height=frame.height;
      const sc=small.getContext('2d')!,pixels=sc.createImageData(frame.width,frame.height);
      for(let i=0;i<frame.mask.length;i++){pixels.data[i*4]=160;pixels.data[i*4+1]=175;pixels.data[i*4+2]=171;pixels.data[i*4+3]=frame.mask[i];}
      sc.putImageData(pixels,0,0);ctx.save();if(state.calibration.mirror){ctx.translate(w,0);ctx.scale(-1,1);}ctx.drawImage(small,0,0,w,h);ctx.restore();
    }
    ctx.strokeStyle='rgba(184,224,204,.5)';ctx.lineWidth=1.2;
    const links=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
    for(const [a,b] of links){const p=frame.landmarks[a],q=frame.landmarks[b];if(!p||!q||(p.visibility??1)<.5||(q.visibility??1)<.5)continue;ctx.beginPath();ctx.moveTo(x(p.x),p.y*h);ctx.lineTo(x(q.x),q.y*h);ctx.stroke();}
    for(const j of frame.joints){ctx.beginPath();ctx.arc(x(j.x),j.y*h,5,0,Math.PI*2);ctx.fillStyle='#cbf6d9';ctx.fill();ctx.strokeStyle='#16261a';ctx.stroke();}
    const c=state.calibration;ctx.strokeStyle='rgba(255,255,255,.65)';ctx.setLineDash([5,5]);
    const left=state.calibration.mirror?1-c.right:c.left;ctx.strokeRect(left*w,c.top*h,(c.right-c.left)*w,(c.bottom-c.top)*h);ctx.setLineDash([]);
  }
  function localizedStatus() {
    if(demo)return tr('demoHint');if(status.phase==='idle')return tr('cameraOff');
    if(status.phase==='live')return `${tr('cameraLive')} · ${status.backend || ''}`;
    const message=status.message;
    const key:Key=message.startsWith('Opening')?'opening':message.startsWith('Loading')?'loading':message.includes('denied')?'denied':message.includes('No webcam')?'noCamera':message.includes('in use')?'busy':message.includes('disconnected')?'disconnectedCamera':message.includes('timed out')?'timeout':message.includes('interrupted')?'interrupted':'failed';
    return tr(key);
  }
  function slider(key: keyof Look, step = .05) {
    return `<label class="slider-label" for="look-${key}"><span>${tr(key)}</span><output id="value-${key}">${format(state.look[key])}</output></label><input id="look-${key}" data-look="${key}" type="range" min="${limits[key][0]}" max="${limits[key][1]}" step="${step}" value="${state.look[key]}">`;
  }
  function format(value:number){return Number.isInteger(value)?String(value):value.toFixed(2).replace(/0$/,'');}
  function settings() {
    if(tab==='movement')return `<p class="panel-copy">${tr('movementHint')}</p>${slider('scatter')}${slider('radius',.01)}${slider('returnSpeed',.1)}${slider('transition',.1)}<div class="setting-divider"></div><div class="switch-row"><span>${tr('mirror')}</span><input type="checkbox" id="mirror" ${state.calibration.mirror?'checked':''} aria-label="${tr('mirror')}"></div>`;
    if(tab==='appearance')return `${slider('bloom')}${slider('pointSize')}${slider('brightness')}<label class="slider-label" for="density">${tr('particles')}</label><select id="density">${[12000,24000,48000,72000,90000].map(n=>`<option value="${n}" ${state.look.particles===n?'selected':''}>${n.toLocaleString(language)}</option>`).join('')}</select><div class="setting-divider"></div>${slider('silhouetteFill',.01)}${slider('outline',.1)}${slider('detail')}<button class="text-button" data-action="reset-look">↺ ${tr('reset')}</button>`;
    return `<label class="field-label" for="device">${tr('device')}</label><div class="device-row"><select id="device"><option value="">${tr('defaultCamera')}</option>${devices.map((d,i)=>`<option value="${escape(d.deviceId)}" ${selectedDevice===d.deviceId?'selected':''}>${escape(d.label||`${tr('cameraNumber')} ${i+1}`)}</option>`).join('')}</select><button class="icon-button" data-action="refresh" aria-label="${tr('refresh')}" title="${tr('refresh')}">↻</button></div><label class="switch-row">${tr('refine')}<input type="checkbox" id="refine" ${refine?'checked':''} ${status.phase==='live'||status.phase==='loading'?'disabled':''}></label><p class="panel-copy">${tr('startHint')}</p><div class="setting-divider"></div><h3>${tr('calibration')}</h3><p class="panel-copy">${tr('cropHint')}</p>${(['left','right','top','bottom'] as const).map(k=>`<label class="slider-label" for="crop-${k}"><span>${tr(k)}</span><output id="crop-value-${k}">${Math.round(state.calibration[k]*100)}%</output></label><input id="crop-${k}" data-crop="${k}" type="range" min="${k==='right'||k==='bottom'?.25:0}" max="${k==='left'||k==='top'?.75:1}" step=".01" value="${state.calibration[k]}">`).join('')}<button class="text-button" data-action="reset-crop">↺ ${tr('resetCrop')}</button>`;
  }
  function render() {
    document.documentElement.lang=language;document.title='AILIN · '+tr('console');
    root.innerHTML=`<header class="header"><a class="brand" href="/control" aria-label="AILIN Entangled"><span class="brand-symbol">◎</span><span>AILIN <em>ENTANGLED</em></span></a><span class="header-caption">${tr('console')}</span><div class="header-actions"><div class="language" role="group" aria-label="${tr('language')}"><button data-language="en" class="${language==='en'?'active':''}" aria-pressed="${language==='en'}">EN</button><button data-language="es" class="${language==='es'?'active':''}" aria-pressed="${language==='es'}">ES</button></div><button class="projection-button" data-action="projection">↗ <span>${tr('projection')}</span></button></div></header>
    <main class="workspace"><aside class="sequence"><div class="section-heading"><div><p class="eyebrow">01 / ${tr('scenes')}</p><p class="muted small">${tr('scenesSub')}</p></div><span class="count">17</span></div><div class="scene-list" role="list" aria-label="${tr('scenes')}">${state.order.map((id,i)=>{const scene=sceneById.get(id)!;return `<button role="listitem" class="scene ${armed===id?'selected':''} ${state.sceneId===id?'is-live':''}" data-scene="${id}" aria-label="${i+1}. ${escape(title(id))}" ${state.sceneId===id?'aria-current="true"':''}><span class="scene-number">${String(i+1).padStart(2,'0')}</span>${scene.image?`<img src="${scene.image}" alt="" loading="lazy">`:'<span class="body-icon">♧</span>'}<span class="scene-name">${escape(title(id))}<small>${state.sceneId===id?tr('live'):id==='silhouette'?tr('finale'):armed===id?tr('armed'):''}</small></span><span class="scene-dot"></span></button>`;}).join('')}</div><div class="sequence-footer"><label class="field-label" for="scene-name">${tr('rename')}</label><div class="rename-row"><input id="scene-name" maxlength="48" value="${escape(title(armed))}"><button class="icon-button" data-action="up" aria-label="${tr('up')}" ${armed==='silhouette'?'disabled':''}>↑</button><button class="icon-button" data-action="down" aria-label="${tr('down')}" ${armed==='silhouette'?'disabled':''}>↓</button></div></div></aside>
    <section class="program"><div class="monitor-heading"><p class="eyebrow">02 / ${tr('preview')}</p><span id="projection-status" class="connection"></span></div><div id="preview-slot" class="preview-shell"></div><div class="monitor-caption"><span><i class="live-dot"></i> <b id="program-title">${escape(title(state.sceneId))}</b></span><span class="mono" id="fps">— FPS</span></div><div class="cue-deck"><div class="cue-info"><span class="eyebrow">${tr('cue')} ${String(state.order.indexOf(armed)+1).padStart(2,'0')}</span><strong>${escape(title(armed))}</strong></div><div class="cue-buttons"><button class="icon-button" data-action="previous" aria-label="${tr('previous')}">←</button><button class="go-button" data-action="go">${tr('go')} <span>↵</span></button><button class="icon-button" data-action="next" aria-label="${tr('next')}">→</button></div></div><div class="transport"><button data-action="freeze" class="${state.freeze?'engaged':''}" aria-pressed="${state.freeze}">${state.freeze?'▶':'Ⅱ'} ${tr(state.freeze?'resume':'freeze')} <kbd>P</kbd></button><button data-action="blackout" class="${state.blackout?'blackout-active':''}" aria-pressed="${state.blackout}">● ${tr(state.blackout?'restore':'blackout')} <kbd>B</kbd></button></div>
    <section class="input-panel"><div class="input-visual"><div id="camera-slot"></div><span class="camera-tag">${demo?'DEMO':tr('local')}</span></div><div class="input-info"><p class="eyebrow">${tr('input')}</p><p id="tracking-label" class="tracking-label"></p><div class="joint-grid">${(['leftHand','rightHand','leftFoot','rightFoot'] as const).map(k=>`<span id="joint-${k}" class="joint"><i></i>${tr(k)}</span>`).join('')}</div><div class="camera-actions"><button class="small-button" data-action="camera">${tr(status.phase==='live'||status.phase==='loading'?'stop':'start')}</button><label class="demo-toggle"><input id="demo" type="checkbox" ${demo?'checked':''}>${tr('demo')}</label></div></div></section><p class="status-message ${status.phase==='error'?'error':''}" id="status-message" role="status"></p><p class="help-text">${tr('help')}</p><div class="notice" id="notice" role="status">${escape(notice||graphicsError)}</div></section>
    <aside class="controls"><div class="section-heading"><p class="eyebrow">03 / ${tr('setup')}</p></div><div class="tabs" role="tablist">${(['movement','appearance','camera'] as const).map(k=>`<button role="tab" aria-selected="${tab===k}" data-tab="${k}" class="${tab===k?'active':''}">${tr(k)}</button>`).join('')}</div><div class="settings" role="tabpanel">${settings()}</div><div class="show-files"><button data-action="export">↓ ${tr('export')}</button><button data-action="import">↑ ${tr('import')}</button><input id="import-file" type="file" accept="application/json,.json" hidden aria-label="${tr('importHint')}"></div><p class="saved-note">${tr('saved')}</p></aside></main><footer><span>AILIN / ENTANGLED</span><span>${tr('shortcut')}</span><span>v1.0</span></footer>`;
    root.querySelector('#preview-slot')!.append(stageHost);root.querySelector('#camera-slot')!.append(cameraHost);
    if(!preview)try{preview=new StageRenderer(stageHost,state,true,message=>{graphicsError=message;});}catch(e){graphicsError=tr('support')+' '+String(e);}
    preview?.canvas.setAttribute('aria-label',language==='es'?'Visuales de la función en vivo':'Live performance visuals');
    if(lastFrame)drawTracking(lastFrame);updateStats();
  }
  function updateStats(){
    const live=performance.now()-heartbeatAt<3000&&heartbeatAt>0;
    const conn=root.querySelector('#projection-status');if(conn){conn.textContent=tr(live?'connected':'disconnected');conn.classList.toggle('connected',live);}
    const fps=root.querySelector('#fps');if(fps)fps.textContent=`${live?stageFps:preview?.fps||0} FPS`;
    const fresh=performance.now()-lastFrameAt<500;
    for(const key of ['leftHand','rightHand','leftFoot','rightFoot']){
      const found=fresh&&lastFrame?.joints.some(j=>j.name===key);const el=root.querySelector(`#joint-${key}`);el?.classList.toggle('found',!!found);el?.setAttribute('title',tr(found?'found':'missing'));
    }
    const label=root.querySelector('#tracking-label');if(label)label.textContent=demo?tr('demoHint'):fresh&&lastFrame?.joints.length?tr('tracking'):status.phase==='live'?tr('noBody'):tr('cameraOff');
    const message=root.querySelector('#status-message');if(message)message.textContent=localizedStatus()+(fresh&&lastFrame&&!demo?` · ${Math.round(lastFrame.inferenceMs)} ms`: '');
    const note=root.querySelector('#notice');if(note)note.textContent=notice||graphicsError;
    if(!fresh&&!demo)overlay.getContext('2d')?.clearRect(0,0,512,288);
  }
  async function refreshDevices(redraw=true){try{devices=await tracker.devices();if(redraw)render();}catch{notice=tr('failed');}}
  function stopDemo(){demo=false;clearInterval(demoTimer);demoTimer=0;}
  function go(){state.sceneId=armed;broadcast();render();}
  function select(offset:number){const index=state.order.indexOf(armed);armed=state.order[Math.max(0,Math.min(state.order.length-1,index+offset))];render();root.querySelector(`[data-scene="${armed}"]`)?.scrollIntoView({block:'nearest'});}
  root.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('button');if(!button)return;
    if(button.dataset.language){language=button.dataset.language as Language;try{localStorage.setItem('ailin-language',language);}catch{}notice='';render();return;}
    if(button.dataset.scene){armed=button.dataset.scene;render();return;}
    if(button.dataset.tab){tab=button.dataset.tab as typeof tab;render();return;}
    switch(button.dataset.action){
      case 'projection': { const popup=window.open(`/stage?session=${session}`,'ailin-projection','popup,width=1280,height=720');if(!popup)notice=tr('popup');break; }
      case 'go':go();return;
      case 'previous':select(-1);return;case 'next':select(1);return;
      case 'up':case 'down':state.order=reorderScene(state.order,armed,button.dataset.action==='up'?-1:1);broadcast();render();return;
      case 'blackout':state.blackout=!state.blackout;broadcast();render();return;
      case 'freeze':state.freeze=!state.freeze;broadcast();render();return;
      case 'camera':if(status.phase==='live'||status.phase==='loading'){tracker.stop();status={phase:'idle',message:''};render();}else{stopDemo();void tracker.start(selectedDevice,refine);}return;
      case 'refresh':void refreshDevices();return;
      case 'reset-look':state.look=defaultState().look;broadcast();render();return;
      case 'reset-crop':state.calibration=defaultState().calibration;broadcast();render();return;
      case 'export':{const blob=new Blob([JSON.stringify({app:'ailin-entangled',...state},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ailin-show.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break;}
      case 'import':(root.querySelector('#import-file') as HTMLInputElement).click();break;
    }
    updateStats();
  });
  root.addEventListener('input',event=>{
    const input=event.target as HTMLInputElement;
    if(input.dataset.look){const key=input.dataset.look as keyof Look;state.look[key]=Number(input.value);root.querySelector(`#value-${key}`)!.textContent=format(state.look[key]);broadcast();}
    if(input.dataset.crop){const key=input.dataset.crop as 'left'|'right'|'top'|'bottom';let value=Number(input.value);const c=state.calibration;
      if(key==='left')value=Math.min(value,c.right-.2);if(key==='right')value=Math.max(value,c.left+.2);if(key==='top')value=Math.min(value,c.bottom-.2);if(key==='bottom')value=Math.max(value,c.top+.2);
      c[key]=value;input.value=String(value);root.querySelector(`#crop-value-${key}`)!.textContent=Math.round(value*100)+'%';broadcast();if(lastFrame)drawTracking(lastFrame);}
  });
  root.addEventListener('change',async event=>{
    const input=event.target as HTMLInputElement;
    if(input.id==='mirror'){state.calibration.mirror=input.checked;broadcast();}
    if(input.id==='refine')refine=input.checked;
    if(input.id==='device')selectedDevice=input.value;
    if(input.id==='density'){state.look.particles=Number(input.value);broadcast();}
    if(input.id==='scene-name'){
      const name=input.value.trim();if(name)state.labels[armed]=name;else delete state.labels[armed];broadcast();
      const label=root.querySelector(`[data-scene="${armed}"] .scene-name`);
      if(label?.firstChild)label.firstChild.textContent=title(armed);
      root.querySelector('.cue-info strong')!.textContent=title(armed);
      root.querySelector('#program-title')!.textContent=title(state.sceneId);
    }
    if(input.id==='demo'){
      if(input.checked){tracker.stop();status={phase:'idle',message:''};demo=true;demoTimer=window.setInterval(()=>onFrame(demoFrame(performance.now())),1000/24);}else stopDemo();render();
    }
    if(input.id==='import-file'&&input.files?.[0]){
      try{const raw=JSON.parse(await input.files[0].text());if(raw.app!=='ailin-entangled'||raw.version!==1)throw new Error();state=sanitizeState(raw);armed=state.sceneId;broadcast();notice=tr('imported');}catch{notice=tr('invalid');}render();
    }
  });
  const keyboard=(event:KeyboardEvent)=>{
    if(event.ctrlKey||event.metaKey||event.altKey||['INPUT','SELECT','TEXTAREA','BUTTON'].includes((event.target as HTMLElement).tagName))return;
    if(event.code==='Space'){event.preventDefault();go();}else if(event.code==='ArrowRight'){event.preventDefault();select(1);}else if(event.code==='ArrowLeft'){event.preventDefault();select(-1);}else if(event.code==='KeyB'){state.blackout=!state.blackout;broadcast();render();}else if(event.code==='KeyP'){state.freeze=!state.freeze;broadcast();render();}
  };
  window.addEventListener('keydown',keyboard);
  bus.onmessage=({data}:MessageEvent<BusMessage>)=>{
    if(data.type==='hello'){bus.postMessage({type:'state',state});if(lastFrame)bus.postMessage({type:'frame',frame:lastFrame});}
    if(data.type==='heartbeat'){heartbeatAt=performance.now();stageFps=data.fps;if(data.error)graphicsError=data.error;}
  };
  render();broadcast();void refreshDevices(false);const statsTimer=setInterval(updateStats,200);
  window.addEventListener('beforeunload',()=>{if(disposed)return;disposed=true;stopDemo();tracker.stop();preview?.dispose();clearInterval(statsTimer);bus.close();window.removeEventListener('keydown',keyboard);});
}
