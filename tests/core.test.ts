import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, sanitizeState, reorderScene } from '../src/state.ts';
import { projectPoint, deriveJoints, AdaptiveFilter, distanceToSegment } from '../src/tracking-math.ts';
import type { Landmark } from '../src/types.ts';
test('imports clamp unsafe settings, remove duplicate cues, and keep the body finale last',()=>{
  const state=sanitizeState({sceneId:'missing',order:['silhouette','torus','torus','unknown'],look:{scatter:100,particles:1,bloom:NaN},calibration:{left:.8,right:.2}});
  assert.equal(state.order.length,17);assert.equal(new Set(state.order).size,17);
  assert.equal(state.order[0],'torus');assert.equal(state.order.at(-1),'silhouette');
  assert.equal(state.look.scatter,4);assert.equal(state.look.particles,12000);assert.equal(state.look.bloom,.45);
  assert.equal(state.calibration.left,0);assert.equal(state.calibration.right,1);
});
test('cue reordering never moves a particle after the finale',()=>{
  const order=defaultState().order;assert.deepEqual(reorderScene(order,'silhouette',-1),order);
  assert.deepEqual(reorderScene(order,order.at(-2)!,1),order);
  assert.equal(reorderScene(order,order[1],-1)[0],order[1]);
});
test('camera crop and mirroring map the same normalized stage coordinates',()=>{
  const crop={left:.2,right:.8,top:.1,bottom:.9,mirror:false};
  assert.deepEqual(projectPoint(.2,.1,crop),{x:0,y:0});
  assert.deepEqual(projectPoint(.8,.9,{...crop,mirror:true}),{x:0,y:1});
});
test('low-confidence limbs disappear instead of scattering unrelated particles',()=>{
  const pose:Landmark[]=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:.9,presence:1}));
  pose[29].visibility=.1;assert.equal(deriveJoints(pose).some(j=>j.name==='leftFoot'),false);
  assert.equal(deriveJoints(pose).length,3);assert.deepEqual(deriveJoints([]),[]);
});
test('hand refinement is associated with the nearest anatomical wrist',()=>{
  const pose:Landmark[]=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
  for(const i of [15,17,19])pose[i].x=.2;
  const hand:Landmark[]=Array.from({length:21},()=>({x:.22,y:.48,z:0}));
  const joints=deriveJoints(pose,[hand]);assert.equal(joints[0].x,.22);assert.equal(joints[1].x,.5);
});
test('fast motion interacts along the entire limb path and filters reset after loss',()=>{
  assert.ok(distanceToSegment(.5,.01,0,0,1,0).distanceSquared<.001);
  const filter=new AdaptiveFilter();assert.equal(filter.filter(.2,1000),.2);
  const smoothed=filter.filter(.21,1040);assert.ok(smoothed>.2&&smoothed<.21);
  assert.equal(filter.filter(.8,1600),.8);
});
