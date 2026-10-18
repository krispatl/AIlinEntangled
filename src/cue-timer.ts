import type { ShowState } from './types';

/** Operator-owned transport. It never auto-starts on reload or skips overdue scenes. */
export class CueTimer {
  running=false; finished=false; remaining=0;
  private sceneId=''; private lastTime=0;
  start(state:ShowState,now:number) {
    if(this.sceneId!==state.sceneId||this.remaining<=0)this.reset(state);
    this.running=true;this.finished=false;this.lastTime=now;
  }
  pause(){this.running=false;}
  reset(state:ShowState){this.running=false;this.finished=false;this.sceneId=state.sceneId;this.remaining=state.durations[state.sceneId];}
  tick(state:ShowState,now:number): string | undefined {
    const elapsed=Math.max(0,(now-this.lastTime)/1000);this.lastTime=now;
    if(!this.running)return;
    if(state.sceneId!==this.sceneId){this.reset(state);return;}
    if(state.blackout||state.freeze)return;
    this.remaining=Math.max(0,this.remaining-elapsed);
    if(this.remaining>0)return;
    const next=state.order[state.order.indexOf(state.sceneId)+1];
    if(!next){this.running=false;this.finished=true;return;}
    this.sceneId=next;this.remaining=state.durations[next];
    return next;
  }
}
