import type { TrackingFrame, Landmark } from './types';
import { deriveJoints } from './tracking-math';
export function demoFrame(time: number): TrackingFrame {
  const t = time * 0.001, cx = 0.5 + Math.sin(t * 0.32) * 0.12;
  const point = (x: number, y: number): Landmark => ({ x, y, z: 0, visibility: 1, presence: 1 });
  const pose = Array.from({ length: 33 }, () => point(cx, 0.3));
  pose[0] = point(cx, 0.21);
  pose[11] = point(cx - 0.07, 0.33); pose[12] = point(cx + 0.07, 0.33);
  pose[13] = point(cx - 0.17, 0.34 + Math.sin(t * 0.8) * 0.12);
  pose[14] = point(cx + 0.17, 0.34 + Math.cos(t * 0.8) * 0.12);
  for (const i of [15, 17, 19, 21]) pose[i] = point(cx - 0.27, 0.35 + Math.sin(t * 0.8) * 0.22);
  for (const i of [16, 18, 20, 22]) pose[i] = point(cx + 0.27, 0.35 + Math.cos(t * 0.8) * 0.22);
  pose[23] = point(cx - 0.04, 0.54); pose[24] = point(cx + 0.04, 0.54);
  pose[25] = point(cx - 0.075, 0.68); pose[26] = point(cx + 0.075 + Math.sin(t * 0.7) * 0.1, 0.68);
  for (const i of [27, 29, 31]) pose[i] = point(cx - 0.10, 0.86);
  for (const i of [28, 30, 32]) pose[i] = point(cx + 0.13 + Math.sin(t * 0.7) * 0.16, 0.8 + Math.cos(t * 0.7) * 0.06);
  const canvas = new OffscreenCanvas(256, 144), ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'white'; ctx.strokeStyle = 'white'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.ellipse(cx * 256, 0.225 * 144, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();ctx.moveTo(pose[11].x*256,pose[11].y*144);ctx.lineTo(pose[12].x*256,pose[12].y*144);
  ctx.lineTo(pose[24].x*256,pose[24].y*144);ctx.lineTo(pose[23].x*256,pose[23].y*144);ctx.closePath();ctx.fill();
  ctx.lineWidth = 13;
  const segment = (a: number, b: number) => { ctx.beginPath(); ctx.moveTo(pose[a].x * 256, pose[a].y * 144); ctx.lineTo(pose[b].x * 256, pose[b].y * 144); ctx.stroke(); };
  segment(11, 23); segment(12, 24); segment(11, 12); segment(23, 24);
  ctx.lineWidth = 7;
  for (const [a,b] of [[11,13],[13,15],[12,14],[14,16],[23,25],[25,27],[24,26],[26,28]]) segment(a,b);
  const rgba = ctx.getImageData(0,0,256,144).data, mask = new Uint8Array(256*144), gray = new Uint8Array(256*144);
  for (let i=0;i<mask.length;i++) { mask[i]=rgba[i*4+3]; gray[i]=mask[i] ? 160 : 0; }
  return { timestamp: Date.now(), joints: deriveJoints(pose), landmarks: pose, mask, gray,
    width: 256, height: 144, inferenceMs: 0, handsRefined: false, demo: true };
}
