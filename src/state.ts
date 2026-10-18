import definitions from './scenes.json';
import type { SceneDefinition, ShowState, Look, NumericLookKey } from './types';
export const scenes: SceneDefinition[] = definitions;
export const sceneById = new Map(scenes.map(s => [s.id, s]));
export const defaultLook = (): Look => ({ particles: 72000, pointSize: 2.1, bloom: 0.45, brightness: 1.6,
    scatter: 1.4, radius: 0.24, returnSpeed: 2.6, transition: 1.5,
    drift: 20, breathing: 10, breathPeriod: 10, trails: 0.3,
    handIntensity: 1, footIntensity: 1, response: 'repel',
    silhouetteFill: 0.025, outline: 0.8, detail: 0.28 });
export const defaultState = (): ShowState => ({
  version: 2, sceneId: scenes[0].id, order: scenes.map(s => s.id), labels: {}, look: defaultLook(),
  sceneLooks: Object.fromEntries(scenes.map(s=>[s.id,defaultLook()])),
  durations: Object.fromEntries(scenes.map(s=>[s.id,30])),
  motion: {anchor: Date.now(), elapsed: 0},
  calibration: { mirror: true, left: 0, right: 1, top: 0, bottom: 1 },
  blackout: false, freeze: false,
});
export const limits: Record<NumericLookKey, [number, number]> = {
  particles: [12000, 90000], pointSize: [0.7, 3.5], bloom: [0, 1.8], brightness: [0.25, 2.5],
  scatter: [0, 4], radius: [0.06, 0.65], returnSpeed: [0.5, 8], transition: [0.2, 5],
  silhouetteFill: [0, 0.65], outline: [0.5, 4], detail: [0, 1],
  drift: [0,100], breathing: [0,100], breathPeriod: [4,30], trails: [0,2.5],
  handIntensity: [0,3], footIntensity: [0,3],
};
export function sanitizeLook(input: unknown, fallback = defaultLook()): Look {
  const next={...fallback};
  if(!input||typeof input!=='object')return next;
  const raw=input as Partial<Look>;
  for(const key of Object.keys(limits) as NumericLookKey[]){
    const value=raw[key];
    if(typeof value==='number'&&Number.isFinite(value))next[key]=Math.max(limits[key][0],Math.min(limits[key][1],value));
  }
  next.particles=Math.round(next.particles);
  if(raw.response==='repel'||raw.response==='attract')next.response=raw.response;
  return next;
}
export function saveSceneLook(state: ShowState) { state.sceneLooks[state.sceneId]={...state.look}; }
export function activateScene(state: ShowState, id: string) {
  if(!sceneById.has(id))return;
  saveSceneLook(state);state.sceneId=id;state.look={...state.sceneLooks[id]};
}
export function copyLookToAll(state: ShowState) {
  for(const scene of scenes)state.sceneLooks[scene.id]={...state.look};
}
export function sanitizeState(input: unknown): ShowState {
  const next = defaultState();
  if (!input || typeof input !== 'object') return next;
  const raw = input as Partial<ShowState>;
  if (typeof raw.sceneId === 'string' && sceneById.has(raw.sceneId)) next.sceneId = raw.sceneId;
  if (Array.isArray(raw.order)) {
    const unique = [...new Set(raw.order.filter((id): id is string => typeof id === 'string' && sceneById.has(id) && id !== 'silhouette'))];
    next.order = [...unique, ...next.order.filter(id => id !== 'silhouette' && !unique.includes(id)), 'silhouette'];
  }
  const legacyLook=sanitizeLook(raw.look);
  for(const scene of scenes){
    next.sceneLooks[scene.id]=sanitizeLook(raw.sceneLooks?.[scene.id],raw.version===2?defaultLook():legacyLook);
    const duration=raw.durations?.[scene.id];
    if(typeof duration==='number'&&Number.isFinite(duration))next.durations[scene.id]=Math.max(3,Math.min(600,Math.round(duration)));
  }
  next.look=raw.look?sanitizeLook(raw.look):{...next.sceneLooks[next.sceneId]};saveSceneLook(next);
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
  if(typeof raw.motion?.anchor==='number'&&Number.isFinite(raw.motion.anchor))next.motion.anchor=raw.motion.anchor;
  if(typeof raw.motion?.elapsed==='number'&&Number.isFinite(raw.motion.elapsed))next.motion.elapsed=Math.max(0,Math.min(1e9,raw.motion.elapsed));
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
  saveSceneLook(state);
  try { localStorage.setItem(storageKey, JSON.stringify(state)); return true; } catch { return false; }
}
