import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { sceneById } from './state';
import { AdaptiveFilter, projectPoint } from './tracking-math';
import type { ShowState, TrackingFrame } from './types';

type Design = { positions: Float32Array; light: Float32Array; aspect: number };
type Force = { x: number; y: number; px: number; py: number; vx: number; vy: number; stamp: number };
const spriteVertex = `
attribute float aLight; attribute float aSeed;
uniform float uSize; uniform float uRatio; varying float vLight;
void main(){ vLight=aLight; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
gl_PointSize=max(1.,uSize*uRatio*(.65+aSeed*.7)); }`;
const spriteFragment = `
uniform float uBrightness; uniform float uOpacity; varying float vLight;
void main(){vec2 p=gl_PointCoord-.5;float r=dot(p,p)*4.;if(r>1.)discard;
float a=exp(-r*4.)*(.25+vLight*.75)*uOpacity;
gl_FragColor=vec4(vec3(uBrightness*(.55+vLight*.8)),a);}`;
const silhouetteFragment = `
uniform sampler2D uMask; uniform sampler2D uGray; uniform vec2 uTexel;
uniform vec4 uCrop; uniform float uMirror; uniform float uFill; uniform float uOutline;
uniform float uDetail; uniform float uOpacity; varying vec2 vUv;
float maskAt(vec2 uv){return smoothstep(.35,.65,texture2D(uMask,uv).r);}
void main(){
vec2 q=vec2(mix(vUv.x,1.-vUv.x,uMirror),1.-vUv.y);
vec2 uv=vec2(mix(uCrop.x,uCrop.y,q.x),mix(uCrop.z,uCrop.w,q.y));
vec2 t=uTexel*uOutline;
float tl=maskAt(uv+vec2(-t.x,-t.y)),tc=maskAt(uv+vec2(0.,-t.y)),tr=maskAt(uv+vec2(t.x,-t.y));
float ml=maskAt(uv+vec2(-t.x,0.)),mr=maskAt(uv+vec2(t.x,0.));
float bl=maskAt(uv+vec2(-t.x,t.y)),bc=maskAt(uv+vec2(0.,t.y)),br=maskAt(uv+t);
float edge=length(vec2(-tl-2.*ml-bl+tr+2.*mr+br,-tl-2.*tc-tr+bl+2.*bc+br))*.8;
float body=maskAt(uv);
float gx=texture2D(uGray,uv+vec2(t.x,0.)).r-texture2D(uGray,uv-vec2(t.x,0.)).r;
float gy=texture2D(uGray,uv+vec2(0.,t.y)).r-texture2D(uGray,uv-vec2(0.,t.y)).r;
float detail=smoothstep(.045,.24,length(vec2(gx,gy)))*body*uDetail;
float white=min(1.,edge+body*uFill+detail)*uOpacity;
gl_FragColor=vec4(vec3(white),1.);
}`;

export class StageRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: THREE.WebGLRenderer; private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private composer: EffectComposer; private bloom: UnrealBloomPass;
  private geometry = new THREE.BufferGeometry(); private points: THREE.Points;
  private material: THREE.ShaderMaterial; private silhouette: THREE.Mesh;
  private silhouetteMaterial: THREE.ShaderMaterial;
  private maskTexture = this.texture(new Uint8Array(4), 2, 2);
  private grayTexture = this.texture(new Uint8Array(4), 2, 2);
  private positions = new Float32Array(); private velocities = new Float32Array();
  private targets: Float32Array = new Float32Array(); private from = new Float32Array();
  private lights = new Float32Array(); private count = 0; private aspect = 16 / 9;
  private cache = new Map<string, Promise<Design>>(); private loadId = 0;
  private state: ShowState; private currentScene = ''; private transitionAt = 0;
  private silhouetteMix = 0; private lastTime = 0; private startTime = performance.now();
  private animation = 0; private resizeObserver: ResizeObserver; private disposed = false;
  private forces = new Map<string, Force>();
  private filters = new Map<string, [AdaptiveFilter, AdaptiveFilter]>();
  private receivedAt = 0; private frameNumber = 0; private fpsTime = 0; private calibrationKey = '';
  fps = 0; error = ''; ready = false;

  constructor(private host: HTMLElement, initial: ShowState, private preview = false,
    private onError: (message: string) => void = () => {}) {
    this.state = initial;
    this.gl = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.canvas = this.gl.domElement; this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', document.documentElement.lang==='es'?'Visuales de la función en vivo':'Live performance visuals');
    this.gl.setClearColor(0x000000); this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ReinhardToneMapping;
    this.host.append(this.canvas); this.camera.position.z = 3;
    this.material = new THREE.ShaderMaterial({ vertexShader: spriteVertex, fragmentShader: spriteFragment,
      uniforms: { uSize: { value: 1.6 }, uRatio: { value: 1 }, uBrightness: { value: 1 }, uOpacity: { value: 1 } },
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(this.geometry, this.material); this.points.frustumCulled = false; this.scene.add(this.points);
    this.silhouetteMaterial = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: silhouetteFragment,
      uniforms: { uMask: { value: this.maskTexture }, uGray: { value: this.grayTexture }, uTexel: { value: new THREE.Vector2(1/256,1/144) },
        uCrop: { value: new THREE.Vector4(0,1,0,1) }, uMirror: { value: 1 }, uFill: { value: 0.05 },
        uOutline: { value: 1.5 }, uDetail: { value: 0.2 }, uOpacity: { value: 0 } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    });
    this.silhouette = new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.silhouetteMaterial); this.silhouette.position.z=-0.1; this.scene.add(this.silhouette);
    this.composer = new EffectComposer(this.gl); this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(640,360), 0.45, 0.15, 0.65);
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(host); this.resize();
    this.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.error = 'Graphics context lost. Reload this page.'; onError(this.error); });
    this.applyState(initial); this.animate(performance.now());
  }
  private texture(data: Uint8Array, width: number, height: number) {
    const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat);
    texture.minFilter=THREE.LinearFilter; texture.magFilter=THREE.LinearFilter;
    texture.unpackAlignment=1; texture.needsUpdate=true; return texture;
  }
  private resize() {
    const width=Math.max(2,this.host.clientWidth),height=Math.max(2,this.host.clientHeight);
    this.aspect=width/height; this.camera.left=-this.aspect;this.camera.right=this.aspect;this.camera.updateProjectionMatrix();
    const ratio=this.preview ? 1 : Math.min(devicePixelRatio,1.5);
    this.gl.setPixelRatio(ratio);this.gl.setSize(width,height,false);this.composer.setPixelRatio(ratio);this.composer.setSize(width,height);
    this.material.uniforms.uRatio.value=ratio;this.silhouette.scale.x=this.aspect;
  }
  applyState(state: ShowState) {
    this.state=state;
    const key=JSON.stringify(state.calibration);
    if(key!==this.calibrationKey){this.calibrationKey=key;this.forces.clear();this.filters.clear();}
    const count=this.preview ? Math.min(36000,state.look.particles) : state.look.particles;
    if (this.currentScene!==state.sceneId || this.count!==count) {
      this.currentScene=state.sceneId;
      if (sceneById.get(state.sceneId)?.kind==='particles') void this.loadDesign(state.sceneId,count);
    }
    this.bloom.strength=state.look.bloom;
    this.material.uniforms.uSize.value=state.look.pointSize*(this.preview?0.85:1);
    this.material.uniforms.uBrightness.value=state.look.brightness;
    const u=this.silhouetteMaterial.uniforms,c=state.calibration;
    u.uCrop.value.set(c.left,c.right,c.top,c.bottom);u.uMirror.value=c.mirror?1:0;
    u.uFill.value=state.look.silhouetteFill;u.uOutline.value=state.look.outline;u.uDetail.value=state.look.detail;
    this.canvas.style.opacity=state.blackout?'0':'1';
  }
  receiveFrame(frame: TrackingFrame) {
    if (this.state.freeze) return;
    this.receivedAt=performance.now();
    const present=new Set<string>();
    for (const joint of frame.joints) {
      present.add(joint.name);
      let filters=this.filters.get(joint.name);
      if (!filters) { filters=[new AdaptiveFilter(),new AdaptiveFilter()];this.filters.set(joint.name,filters); }
      const x=filters[0].filter(joint.x,frame.timestamp),y=filters[1].filter(joint.y,frame.timestamp);
      const p=projectPoint(x,y,this.state.calibration),old=this.forces.get(joint.name);
      const sx=(p.x*2-1)*this.aspect,sy=1-p.y*2;
      const dt=old?Math.max(.01,(frame.timestamp-old.stamp)/1000):1;
      const valid=old&&dt<.3;
      this.forces.set(joint.name,{x:sx,y:sy,px:valid?old.x:sx,py:valid?old.y:sy,
        vx:valid?Math.max(-6,Math.min(6,(sx-old.x)/dt)):0,vy:valid?Math.max(-6,Math.min(6,(sy-old.y)/dt)):0,stamp:frame.timestamp});
    }
    for (const key of this.forces.keys()) if (!present.has(key)) {this.forces.delete(key);this.filters.delete(key);}
    if (frame.mask.length!==frame.width*frame.height || frame.gray.length!==frame.mask.length) return;
    if (this.maskTexture.image.width!==frame.width || this.maskTexture.image.height!==frame.height) {
      this.maskTexture.dispose();this.grayTexture.dispose();
      this.maskTexture=this.texture(frame.mask,frame.width,frame.height);this.grayTexture=this.texture(frame.gray,frame.width,frame.height);
      this.silhouetteMaterial.uniforms.uMask.value=this.maskTexture;this.silhouetteMaterial.uniforms.uGray.value=this.grayTexture;
    } else {
      this.maskTexture.image.data=frame.mask;this.grayTexture.image.data=frame.gray;
      this.maskTexture.needsUpdate=true;this.grayTexture.needsUpdate=true;
    }
    this.silhouetteMaterial.uniforms.uTexel.value.set(1/frame.width,1/frame.height);
  }
  private async design(id: string,count: number): Promise<Design> {
    const key=`${id}:${count}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const promise=(async()=>{
      const response=await fetch(sceneById.get(id)!.image);if(!response.ok)throw new Error(`Unable to load ${id}`);
      const image=await createImageBitmap(await response.blob());
      const width=768,height=Math.round(width*image.height/image.width);
      const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true})!;
      ctx.drawImage(image,0,0,width,height);image.close();
      const data=ctx.getImageData(0,0,width,height).data,cdf=new Float32Array(width*height);
      let total=0;for(let i=0;i<cdf.length;i++){const b=data[i*4]/255;total+=b<.025?0:Math.pow(b,2.5);cdf[i]=total;}
      if(!total)throw new Error(`Image ${id} has no visible geometry`);
      let seed=2166136261;for(const ch of id)seed=Math.imul(seed^ch.charCodeAt(0),16777619);
      const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const positions=new Float32Array(count*3),light=new Float32Array(count);
      for(let i=0;i<count;i++){
        const r=rand()*total;let lo=0,hi=cdf.length-1;while(lo<hi){const mid=(lo+hi)>>>1;if(cdf[mid]<r)lo=mid+1;else hi=mid;}
        positions[i*3]=(((lo%width)+rand())/width*2-1)*(width/height)*.94;
        positions[i*3+1]=(1-(Math.floor(lo/width)+rand())/height*2)*.94;
        positions[i*3+2]=0;light[i]=Math.pow(data[lo*4]/255,.6);
      }
      return {positions,light,aspect:width/height};
    })();
    this.cache.set(key,promise);
    try{return await promise;}catch(error){this.cache.delete(key);throw error;}
  }
  private async loadDesign(id: string,count: number) {
    const request=++this.loadId;
    try{
      const design=await this.design(id,count);if(request!==this.loadId||this.disposed||this.currentScene!==id)return;
      this.targets=design.positions;
      if(this.count!==count){
        this.count=count;this.positions=design.positions.slice();this.velocities=new Float32Array(count*2);
        this.from=this.positions.slice();this.lights=design.light.slice();
        this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
        this.geometry.setAttribute('aLight',new THREE.BufferAttribute(this.lights,1));
        const seeds=Float32Array.from({length:count},(_,i)=>(i*.61803398875)%1);
        this.geometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));this.geometry.setDrawRange(0,count);
      }else{this.from=this.positions.slice();this.lights.set(design.light);this.geometry.attributes.aLight.needsUpdate=true;}
      this.transitionAt=performance.now();this.ready=true;
    }catch(error){this.error=String(error);this.onError(this.error);}
  }
  private animate = (now: number) => {
    if(this.disposed)return;
    this.animation=requestAnimationFrame(this.animate);
    const dt=Math.min(.035,Math.max(.001,(now-this.lastTime)/1000));this.lastTime=now;
    if(++this.frameNumber%30===0){this.fps=Math.round(30000/(now-this.fpsTime||1));this.fpsTime=now;}
    if(this.error||this.state.blackout)return;
    const silhouetteTarget=sceneById.get(this.state.sceneId)?.kind==='silhouette'?1:0;
    if(!this.state.freeze)this.silhouetteMix+=(silhouetteTarget-this.silhouetteMix)*Math.min(1,dt*4/this.state.look.transition);
    const fresh=this.state.freeze||now-this.receivedAt<350;
    this.bloom.strength=this.state.look.bloom*(1-this.silhouetteMix*.65);
    this.material.uniforms.uOpacity.value=1-this.silhouetteMix;
    this.silhouetteMaterial.uniforms.uOpacity.value=fresh?this.silhouetteMix:0;
    this.points.visible=this.silhouetteMix<.999;this.silhouette.visible=this.silhouetteMix>.001;
    if(!this.state.freeze&&this.count&&this.points.visible){
      const elapsed=(now-this.transitionAt)/1000/this.state.look.transition;
      const progress=Math.min(1,elapsed),ease=progress*progress*(3-2*progress);
      const springs=this.state.look.returnSpeed*5,drag=Math.exp(-dt*4.5),radius=this.state.look.radius,r2=radius*radius;
      const forces=fresh?[...this.forces.values()]:[];
      const intensity=this.state.look.scatter;
      const time=(now-this.startTime)/1000;
      for(let i=0;i<this.count;i++){
        const p=i*3,v=i*2;let x=this.positions[p],y=this.positions[p+1],vx=this.velocities[v],vy=this.velocities[v+1];
        const hx=this.from[p]+(this.targets[p]-this.from[p])*ease;
        const hy=this.from[p+1]+(this.targets[p+1]-this.from[p+1])*ease;
        vx+=(hx-x)*springs*dt;vy+=(hy-y)*springs*dt;
        for(const f of forces){
          const dx=f.x-f.px,dy=f.y-f.py,len=dx*dx+dy*dy;
          const t=len>1e-6?Math.max(0,Math.min(1,((x-f.px)*dx+(y-f.py)*dy)/len)):0;
          const rx=x-f.px-dx*t,ry=y-f.py-dy*t,d2=rx*rx+ry*ry;
          if(d2<r2){const d=Math.sqrt(d2)+.008,influence=(1-d2/r2)**2;
            const push=influence*intensity*(.35+Math.min(4,Math.hypot(f.vx,f.vy)))*dt*12;
            vx+=push*(rx/d+f.vx*.12);vy+=push*(ry/d+f.vy*.12);
          }
        }
        vx+=Math.sin(time*.45+i*1.618)*.012*dt;vy+=Math.cos(time*.4+i*2.414)*.012*dt;
        vx=Math.max(-5,Math.min(5,vx))*drag;vy=Math.max(-5,Math.min(5,vy))*drag;
        this.positions[p]=x+vx*dt;this.positions[p+1]=y+vy*dt;this.velocities[v]=vx;this.velocities[v+1]=vy;
      }
      this.geometry.attributes.position.needsUpdate=true;
    }
    this.composer.render();
  };
  dispose(){this.disposed=true;cancelAnimationFrame(this.animation);this.resizeObserver.disconnect();this.geometry.dispose();
    this.material.dispose();this.silhouette.geometry.dispose();this.silhouetteMaterial.dispose();this.maskTexture.dispose();this.grayTexture.dispose();
    this.bloom.dispose();this.composer.dispose();this.gl.dispose();this.canvas.remove();}
}
