// Real pointer clicks in both popup contexts; no Google login or live website requests.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'lmg-popup-')), {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--disable-extensions-except=' + root, '--load-extension=' + root]
  });
  try {
    await context.route('https://**/*', route => new URL(route.request().url()).hostname === 'mapgenie.io'
      ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><body>LMG test</body>' }) : route.abort());
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const base = 'chrome-extension://' + new URL(worker.url()).host;
    for (const embedded of [false, true]) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      if (embedded) {
        await page.goto('https://mapgenie.io/test');
        await page.evaluate(url => {
          const frame = document.createElement('iframe');
          frame.src = url; frame.style = 'width:420px;height:650px';
          document.body.append(frame);
        }, base + '/popup.html');
      } else await page.goto(base + '/popup.html');
      const target = embedded ? page.frameLocator('iframe[src="' + base + '/popup.html"]') : page;
      const opened = context.waitForEvent('page');
      await target.locator('#fmg-drive-settings').click({ timeout: 5000 });
      const settings = await opened;
      await settings.waitForURL(base + '/drive-sync/settings.html');
      await settings.waitForFunction(() => document.getElementById('extension-id').textContent.length === 32);
      assert.deepEqual(errors, []);
      await settings.close();
      await page.close();
    }
    console.log('PASS: real Drive button clicks open settings in standalone popup and MapGenie iframe.');
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
