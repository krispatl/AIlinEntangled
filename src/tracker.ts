import type { TrackingFrame } from './types';
export type TrackerStatus = { phase: 'idle' | 'loading' | 'live' | 'error'; message: string; backend?: string };
export class WebcamTracker {
  private worker?: Worker; private stream?: MediaStream; private busy = false;
  private active = false; private timer = 0; private generation = 0; private lastVideoTime = -1;
  private errors = 0;
  constructor(public video: HTMLVideoElement, private onFrame: (frame: TrackingFrame) => void,
    private onStatus: (status: TrackerStatus) => void) {}

  async devices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices) return [];
    return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
  }
  async start(deviceId: string, refine: boolean) {
    this.stop(); const generation = ++this.generation;
    this.onStatus({ phase: 'loading', message: 'Opening camera…' });
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access requires HTTPS or localhost and a supported browser.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false,
        video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
      if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream; this.video.srcObject = stream;
      await this.video.play();
      if (generation !== this.generation) return;
      this.active = true; this.errors = 0; this.lastVideoTime = -1;
      this.onStatus({ phase: 'loading', message: 'Loading local tracking models…' });
      const worker = this.worker = new Worker('/vision/worker.js');
      const startupTimeout = window.setTimeout(() => {
        if (generation === this.generation && this.active && this.timer === 0) {
          this.stop(); this.onStatus({ phase: 'error', message: 'Tracking startup timed out. Reload and try again in Chrome or Edge.' });
        }
      }, 45000);
      worker.onmessage = ({ data }) => {
        if (generation !== this.generation) return;
        if (data.type === 'ready') {
          clearTimeout(startupTimeout);
          this.onStatus({ phase: 'live', backend: data.backend, message: `${data.backend} tracking · ${data.hands ? 'hand refinement on' : 'full-body landmarks'}` });
          this.schedule();
        } else if (data.type === 'frame') { this.busy = false; this.errors = 0; this.onFrame(data.frame); }
        else if (data.type === 'error') { clearTimeout(startupTimeout); this.stop(); this.onStatus({ phase: 'error', message: data.message }); }
        else if (data.type === 'frame-error') {
          this.busy = false;
          if (++this.errors > 5) { this.stop(); this.onStatus({ phase: 'error', message: 'Tracking interrupted. Stop and restart the camera.' }); }
        }
      };
      worker.onerror = event => { clearTimeout(startupTimeout); this.stop(); this.onStatus({ phase: 'error', message: `Tracking worker failed: ${event.message || 'check browser support'}` }); };
      worker.postMessage({ type: 'init', base: location.origin, refine });
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (this.active) { this.stop(); this.onStatus({ phase: 'error', message: 'Camera disconnected. Reconnect it and start again.' }); }
      });
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      const e = error as DOMException;
      const message = e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow this site in the browser camera settings, then try again.'
        : e.name === 'NotFoundError' ? 'No webcam found. Connect a camera, refresh the device list, then start.'
        : e.name === 'NotReadableError' ? 'Camera is in use or unavailable. Close other camera apps and try again.' : e.message;
      this.onStatus({ phase: 'error', message });
    }
  }
  private schedule() {
    this.timer = window.setInterval(() => {
      if (!this.active || this.busy || this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return;
      this.lastVideoTime = this.video.currentTime; this.busy = true;
      const generation = this.generation;
      createImageBitmap(this.video).then(bitmap => {
        if (generation !== this.generation || !this.worker) { bitmap.close(); return; }
        this.worker.postMessage({ type: 'frame', bitmap, timestamp: performance.now() }, [bitmap]);
      }).catch(() => { this.busy = false; });
    }, 1000 / 24);
  }
  stop() {
    this.generation++; this.active = false; this.busy = false;
    clearInterval(this.timer); this.timer = 0; this.worker?.terminate(); this.worker = undefined;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = undefined;
    this.video.srcObject = null;
  }
}
