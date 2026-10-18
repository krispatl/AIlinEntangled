import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('all new controls are bilingual, recalled per scene, exported and migrated',async({page})=>{
  await page.goto('/control');
  await page.locator('#response').selectOption('attract');
  await page.locator('#look-handIntensity').fill('2');await page.locator('#look-footIntensity').fill('0.3');
  await page.locator('[data-tab=atmosphere]').click();
  await page.locator('#look-drift').fill('60');await page.locator('#look-breathing').fill('35');
  await page.locator('#look-breathPeriod').fill('8');await page.locator('#look-trails').fill('1.2');
  await page.locator('[data-scene=torus]').click();await page.locator('[data-action=go]').click();
  await expect(page.locator('#look-drift')).toHaveValue('20');await page.locator('#look-drift').fill('5');
  await page.locator('[data-scene=orbital]').click();await page.locator('[data-action=go]').click();
  await expect(page.locator('#look-drift')).toHaveValue('60');await expect(page.locator('#look-trails')).toHaveValue('1.2');
  await page.locator('[data-language=es]').click();
  await expect(page.locator('label[for=look-drift]')).toContainText('Deriva de partículas');
  await expect(page.locator('label[for=look-breathing]')).toContainText('respiración');
  await page.screenshot({path:'test-results/atmosphere-es.png',fullPage:true});
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-action=export]').click();
  const download=await downloadPromise;const exported=JSON.parse(await readFile((await download.path())!,'utf8'));
  expect(exported.version).toBe(2);expect(exported.sceneLooks.orbital.drift).toBe(60);expect(exported.sceneLooks.torus.drift).toBe(5);
  expect(exported.sceneLooks.orbital.handIntensity).toBe(2);expect(exported.sceneLooks.orbital.footIntensity).toBe(.3);expect(exported.sceneLooks.orbital.response).toBe('attract');
  await page.reload();await page.locator('[data-tab=atmosphere]').click();await expect(page.locator('#look-drift')).toHaveValue('60');
  await page.locator('[data-action=copy-look]').click();await page.locator('[data-scene=torus]').click();await page.locator('[data-action=go]').click();
  await expect(page.locator('#look-drift')).toHaveValue('60');await page.locator('[data-action=reset-look]').click();await expect(page.locator('#look-drift')).toHaveValue('20');
  await page.locator('[data-scene=orbital]').click();await page.locator('[data-action=go]').click();await expect(page.locator('#look-drift')).toHaveValue('60');
  const legacy={app:'ailin-entangled',version:1,sceneId:'seed',look:{scatter:2.75,bloom:.7}};
  await page.locator('#import-file').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
  await page.locator('[data-tab=movement]').click();await expect(page.locator('#look-scatter')).toHaveValue('2.75');
  await page.locator('[data-scene=torus]').click();await page.locator('[data-action=go]').click();await expect(page.locator('#look-scatter')).toHaveValue('2.75');
  await page.locator('[data-language=en]').click();await expect(page.locator('label[for=look-handIntensity]')).toContainText('Hand intensity');
  await page.setViewportSize({width:390,height:844});await page.locator('[data-tab=timing]').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('idle motion changes the clean projection, zero is still, and freeze holds the exact frame',async({page})=>{
  const state={version:2,look:{drift:0,breathing:0,trails:0,particles:24000}};
  await page.addInitScript(state=>localStorage.setItem('ailin-show-v1:main',JSON.stringify(state)),state);
  await page.goto('/control');const popup=page.waitForEvent('popup');await page.locator('[data-action=projection]').click();const stage=await popup;
  const errors:string[]=[];stage.on('pageerror',error=>errors.push(error.message));
  await expect(stage.locator('canvas')).toBeVisible();await page.waitForTimeout(1000);
  const canvas=stage.locator('canvas');const stillA=await canvas.screenshot();await page.waitForTimeout(600);const stillB=await canvas.screenshot();
  expect(stillA.equals(stillB)).toBe(true);
  await page.locator('[data-tab=atmosphere]').click();await page.locator('#look-drift').fill('100');
  await page.waitForTimeout(1500);const driftA=await canvas.screenshot();await page.waitForTimeout(800);const driftB=await canvas.screenshot();
  expect(driftA.equals(driftB)).toBe(false);
  await page.locator('#look-breathing').fill('70');await page.locator('#look-trails').fill('1.5');
  await page.locator('[data-action=freeze]').click();await page.waitForTimeout(150);
  const frozenA=await canvas.screenshot();await page.waitForTimeout(900);const frozenB=await canvas.screenshot();expect(frozenA.equals(frozenB)).toBe(true);
  await page.locator('[data-action=freeze]').click();await page.waitForTimeout(700);expect(frozenA.equals(await canvas.screenshot())).toBe(false);
  await page.locator('[data-action=blackout]').click();await expect(canvas).toHaveCSS('opacity','0');
  await page.locator('[data-action=blackout]').click();await expect(canvas).toHaveCSS('opacity','1');
  await stage.screenshot({path:'test-results/drift-and-trails.png'});expect(errors).toEqual([]);await stage.close();
});

test('timed cues hold on blackout, support manual override, and finish on the silhouette',async({page})=>{
  await page.goto('/control');await page.locator('[data-tab=timing]').click();
  await page.locator('[data-duration=orbital]').fill('3');await page.locator('[data-duration=orbital]').blur();
  await page.locator('[data-action=timer-toggle]').click();await expect(page.locator('#timer-status')).toHaveText('Running');
  await page.locator('[data-action=blackout]').click();await expect(page.locator('#timer-status')).toHaveText('Held');
  const held=await page.locator('#timer-countdown').innerText();await page.waitForTimeout(3500);
  await expect(page.locator('#timer-countdown')).toHaveText(held);await expect(page.locator('#program-title')).toHaveText('Orbital lattice');
  await page.locator('[data-action=blackout]').click();await expect(page.locator('#program-title')).toHaveText('Torus field',{timeout:5000});
  await page.locator('[data-scene=seed]').click();await page.locator('[data-action=go]').click();await expect(page.locator('#timer-status')).toHaveText('Manual');
  await page.waitForTimeout(1000);await expect(page.locator('#program-title')).toHaveText('Seed of light');
  const state={version:2,sceneId:'infinite',durations:{infinite:3,silhouette:3}};
  await page.locator('#import-file').setInputFiles({name:'finale.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'ailin-entangled',...state}))});
  await page.locator('[data-action=timer-toggle]').click();await expect(page.locator('#program-title')).toHaveText('The body remains',{timeout:5000});
  await expect(page.locator('#timer-status')).toHaveText('Finished',{timeout:5000});await expect(page.locator('[data-action=timer-toggle]')).toHaveAttribute('aria-pressed','false');
  await page.reload();await expect(page.locator('#timer-status')).toHaveText('Manual');
});

test('muted feet leave geometry still while hands repel or gather the corresponding particles',async({page})=>{
  const state={version:2,look:{drift:0,breathing:0,trails:0,particles:24000,scatter:2,handIntensity:2,footIntensity:0,radius:.35,bloom:0}};
  await page.addInitScript(state=>localStorage.setItem('ailin-show-v1:main',JSON.stringify(state)),state);
  await page.goto('/control');const popup=page.waitForEvent('popup');await page.locator('[data-action=projection]').click();const stage=await popup;
  const canvas=stage.locator('canvas');await expect(canvas).toBeVisible();await page.waitForTimeout(1000);
  const baseline=await canvas.screenshot();
  await page.evaluate(()=>{
    const bus=new BroadcastChannel('ailin:main');
    const simulation={limb:'leftFoot',timer:0,bus};
    simulation.timer=window.setInterval(()=>bus.postMessage({type:'frame',frame:{timestamp:Date.now(),joints:[{name:simulation.limb,x:.5,y:.5,confidence:1}],landmarks:[],mask:new Uint8Array(4),gray:new Uint8Array(4),width:2,height:2,inferenceMs:0,handsRefined:false,demo:true}}),33);
    (window as unknown as {effectTest:typeof simulation}).effectTest=simulation;
  });
  await page.waitForTimeout(600);expect(baseline.equals(await canvas.screenshot())).toBe(true);
  await page.evaluate(()=>{(window as unknown as {effectTest:{limb:string}}).effectTest.limb='leftHand';});
  await page.waitForTimeout(2500);const repel=await canvas.screenshot();
  await page.locator('#response').selectOption('attract');await page.waitForTimeout(2500);const attract=await canvas.screenshot();
  const average=async(png:Buffer)=>page.evaluate(async(base64)=>{
    const image=await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const sample=new OffscreenCanvas(image.width,image.height),ctx=sample.getContext('2d')!;ctx.drawImage(image,0,0);
    const data=ctx.getImageData(Math.floor(image.width*.47),Math.floor(image.height*.45),Math.floor(image.width*.06),Math.floor(image.height*.1)).data;
    let sum=0;for(let i=0;i<data.length;i+=4)sum+=data[i];image.close();return sum/(data.length/4);
  },png.toString('base64'));
  const baseLight=await average(baseline),repelLight=await average(repel),attractLight=await average(attract);
  console.log('PARTICLE RESPONSE',{baseLight,repelLight,attractLight});
  expect(repelLight).toBeLessThan(baseLight*.8);expect(attractLight).toBeGreaterThan(repelLight*1.2);
  await page.evaluate(()=>{const simulation=(window as unknown as {effectTest:{timer:number;bus:BroadcastChannel}}).effectTest;clearInterval(simulation.timer);simulation.bus.close();});
  await stage.close();
});

test('a projection opened while frozen displays geometry or the held silhouette instead of starting blank',async({page})=>{
  await page.goto('/control');await page.waitForTimeout(700);await page.locator('[data-action=freeze]').click();
  let popup=page.waitForEvent('popup');await page.locator('[data-action=projection]').click();let stage=await popup;
  await expect(stage.locator('canvas')).toBeVisible();await page.waitForTimeout(700);
  const geometry=await stage.locator('canvas').screenshot();
  await page.locator('[data-action=blackout]').click();await expect(stage.locator('canvas')).toHaveCSS('opacity','0');
  const black=await stage.locator('canvas').screenshot();expect(geometry.equals(black)).toBe(false);
  await stage.close();await page.locator('[data-action=blackout]').click();await page.locator('[data-action=freeze]').click();
  await page.locator('#demo').check();await page.locator('[data-scene=silhouette]').click();await page.locator('[data-action=go]').click();
  await page.waitForTimeout(3000);await page.locator('[data-action=freeze]').click();
  popup=page.waitForEvent('popup');await page.locator('[data-action=projection]').click();stage=await popup;
  await expect(stage.locator('canvas')).toBeVisible();await page.waitForTimeout(500);
  const silhouette=await stage.locator('canvas').screenshot();expect(silhouette.equals(black)).toBe(false);
  await page.waitForTimeout(500);expect(silhouette.equals(await stage.locator('canvas').screenshot())).toBe(true);
  await stage.close();
});
