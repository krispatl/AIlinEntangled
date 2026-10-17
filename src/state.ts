import definitions from './scenes.json';
import type { SceneDefinition, ShowState, Look } from './types';
export const scenes: SceneDefinition[] = definitions;
export const sceneById = new Map(scenes.map(s => [s.id, s]));
export const defaultState = (): ShowState => ({
  version: 1, sceneId: scenes[0].id, order: scenes.map(s => s.id), labels: {},
  look: { particles: 72000, pointSize: 2.1, bloom: 0.45, brightness: 1.6,
    scatter: 1.4, radius: 0.24, returnSpeed: 2.6, transition: 1.5,
    silhouetteFill: 0.025, outline: 0.8, detail: 0.28 },
  calibration: { mirror: true, left: 0, right: 1, top: 0, bottom: 1 },
  blackout: false, freeze: false,
});
export const limits: Record<keyof Look, [number, number]> = {
  particles: [12000, 90000], pointSize: [0.7, 3.5], bloom: [0, 1.8], brightness: [0.25, 2.5],
  scatter: [0, 4], radius: [0.06, 0.65], returnSpeed: [0.5, 8], transition: [0.2, 5],
  silhouetteFill: [0, 0.65], outline: [0.5, 4], detail: [0, 1],
};
export function sanitizeState(input: unknown): ShowState {
  const next = defaultState();
  if (!input || typeof input !== 'object') return next;
  const raw = input as Partial<ShowState>;
  if (typeof raw.sceneId === 'string' && sceneById.has(raw.sceneId)) next.sceneId = raw.sceneId;
  if (Array.isArray(raw.order)) {
    const unique = [...new Set(raw.order.filter((id): id is string => typeof id === 'string' && sceneById.has(id) && id !== 'silhouette'))];
    next.order = [...unique, ...next.order.filter(id => id !== 'silhouette' && !unique.includes(id)), 'silhouette'];
  }
  for (const key of Object.keys(limits) as (keyof Look)[]) {
    const value = raw.look?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) next.look[key] = Math.max(limits[key][0], Math.min(limits[key][1], value));
  }
  next.look.particles = Math.round(next.look.particles);
  if (raw.calibration && typeof raw.calibration === 'object') {
    for (const key of ['left', 'right', 'top', 'bottom'] as const) {
      const value = raw.calibration[key];
      if (typeof value === 'number' && Number.isFinite(value)) next.calibration[key] = Math.max(0, Math.min(1, value));
    }
    if (next.calibration.right - next.calibration.left < 0.2) { next.calibration.left = 0; next.calibration.right = 1; }
    if (next.calibration.bottom - next.calibration.top < 0.2) { next.calibration.top = 0; next.calibration.bottom = 1; }
    if (typeof raw.calibration.mirror === 'boolean') next.calibration.mirror = raw.calibration.mirror;
  }
  if (raw.labels && typeof raw.labels === 'object') for (const s of scenes) {
    const value = raw.labels[s.id];
    if (typeof value === 'string' && value.trim()) next.labels[s.id] = value.trim().slice(0, 48);
  }
  next.blackout = raw.blackout === true; next.freeze = raw.freeze === true;
  return next;
}
export function reorderScene(order: string[], id: string, direction: number): string[] {
  if (id === 'silhouette') return [...order];
  const index = order.indexOf(id), target = index + direction;
  if (index < 0 || target < 0 || target >= order.length - 1) return [...order];
  const result = [...order]; [result[index], result[target]] = [result[target], result[index]];
  return result;
}
export const sceneTitle = (state: ShowState, id: string) => state.labels[id] || sceneById.get(id)?.title || id;
export const session = new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('session')?.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'main';
export const storageKey = `ailin-show-v1:${session}`;
export function loadState(): ShowState {
  try { return sanitizeState(JSON.parse(localStorage.getItem(storageKey) || 'null')); } catch { return defaultState(); }
}
export function persistState(state: ShowState): boolean {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); return true; } catch { return false; }
}
