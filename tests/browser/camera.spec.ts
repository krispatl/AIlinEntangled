import { test, expect } from '@playwright/test';
test('camera start, actual worker inference, UI changes, and stop release the stream',async({page})=>{
  test.skip(!process.env.TEST_CAMERA_VIDEO,'Set TEST_CAMERA_VIDEO to a full-body Y4M video to exercise getUserMedia.');
  await page.goto('/control');
  await page.locator('[data-action=camera]').click();
  await expect(page.locator('.joint.found')).toHaveCount(4,{timeout:60000});
  await page.locator('[data-language=es]').click();await page.waitForTimeout(2000);
  await expect(page.locator('video')).toHaveJSProperty('paused',false);
  await expect(page.locator('.joint.found')).toHaveCount(4,{timeout:15000});
  console.log('CAMERA STATUS',await page.locator('#status-message').innerText());
  await page.screenshot({path:'test-results/camera-tracking.png',fullPage:true});
  await page.locator('[data-action=camera]').click();
  await expect(page.locator('video')).toHaveJSProperty('srcObject',null);
  await expect(page.locator('#status-message')).toContainText('detenida');
});
