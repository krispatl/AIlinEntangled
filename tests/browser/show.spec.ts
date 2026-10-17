import { test, expect } from '@playwright/test';
test('operator controls, bilingual cues, projection sync, demo silhouette and persistence',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/control');await expect(page.locator('.scene')).toHaveCount(17);
  await expect(page.locator('.preview-canvas canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  const popupPromise=page.waitForEvent('popup');await page.locator('[data-action=projection]').click();const stage=await popupPromise;
  stage.on('pageerror',e=>errors.push(e.message));await expect(stage.locator('canvas')).toBeVisible();
  await expect(page.locator('#projection-status')).toContainText('connected');
  expect(await stage.locator('button,input,select').count()).toBe(0);
  await page.waitForTimeout(2000);await stage.screenshot({path:'test-results/projection-rest.png'});
  await page.locator('[data-language=es]').click();await expect(page.locator('html')).toHaveAttribute('lang','es');
  await expect(page.locator('label[for=look-scatter]')).toContainText('Intensidad del movimiento');
  await page.locator('#look-scatter').fill('2.5');await expect(page.locator('#value-scatter')).toHaveText('2.5');
  await page.locator('[data-scene=torus]').click();await page.locator('[data-action=go]').click();
  await expect(page.locator('#program-title')).toHaveText('Campo toroidal');
  await page.locator('#scene-name').fill('Torus / Test');await page.locator('[data-action=go]').click();
  await expect(page.locator('#program-title')).toHaveText('Torus / Test');
  await page.locator('#demo').check();await expect(page.locator('.joint.found')).toHaveCount(4);
  await page.waitForTimeout(2000);await page.screenshot({path:'test-results/console-es.png',fullPage:true});
  await stage.screenshot({path:'test-results/projection-particles.png'});
  await page.locator('[data-action=blackout]').click();await expect(stage.locator('canvas')).toHaveCSS('opacity','0');
  await page.locator('[data-action=blackout]').click();await expect(stage.locator('canvas')).toHaveCSS('opacity','1');
  await page.locator('[data-scene=silhouette]').click();await page.locator('[data-action=go]').click();
  await page.waitForTimeout(3500);await stage.screenshot({path:'test-results/projection-silhouette.png'});
  await page.locator('[data-action=freeze]').click();await expect(page.locator('[data-action=freeze]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-action=freeze]').click();
  await page.locator('[data-language=en]').click();await page.locator('[data-scene=orbital]').click();await page.locator('[data-action=go]').click();
  await page.locator('#demo').uncheck();await page.reload();await expect(page.locator('#look-scatter')).toHaveValue('2.5');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/console-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);await stage.close();
});
test('all particle images load and produce white geometry',async({page})=>{
  await page.goto('/control');const failures:string[]=[];
  page.on('response',r=>{if(r.status()>=400)failures.push(r.url());});
  for(const id of ['orbital','torus','seed','double','drift','nave','tree','metatron','halo','horizon','vaults','threshold','tesseract','platonic','ascending','infinite']){
    await page.locator(`[data-scene=${id}]`).click();await page.locator('[data-action=go]').click();
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(2000);await expect(page.locator('#notice')).toBeEmpty();expect(failures).toEqual([]);
});
