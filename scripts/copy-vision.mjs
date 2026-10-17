import { mkdir, readdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const source = fileURLToPath(new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url));
const target = fileURLToPath(new URL('../public/vision/', import.meta.url));
await mkdir(target, { recursive: true });
for (const name of await readdir(source)) {
  if (/\.(wasm|js)$/.test(name)) await copyFile(`${source}/${name}`, `${target}/${name}`);
}
await build({ entryPoints: [fileURLToPath(new URL('../src/vision-worker.ts', import.meta.url))],
  outfile: `${target}/worker.js`, bundle: true, format: 'iife', platform: 'browser',
  target: 'es2022', minify: true });
console.log('Local vision runtime and classic Web Worker prepared.');
