# AILIN / Entangled

A webcam-driven dance performance for a browser and projector. Sixteen particle scenes reconstruct the distinct sacred geometry images from the TouchDesigner `TDIMAGES` folder. The seventeenth and final scene renders the dancer's segmented silhouette, Sobel contour, and optional interior edges. All projected visuals are white on black, with adjustable bloom.

## Run locally

Requires Node.js 22.12+ and a recent desktop Chrome or Edge with WebGL2, Web Workers, OffscreenCanvas and webcam support.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/control`. The repository includes the geometry and pose/hand model files. Installation and builds copy the pinned MediaPipe WASM runtime and bundle the tracking worker into `public/vision/`; these generated files are intentionally not committed.

```sh
npm test
npm run build
npm run preview
```

## Performance setup

1. Connect the webcam and projector to **one computer**. Extend the desktop to the projector. Open `/control` in Chrome or Edge.
2. Choose **Camera & alignment**, select the webcam, then **Start camera**. Allow camera access in the browser. Models load locally from the same site; first inference can take longer while the GPU warms up.
3. Keep the dancer's complete body inside the frame. The four limb indicators confirm which hands and feet have enough confidence to affect particles. Match **Mirror movement** to the stage and crop the camera view to the dance area.
4. Click **Open projection**, move that window onto the projector, and double-click it (or press `F`/`Enter`) for fullscreen. `/stage` contains only the output canvas. Keep the console visible on the computer's other display.
5. Select a scene to cue it, then press **GO TO SCENE**. Scene selection alone does not alter the live output. Rename or reorder particle cues using the fields below the sequence. The silhouette always stays last.
6. Adjust **Movement intensity**, **Interaction radius**, and **Return to geometry**. Appearance controls change particle count, size, brightness, bloom, silhouette fill and edge width. Export the show to keep a portable copy of the setup.

The **EN / ES** toggle translates the operator interface and default scene titles. Custom scene names remain as entered. Show settings and language persist in this browser. Rehearsal motion is explicitly simulated and can be used without a webcam; it does not validate live tracking.

## Drift, trails and scene looks

Every scene now remembers its own movement and appearance settings automatically. The settings panel names the **live scene being edited**. Selecting another cue only arms it; press GO to activate it and recall its look. **Reset this scene** resets only the live scene. **Apply look to all scenes** copies the current look to every scene as a starting point.

The **Atmosphere** tab contains:

| Control | Range and behavior |
| --- | --- |
| Particle drift | 0–100%, default 20%. Smooth floating around the source geometry. Maximum offset is 3% of stage height per axis. Zero removes idle drift. |
| Breathing amount | 0–100%, default 10%. Slow expansion/contraction, up to ±3.5% at maximum. Zero disables breathing. |
| Breathing cycle | 4–30 seconds, default 10 seconds. |
| Motion trails | 0–2.5 seconds, default 0.3 seconds. Time for a previous pixel to fade to 10% brightness. Zero removes trails. |
| Scene transition | Morph duration, saved per scene. |

Drift and breathing work without a camera and use a shared phase in the console and projection. They affect particle scenes. Trails also work on the silhouette; they clear on a scene change, blackout, or lost silhouette signal. Freeze holds the rendered frame and idle-motion clock, then resumes smoothly.

The **Movement** tab adds **Hand intensity** and **Foot intensity** (0–3×). They multiply the main movement intensity; zero disables that limb group. **Dancer response** chooses **Repel / scatter** or **Attract / gather**. Attraction reverses the radial force while preserving motion following and the spring return to geometry.

Camera alignment stays global so switching scenes does not change the stage mapping. Version 2 show exports include every scene look and duration. Older version 1 exports remain importable: their global look is copied to all scenes before adding the new controls at their defaults.

## Timed scene sequence

In the **Timing** tab, set each scene's duration (3–600 seconds, default 30). Use the transport beneath the GO controls to **Start sequence**, pause/resume, or reset the timer for the live scene.

- Playback starts with the live scene and follows the visible cue order. The silhouette remains last, and playback stops after its duration. There is no automatic loop.
- GO immediately switches to the selected scene and returns to manual control. Reordering cues pauses playback. Merely selecting a cue does not interrupt playback.
- Blackout and freeze hold the countdown; releasing them continues it. Duration inputs are locked while playback is running. Pause first to edit them; changing the current duration resets its countdown.
- Reloading the page or importing a show always leaves the timer stopped. A delayed/backgrounded timer never skips multiple cues at once.

The console must remain open. Rehearse timings with the actual performance computer; a browser timer is not an external timecode system.

| Key | Action |
| --- | --- |
| Left / right arrow | Select previous / next cue |
| Space | Run selected cue |
| B | Toggle immediate blackout |
| P | Freeze / resume motion |
| F or Enter, on projection | Fullscreen |
| Escape, on projection | Leave fullscreen |

Shortcuts do not intercept text fields, sliders, selectors or focused buttons. The console and projection use BroadcastChannel on the same origin, browser profile and computer. A phone or second computer cannot act as a remote control. Use one console per session; `?session=name` separates independent shows.

## Vercel

Import `krispatl/AIlinEntangled` into the intended Vercel account/team. Framework: **Vite**; install: `npm ci`; build: `npm run build`; output: `dist`; root: repository root. No API keys, environment variables, databases or server functions are required. `vercel.json` provides the `/control` and `/stage` routes and permits the same-origin webcam.

Camera access requires HTTPS in production (localhost works for rehearsal). Both pages must use the same deployment URL. Keep the Vercel tab open during performance; this is not an offline PWA. Once the runtime/models/images are loaded, no inference requests go to a server. Camera frames, landmarks and masks stay on the performance computer and are not recorded or uploaded.

## Tracking and visual design

- MediaPipe Pose Landmarker **full**, one dancer, 33 body landmarks, with person segmentation. Hand Landmarker refines palms when visible; pose hand landmarks remain the fallback. Ankles, heels and foot tips supply the foot interaction points.
- Inference runs in a dedicated classic worker. A GPU delegate is attempted first, with CPU fallback. Only one video frame is processed at a time; stale frames are not queued.
- Adaptive filtering reduces stationary jitter while responding to movement. Confidence gating removes occluded/offscreen limbs. Forces act along each tracked limb's swept path, displacing nearby particles; springs restore the reference geometry.
- Geometry is sampled from the luminance of the actual supplied images, with no static image underlay. White additive point sprites and bloom reconstruct each design. Bright lines receive more particles than the dark background.
- The final scene uses a body segmentation mask plus Sobel edges. Camera detail is multiplied by the body mask, so the room is not projected. A lost body signal clears the silhouette, except during an intentional freeze.

This is monocular estimation, not Kinect depth or motion capture. Occlusion, motion blur, backlighting, projection light on the dancer, distance and hardware affect accuracy/latency. Rehearse the full choreography and calibrate with the actual camera and projector. For slow machines, lower particle count and turn off hand refinement before restarting the camera. Rendering FPS and inference time are separate readings on the console.

## Tests

With the dev server running and Chrome installed:

```sh
npm run test:browser
```

Core tests cover sanitization/migration, independent scene looks, finale ordering, camera mapping, confidence gating, hand association, motion filtering, drift bounds, shared freeze timing, trail decay and the cue transport. Browser tests cover the bilingual controls, show export/import, per-scene recall, persistence, responsive layout, live projection drift and exact freeze-frame behavior, timed/manual cue transitions, blackout and the demo finale. They also load every geometry asset.

Two optional integration tests exercise the **actual MediaPipe models** and **getUserMedia pipeline**. Set `TEST_POSE_IMAGE` to the absolute path of a full-body JPEG and/or `TEST_CAMERA_VIDEO` to an absolute path to a full-body Y4M video. The latter uses Chrome's synthetic capture device, never the physical webcam. For example, PowerShell:

```powershell
$env:TEST_POSE_IMAGE='C:\fixtures\pose.jpg'
$env:TEST_CAMERA_VIDEO='C:\fixtures\dance.y4m'
npm run test:browser
```

Tests were exercised using Google's public `mediapipe-assets/pose.jpg` fixture. This demonstrates model loading, hand/foot outputs, segmentation and capture plumbing; it does not measure live dancer accuracy. Set `TEST_URL` to test a preview/production origin instead of localhost.

## Guía rápida en español

1. Conecta la cámara y el proyector al mismo equipo. Abre `/control` y pulsa **ES**.
2. En **Cámara y alineación**, elige la cámara y pulsa **Iniciar cámara**. Mantén todo el cuerpo visible. Ajusta el recorte y el reflejo para que el movimiento coincida con la proyección.
3. Pulsa **Abrir proyección**, mueve esa ventana al proyector y haz doble clic para pantalla completa. Mantén la consola abierta y visible en la otra pantalla.
4. Elige una escena y pulsa **ACTIVAR ESCENA**. Usa los controles de intensidad, radio y retorno para ajustar la respuesta. Las escenas de partículas van primero; la silueta siempre queda al final.
5. **Oscurecer** apaga la salida inmediatamente; **Congelar** mantiene el movimiento. Exporta la función para guardar una copia. **Movimiento de ensayo** utiliza datos simulados.
6. En **Atmósfera**, ajusta la deriva, la respiración y las estelas. En **Movimiento**, elige atraer o repeler y controla manos y pies por separado. Cada escena recuerda su apariencia; el panel indica la escena en vivo que estás editando.
7. En **Tiempos**, define los segundos de cada escena y pulsa **Iniciar secuencia**. La secuencia termina después de la silueta. **ACTIVAR ESCENA** devuelve el control manual; oscurecer y congelar mantienen la cuenta atrás en espera. Al recargar, la secuencia siempre queda detenida.

La cámara se procesa en este equipo, sin subir vídeo. La precisión depende de la luz, las oclusiones, el encuadre y el rendimiento: prueba la coreografía con el equipo real antes de la función.

## Source assets

`public/geometry/sources.json` maps each converted monochrome image to the original filename and SHA-256. The source folder contained 17 files but only 16 distinct designs: `3.png` and `ChatGPT Image Mar 12, 2026, 05_53_30 PM.png` were identical. Each unique design appears once. Model sources/checksums and third-party acknowledgements are in `public/models/sources.json` and `THIRD_PARTY_NOTICES.md`.
