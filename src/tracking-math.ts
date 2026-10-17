import type { Calibration, Joint, Landmark } from './types';
export function projectPoint(x: number, y: number, c: Calibration): { x: number; y: number } {
  const u = (x - c.left) / (c.right - c.left);
  return { x: c.mirror ? 1 - u : u, y: (y - c.top) / (c.bottom - c.top) };
}
export function deriveJoints(pose: Landmark[], hands: Landmark[][] = []): Joint[] {
  if (pose.length < 33) return [];
  const groups = [
    ['leftHand', [15, 17, 19]], ['rightHand', [16, 18, 20]],
    ['leftFoot', [27, 29, 31]], ['rightFoot', [28, 30, 32]],
  ] as const;
  const joints: Joint[] = groups.map(([name, indices]) => {
    const points = indices.map(i => pose[i]);
    return { name, x: points.reduce((a, p) => a + p.x, 0) / 3,
      y: points.reduce((a, p) => a + p.y, 0) / 3,
      confidence: Math.min(...points.map(p => Math.min(p.visibility ?? 1, p.presence ?? 1))) };
  });
  const used = new Set<number>();
  for (let side = 0; side < 2; side++) {
    const wrist = pose[15 + side]; let best = -1, distance = 0.14;
    hands.forEach((hand, i) => {
      if (used.has(i) || hand.length < 21) return;
      const d = Math.hypot(hand[0].x - wrist.x, hand[0].y - wrist.y);
      if (d < distance) { distance = d; best = i; }
    });
    if (best >= 0) {
      used.add(best); const hand = hands[best]; const palm = [hand[0], hand[5], hand[9], hand[17]];
      joints[side].x = palm.reduce((a, p) => a + p.x, 0) / 4;
      joints[side].y = palm.reduce((a, p) => a + p.y, 0) / 4;
      joints[side].confidence = Math.max(joints[side].confidence, wrist.visibility ?? 0);
    }
  }
  return joints.filter(j => j.confidence >= 0.55 && j.x >= 0 && j.x <= 1 && j.y >= 0 && j.y <= 1);
}
export class AdaptiveFilter {
  private value = 0; private derivative = 0; private time = 0; private initialized = false;
  reset() { this.initialized = false; }
  filter(value: number, time: number): number {
    if (!this.initialized || time - this.time > 300) {
      this.initialized = true; this.value = value; this.derivative = 0; this.time = time; return value;
    }
    const dt = Math.max(0.001, (time - this.time) / 1000);
    const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    this.derivative += alpha(1) * ((value - this.value) / dt - this.derivative);
    this.value += alpha(2.4 + 8 * Math.abs(this.derivative)) * (value - this.value);
    this.time = time; return this.value;
  }
}
export function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  const t = len > 0.000001 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  const x = px - ax - dx * t, y = py - ay - dy * t;
  return { x, y, distanceSquared: x * x + y * y };
}
