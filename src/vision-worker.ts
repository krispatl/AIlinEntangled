import { FilesetResolver, PoseLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import { deriveJoints } from './tracking-math';
import type { TrackingFrame } from './types';

let pose: PoseLandmarker | undefined, hands: HandLandmarker | undefined;
let canvas: OffscreenCanvas, context: OffscreenCanvasRenderingContext2D;
let backend = 'GPU';
const worker = self as unknown as { onmessage: ((event: MessageEvent) => void) | null; postMessage(message: unknown, transfer?: Transferable[]): void };

async function init(base: string, refine: boolean) {
  const vision = await FilesetResolver.forVisionTasks(`${base}/vision`);
  const options = {
    baseOptions: { modelAssetPath: `${base}/models/pose_landmarker_full.task`, delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const, numPoses: 1, minPoseDetectionConfidence: 0.55,
    minPosePresenceConfidence: 0.55, minTrackingConfidence: 0.6, outputSegmentationMasks: true,
  };
  try { pose = await PoseLandmarker.createFromOptions(vision, options); }
  catch { backend = 'CPU'; pose = await PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } }); }
  if (refine) {
    try { hands = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: `${base}/models/hand_landmarker.task`, delegate: backend as 'GPU' | 'CPU' },
      runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    }); } catch { worker.postMessage({ type: 'notice', message: 'Hand refinement unavailable. Full-body hand and foot tracking remains active.' }); }
  }
  canvas = new OffscreenCanvas(256, 144);
  context = canvas.getContext('2d', { willReadFrequently: true })!;
  worker.postMessage({ type: 'ready', backend, hands: !!hands });
}

worker.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try { await init(data.base, data.refine); }
    catch (error) { worker.postMessage({ type: 'error', message: `Tracking models could not start: ${String(error)}` }); }
    return;
  }
  if (data.type !== 'frame' || !pose) { data.bitmap?.close(); return; }
  const bitmap: ImageBitmap = data.bitmap;
  const start = performance.now();
  let detection: ReturnType<PoseLandmarker['detectForVideo']> | undefined;
  try {
    detection = pose.detectForVideo(bitmap, data.timestamp);
    const landmarks = detection.landmarks[0] || [];
    const handResult = hands && landmarks.length ? hands.detectForVideo(bitmap, data.timestamp) : undefined;
    const width = 256, height = Math.max(64, Math.round(width * bitmap.height / bitmap.width));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    context.drawImage(bitmap, 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data;
    const gray = new Uint8Array(width * height), mask = new Uint8Array(width * height);
    const segmentation = detection.segmentationMasks?.[0];
    const values = segmentation?.getAsFloat32Array();
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, k = i * 4;
      gray[i] = Math.round(rgba[k] * 0.2126 + rgba[k + 1] * 0.7152 + rgba[k + 2] * 0.0722);
      if (values && segmentation) {
        const sx = Math.min(segmentation.width - 1, Math.floor((x + 0.5) * segmentation.width / width));
        const sy = Math.min(segmentation.height - 1, Math.floor((y + 0.5) * segmentation.height / height));
        mask[i] = Math.round(Math.max(0, Math.min(1, values[sy * segmentation.width + sx])) * 255);
      }
    }
    const frame: TrackingFrame = {
      timestamp: Date.now(), joints: deriveJoints(landmarks, handResult?.landmarks || []),
      landmarks, mask, gray, width, height, inferenceMs: performance.now() - start,
      handsRefined: !!handResult?.landmarks.length, demo: false,
    };
    worker.postMessage({ type: 'frame', frame }, [mask.buffer, gray.buffer]);
  } catch (error) { worker.postMessage({ type: 'frame-error', message: String(error) }); }
  finally { detection?.close(); bitmap.close(); }
};
