import { test, expect } from '@playwright/test';
test('real MediaPipe worker returns a pose, four effectors and segmentation from a fixture',async({page})=>{
  test.skip(!process.env.TEST_POSE_IMAGE,'Set TEST_POSE_IMAGE to a full-body photograph to validate the actual models.');
  await page.route('**/test-pose.jpg',route=>route.fulfill({path:process.env.TEST_POSE_IMAGE!,contentType:'image/jpeg'}));
  await page.goto('/stage');
  const result=await page.evaluate(async()=>{
    const worker=new Worker('/vision/worker.js');
    return await new Promise<{landmarks:number;joints:string[];maskPixels:number;ms:number;backend:string;refinement:boolean}>((resolve,reject)=>{
      const timeout=setTimeout(()=>{worker.terminate();reject(new Error('Model test timeout'));},60000);let backend='';let refinement=false;
      worker.onerror=e=>{clearTimeout(timeout);worker.terminate();reject(new Error(e.message));};
      worker.onmessage=async({data})=>{
        if(data.type==='error'||data.type==='frame-error'){clearTimeout(timeout);worker.terminate();reject(new Error(data.message));}
        if(data.type==='ready'){
          backend=data.backend;refinement=data.hands;
          const bitmap=await createImageBitmap(await (await fetch('/test-pose.jpg')).blob());
          worker.postMessage({type:'frame',bitmap,timestamp:performance.now()},[bitmap]);
        }
        if(data.type==='frame'){
          const f=data.frame;clearTimeout(timeout);worker.terminate();
          resolve({landmarks:f.landmarks.length,joints:f.joints.map((j:{name:string})=>j.name),maskPixels:Array.from(f.mask as Uint8Array).filter(v=>v>128).length,ms:f.inferenceMs,backend,refinement});
        }
      };
      worker.postMessage({type:'init',base:location.origin,refine:true});
    });
  });
  console.log('REAL MODEL RESULT',result);
  expect(result.landmarks).toBe(33);expect(result.joints).toEqual(['leftHand','rightHand','leftFoot','rightFoot']);
  expect(result.maskPixels).toBeGreaterThan(500);expect(result.refinement).toBe(true);
});
