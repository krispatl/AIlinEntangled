export interface SceneDefinition { id: string; title: string; description: string; image: string; kind: string; source: string }
export type JointName = 'leftHand' | 'rightHand' | 'leftFoot' | 'rightFoot';
export interface Landmark { x: number; y: number; z: number; visibility?: number; presence?: number }
export interface Joint { name: JointName; x: number; y: number; confidence: number }
export interface TrackingFrame {
  timestamp: number; joints: Joint[]; landmarks: Landmark[];
  mask: Uint8Array; gray: Uint8Array; width: number; height: number;
  inferenceMs: number; handsRefined: boolean; demo: boolean;
}
export interface Calibration { mirror: boolean; left: number; right: number; top: number; bottom: number }
export interface Look {
  particles: number; pointSize: number; bloom: number; brightness: number;
  scatter: number; radius: number; returnSpeed: number; transition: number;
  silhouetteFill: number; outline: number; detail: number;
}
export interface ShowState {
  version: 1; sceneId: string; order: string[]; labels: Record<string, string>;
  look: Look; calibration: Calibration; blackout: boolean; freeze: boolean;
}
export type BusMessage = { type: 'state'; state: ShowState } | { type: 'frame'; frame: TrackingFrame }
  | { type: 'hello' } | { type: 'heartbeat'; fps: number; error?: string };
