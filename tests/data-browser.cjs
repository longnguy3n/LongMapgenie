const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const C = require('../drive-sync/core.js');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lmg-data-test-'));
(async () => {
  const context = await chromium.launchPersistentContext(path.join(temp, 'profile'), {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    headless: true, acceptDownloads: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--disable-extensions-except=' + root, '--load-extension=' + root]
  });
  context.setDefaultTimeout(10000);
  try {
    await context.route('https://**/*', route => new URL(route.request().url()).hostname === 'mapgenie.io'
      ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><body>LMG test</body>' }) : route.abort());
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const base = 'chrome-extension://' + new URL(worker.url()).host;
    const settings = await context.newPage();
    await settings.goto(base + '/drive-sync/settings.html');
    await settings.waitForFunction(() => document.getElementById('extension-id').textContent.length === 32);
    const call = (action, extra = {}) => settings.evaluate(({ action, extra }) => chrome.runtime.sendMessage({ type: 'FMG_DRIVE_UI_V1', action, ...extra }), { action, extra });
    const empty = (await call('export')).data.data;
    const sample = structuredClone(empty);
    sample.tables.profiles = [{ id: 10, name: 'First profile', active: 1 }, { id: 20, name: 'Other profile', active: 0 }];
    sample.tables.locations_v2 = [{ id: 100, game_id: 1, user_id: 10 }, { id: 200, game_id: 2, user_id: 10 }, { id: 300, game_id: 1, user_id: 20 }];
    sample.tables.categories_v2 = [{ id: 5, game_id: 1, user_id: 10 }];
    sample.tables.bookmarks = [{ url: 'https://mapgenie.io/test', title: 'Saved map', createdAt: new Date().toISOString() }];
    for (const embedded of [false, true]) {
      assert.equal((await call('restore', { data: empty })).error, undefined);
      const page = await context.newPage();
      if (embedded) {
        await page.goto('https://mapgenie.io/test');
        await page.evaluate(url => { const f = document.createElement('iframe'); f.src = url; f.style = 'width:440px;height:850px'; document.body.append(f); }, base + '/popup.html');
      } else await page.goto(base + '/popup.html');
      const target = embedded ? page.frameLocator('iframe[src="' + base + '/popup.html"]') : page;
      const button = name => target.locator('button').filter({ hasText: new RegExp('^' + name + '$') });
      await target.locator('[title="data"]').click();
      await page.waitForTimeout(500);
      assert.equal(await button('Export all games').isDisabled(), true);
      const emptyDownload = page.waitForEvent('download');
      await button('Tải bản sao toàn bộ dữ liệu').click();
      const emptyFile = await emptyDownload;
      const emptyPath = path.join(temp, 'no-profile-' + embedded + '.json');
      await emptyFile.saveAs(emptyPath);
      assert.equal(C.equal(JSON.parse(fs.readFileSync(emptyPath, 'utf8')), empty), true);
      const managerOpened = context.waitForEvent('page');
      await button('Open data manager').click();
      const manager = await managerOpened;
      await manager.waitForURL(base + '/dataManager.html');
      await manager.close();
      // The profile arrives after the popup mounted, as with late backend initialization or restore.
      assert.equal((await call('restore', { data: sample })).error, undefined);
      await target.locator('[title="bookmarks"]').click();
      await target.locator('[title="data"]').click();
      await button('Export all games').click();
      const downloaded = page.waitForEvent('download');
      await button('Confirm').click();
      const file = await downloaded;
      const exportPath = path.join(temp, embedded ? 'embedded.json' : 'standalone.json');
      await file.saveAs(exportPath);
      const save = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
      assert.equal(save.version, 3); assert.equal(save.userId, 10);
      assert.deepEqual(save.games['1'].locations, [100]);
      assert.deepEqual(save.games['2'].locations, [200]);
      const backupDownload = page.waitForEvent('download');
      await button('Tải bản sao toàn bộ dữ liệu').click();
      const backup = await backupDownload;
      const backupPath = path.join(temp, embedded ? 'full-embedded.json' : 'full-standalone.json');
      await backup.saveAs(backupPath);
      assert.equal(C.equal(JSON.parse(fs.readFileSync(backupPath, 'utf8')), sample), true);
      assert.equal(C.equal((await call('export')).data.data, sample), true);
      assert.equal(await button('Clear current map').isDisabled(), true);
      if (!embedded) await page.screenshot({ path: path.join(__dirname, 'data-tab.png'), fullPage: true });
      await page.close();
      console.log('PASS: late profile unlocks Data; legacy and full backup downloads preserve data (' + (embedded ? 'embedded' : 'standalone') + ').');
    }
    const downloaded = settings.waitForEvent('download');
    await settings.locator('#export').click();
    const file = await downloaded; const exported = path.join(temp, 'drive-export.json');
    await file.saveAs(exported);
    assert.equal(C.equal(JSON.parse(fs.readFileSync(exported, 'utf8')), sample), true);
    console.log('PASS: Drive settings export button downloads the full database.');
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
