import type { Look, ShowState } from './types';

// The shared wall-clock anchor lets independently opened windows use the same idle phase.
export function motionTime(state: ShowState, now = Date.now()) {
  return state.motion.elapsed + (state.freeze ? 0 : Math.max(0,now-state.motion.anchor)/1000);
}
export function toggleFreeze(state: ShowState, now = Date.now()) {
  state.motion={anchor:now,elapsed:motionTime(state,now)};
  state.freeze=!state.freeze;
}
// Maximum displacement is 3% of stage height; neighboring particles share a gentle current.
export function driftX(y:number, seed:number, time:number, amount:number) {
  return amount*.0006*(.65*Math.sin(time*.42+y*2.1)+.35*Math.sin(time*.65+seed*Math.PI*2));
}
export function driftY(x:number, seed:number, time:number, amount:number) {
  return amount*.0006*(.65*Math.cos(time*.35+x*1.9)+.35*Math.cos(time*.55+seed*Math.PI*2));
}
export const breathingScale=(time:number,amount:number,period:number)=>1+amount*.00035*Math.sin(time*Math.PI*2/period);
// Trail length is the time for a pixel to fade to 10%, independent of rendering FPS.
export const trailDecay=(seconds:number,dt:number)=>seconds<=0?0:Math.exp(-Math.LN10*dt/seconds);
export const limbGain=(look:Look,hand:boolean)=>look.scatter*(hand?look.handIntensity:look.footIntensity);
export const radialDirection=(response:Look['response'])=>response==='attract'?-1:1;
