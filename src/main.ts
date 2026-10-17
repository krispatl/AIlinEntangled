import './style.css';
import { StageRenderer } from './renderer';
import { loadState, sanitizeState, session } from './state';
import type { BusMessage } from './types';

const root = document.querySelector<HTMLDivElement>('#app')!;
if (location.pathname.replace(/\/$/, '') === '/stage') {
  document.body.className = 'stage-page';
  document.title = 'AILIN · Projection';
  let state = loadState();
  const bus = new BroadcastChannel(`ailin:${session}`);
  let renderer: StageRenderer | undefined, error = '';
  try { renderer = new StageRenderer(root, state, false, message => { error = message; }); }
  catch (e) { error = String(e); }
  bus.onmessage = ({data}: MessageEvent<BusMessage>) => {
    if (data.type === 'state') { state = sanitizeState(data.state); renderer?.applyState(state); }
    if (data.type === 'frame') renderer?.receiveFrame(data.frame);
  };
  bus.postMessage({type:'hello'});
  const heartbeat = setInterval(() => bus.postMessage({type:'heartbeat',fps:renderer?.fps || 0,error}), 1000);
  const fullscreen = () => { if(!document.fullscreenElement) void root.requestFullscreen().catch(()=>{}); };
  root.addEventListener('dblclick',fullscreen);
  window.addEventListener('keydown',e=>{if(e.code==='KeyF'||e.code==='Enter')fullscreen();});
  window.addEventListener('beforeunload',()=>{clearInterval(heartbeat);renderer?.dispose();bus.close();});
} else {
  void import('./controller').then(({mountController})=>mountController(root));
}
