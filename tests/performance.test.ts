import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, defaultLook, sanitizeState, activateScene, copyLookToAll } from '../src/state.ts';
import { motionTime, toggleFreeze, driftX, driftY, breathingScale, trailDecay, limbGain, radialDirection } from '../src/motion.ts';
import { CueTimer } from '../src/cue-timer.ts';

test('v1 shows preserve their global look across every migrated scene',()=>{
  const state=sanitizeState({version:1,sceneId:'torus',look:{scatter:2.8,bloom:.9},labels:{torus:'My cue'}});
  assert.equal(state.version,2);assert.equal(state.labels.torus,'My cue');
  for(const id of state.order){assert.equal(state.sceneLooks[id].scatter,2.8);assert.equal(state.sceneLooks[id].bloom,.9);}
  assert.equal(state.look.drift,20);assert.equal(state.look.response,'repel');
});
test('scene looks recall independently; copying produces independent presets',()=>{
  const state=defaultState();state.look.drift=75;state.look.response='attract';state.look.footIntensity=0;
  activateScene(state,'torus');assert.equal(state.look.drift,20);state.look.drift=4;
  activateScene(state,'orbital');assert.equal(state.look.drift,75);assert.equal(state.look.footIntensity,0);assert.equal(state.look.response,'attract');
  assert.equal(state.sceneLooks.torus.drift,4);
  copyLookToAll(state);state.look.drift=10;assert.equal(state.sceneLooks.torus.drift,75);
  activateScene(state,'torus');assert.equal(state.look.drift,75);assert.equal(state.sceneLooks.orbital.drift,10);
});
test('v2 imports clamp effects, durations and invalid response values',()=>{
  const state=sanitizeState({version:2,sceneId:'torus',sceneLooks:{torus:{drift:999,response:'invalid',trails:-2,handIntensity:99}},durations:{torus:1,seed:Infinity,tree:9999}});
  assert.equal(state.look.drift,100);assert.equal(state.look.response,'repel');assert.equal(state.look.trails,0);assert.equal(state.look.handIntensity,3);
  assert.equal(state.durations.torus,3);assert.equal(state.durations.seed,30);assert.equal(state.durations.tree,600);
});
test('idle drift is bounded, smooth, deterministic and exactly off at zero',()=>{
  for(let t=0;t<300;t+=.71){
    assert.equal(Math.abs(driftX(.4,.3,t,0)),0);assert.equal(Math.abs(driftY(.2,.7,t,0)),0);
    assert.ok(Math.abs(driftX(.4,.3,t,100))<=.06);assert.ok(Math.abs(driftY(.2,.7,t,100))<=.06);
    assert.ok(Math.abs(driftX(.4,.3,t+.016,100)-driftX(.4,.3,t,100))<.001);
  }
  assert.notEqual(driftX(.4,.3,0,100),driftX(.4,.3,2,100));
});
test('shared motion phase holds on freeze and resumes without elapsed-time jump',()=>{
  const state=defaultState();state.motion={anchor:1000,elapsed:0};
  assert.equal(motionTime(state,3000),2);toggleFreeze(state,3000);
  assert.equal(motionTime(state,9000),2);assert.equal(motionTime(sanitizeState(JSON.parse(JSON.stringify(state))),9000),2);
  toggleFreeze(state,11000);assert.equal(motionTime(state,12000),3);
});
test('breathing stays subtle and trails decay independently of frame rate',()=>{
  assert.equal(breathingScale(2,0,10),1);assert.equal(breathingScale(2.5,100,10),1.035);
  assert.ok(Math.abs(breathingScale(7.5,100,10)-.965)<1e-9);
  assert.equal(trailDecay(0,.016),0);
  assert.ok(Math.abs(trailDecay(1,1/60)**60-.1)<1e-9);
  assert.ok(Math.abs(trailDecay(1,1/30)**30-.1)<1e-9);
});
test('hand and foot gains can mute limbs independently; attraction reverses radial force',()=>{
  const look=defaultLook();look.scatter=2;look.handIntensity=1.5;look.footIntensity=0;
  assert.equal(limbGain(look,true),3);assert.equal(limbGain(look,false),0);
  assert.equal(radialDirection('repel'),1);assert.equal(radialDirection('attract'),-1);
});
test('cue timer pauses, resumes and holds through blackout/freeze',()=>{
  const state=defaultState();state.durations.orbital=5;const timer=new CueTimer();timer.reset(state);
  timer.start(state,1000);timer.tick(state,2000);assert.equal(timer.remaining,4);
  state.freeze=true;timer.tick(state,10000);assert.equal(timer.remaining,4);
  state.freeze=false;state.blackout=true;timer.tick(state,20000);assert.equal(timer.remaining,4);
  state.blackout=false;timer.tick(state,21000);assert.equal(timer.remaining,3);
  timer.pause();timer.tick(state,30000);assert.equal(timer.remaining,3);
  timer.start(state,40000);assert.equal(timer.tick(state,43000),'torus');
});
test('late timers advance only one cue and stop at the finale',()=>{
  const state=defaultState();const timer=new CueTimer();timer.start(state,0);
  const next=timer.tick(state,600000);assert.equal(next,'torus');activateScene(state,next!);
  assert.equal(timer.tick(state,600010),undefined);assert.ok(timer.remaining>29);
  activateScene(state,'silhouette');timer.reset(state);timer.start(state,700000);
  assert.equal(timer.tick(state,731000),undefined);assert.equal(timer.finished,true);assert.equal(timer.running,false);
  assert.equal(state.sceneId,'silhouette');
});
test('manual scene changes and duration resets never leave automatic cues running',()=>{
  const state=defaultState(),timer=new CueTimer();timer.start(state,0);timer.tick(state,1000);
  activateScene(state,'seed');timer.reset(state);assert.equal(timer.running,false);assert.equal(timer.remaining,30);
  state.durations.seed=12;timer.reset(state);assert.equal(timer.remaining,12);
});
