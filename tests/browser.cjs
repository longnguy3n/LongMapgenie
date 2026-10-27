// Isolated Chromium integration test. All website requests are intercepted; no Google login.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const C = require('../drive-sync/core.js');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'fmg-drive-test-'));
(async () => {
  const context = await chromium.launchPersistentContext(profile, {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--disable-extensions-except=' + root, '--load-extension=' + root],
    viewport: { width: 1100, height: 1000 }
  });
  try {
    await context.route('https://**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'mapgenie.io') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body>LMG test backend</body></html>' });
      return route.abort();
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('chrome-extension://' + id + '/drive-sync/settings.html');
    assert.match(await page.title(), /^LMG/);
    await page.waitForFunction(() => document.getElementById('extension-id').textContent.length === 32);
    const call = (action, extra = {}) => page.evaluate(async ({ action, extra }) => chrome.runtime.sendMessage({ type: 'FMG_DRIVE_UI_V1', action, ...extra }), { action, extra });
    let exported;
    for (let i = 0; i < 3; i++) {
      exported = await call('export');
      if (!exported.error) break;
      await page.waitForTimeout(500);
    }
    assert.equal(exported.error, undefined, JSON.stringify(exported));
    C.validate(exported.data.data);
    assert.equal(C.empty(exported.data.data), true);
    const sample = structuredClone(exported.data.data);
    sample.tables.profiles = [{ id: 10, name: 'Kiểm thử', active: 1 }];
    sample.tables.locations_v2 = [{ id: 123, user_id: 10, game_id: 1 }];
    sample.tables.categories_v2 = [{ id: 42, user_id: 10, game_id: 1 }];
    sample.tables.notes = [{ id: 'abc', user_id: 10, game_id: 1, map_id: 1, title: 'Ghi chú tiếng Việt', description: 'Thử lưu IndexedDB', latitude: 10, longitude: 20 }];
    sample.tables.presets = [{ id: 1, user_id: 10, game_id: 1, title: 'Bộ lọc', categories: [42] }];
    sample.tables.presetsOrdering = [{ id: 1, user_id: 10, game_id: 1, order: 0 }];
    sample.tables.bookmarks = [{ url: 'https://mapgenie.io/test', title: 'Test', createdAt: new Date().toISOString() }];
    const restored = await call('restore', { data: sample });
    assert.equal(restored.error, undefined, JSON.stringify(restored));
    assert.equal(C.equal((await call('export')).data.data, sample), true);
    const invalid = structuredClone(sample);
    invalid.tables.locations_v2.push(invalid.tables.locations_v2[0]);
    assert.ok((await call('restore', { data: invalid })).error);
    assert.equal(C.equal((await call('export')).data.data, sample), true);
    assert.equal(C.empty((await call('recovery')).data.data), true);
    const configuration = (await call('status')).data;
    const configured = Boolean(JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'))).oauth2);
    assert.equal(configuration.configured, configured);
    assert.equal(configuration.enabled, false);
    assert.equal(await page.locator('#connect').isDisabled(), !configured);
    await page.reload();
    await page.waitForFunction(() => document.getElementById('extension-id').textContent.length === 32);
    assert.equal(C.equal((await call('export')).data.data, sample), true);
    await page.screenshot({ path: path.join(__dirname, 'drive-settings.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log('PASS: real extension worker, offscreen iframe, Dexie/IndexedDB export+restore, invalid restore, recovery, reload persistence, private settings UI, mobile layout.');
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
