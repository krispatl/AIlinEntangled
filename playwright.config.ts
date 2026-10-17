import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',timeout:90000,workers:1,
  use:{baseURL:process.env.TEST_URL||'http://127.0.0.1:5173',channel:'chrome',headless:true,viewport:{width:1440,height:1000},
    launchOptions:{args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
      ...(process.env.TEST_CAMERA_VIDEO?['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-video-capture=${process.env.TEST_CAMERA_VIDEO}`]:[])]},},
});
