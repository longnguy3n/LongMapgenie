const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const project = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lmg-live-update-'));
const installed = path.join(temp, 'LMG installed');
const stage = path.join(temp, 'release');
const zip = path.join(temp, 'update.zip');
const items = ['manifest.json','background.js','page.js','popup.html','dataManager.html','offscreen.html','logo.svg','assets','chunks','content-scripts','icon','drive-sync','updates','updater','lmg-update-status.json'];
fs.mkdirSync(installed); fs.mkdirSync(stage);
for (const item of items) { fs.cpSync(path.join(project, item), path.join(installed, item), { recursive: true }); fs.cpSync(path.join(project, item), path.join(stage, item), { recursive: true }); }
const old = JSON.parse(fs.readFileSync(path.join(installed, 'manifest.json')));
old.oauth2 = { client_id: 'test-only.apps.googleusercontent.com', scopes: ['https://www.googleapis.com/auth/drive.appdata'] };
fs.writeFileSync(path.join(installed, 'manifest.json'), JSON.stringify(old));
const next = JSON.parse(fs.readFileSync(path.join(stage, 'manifest.json'))); next.version = '1.1.1';
fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(next));
function fixture(mode) {
  return execFileSync('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname, 'update-fixture.ps1'),'-Project',project,'-Root',installed,'-Stage',stage,'-Zip',zip,'-Mode',mode], { encoding: 'utf8' });
}
fixture('pack');
(async () => {
  const context = await chromium.launchPersistentContext(path.join(temp, 'profile'), {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--disable-extensions-except=' + installed, '--load-extension=' + installed]
  });
  try {
    await context.route('https://**/*', route => new URL(route.request().url()).hostname === 'mapgenie.io'
      ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body>LMG isolated test</body></html>' }) : route.abort());
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    let page = await context.newPage();
    // Match a real Load unpacked installation: Developer mode must remain enabled.
    await page.goto('chrome://extensions');
    await page.evaluate(() => new Promise(resolve => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, resolve)));
    const url = 'chrome-extension://' + id + '/drive-sync/settings.html';
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('extension-id').textContent.length === 32);
    const call = (action, extra = {}) => page.evaluate(async ({ action, extra }) => chrome.runtime.sendMessage({ type: 'FMG_DRIVE_UI_V1', action, ...extra }), { action, extra });
    let exported = await call('export');
    assert.equal(exported.error, undefined, JSON.stringify(exported));
    exported.data.data.tables.locations_v2.push({ id: 987, game_id: 1, user_id: 10 });
    assert.equal((await call('restore', { data: exported.data.data })).error, undefined);
    const result = JSON.parse(fixture('install'));
    assert.equal(result.Version, '1.1.1');
    const closed = page.waitForEvent('close', { timeout: 30000 });
    await page.evaluate(() => chrome.runtime.sendMessage({ type: 'LMG_UPDATES_V1', action: 'apply' })).catch(() => {});
    await closed;
    page = await context.newPage();
    let loaded = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      try { await page.goto(url); loaded = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    if (!loaded) {
      await page.goto('chrome://extensions');
      console.log('Reload diagnostics:', await page.evaluate(() => new Promise(resolve => chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true }, items => resolve(items.map(item => ({ id: item.id, state: item.state, disableReasons: item.disableReasons, manifestErrors: item.manifestErrors })))))));
      throw new Error('Updated extension did not become available.');
    }
    assert.equal(await page.evaluate(() => chrome.runtime.getManifest().version), '1.1.1');
    assert.equal(await page.evaluate(() => chrome.runtime.getManifest().oauth2.client_id), 'test-only.apps.googleusercontent.com');
    await page.waitForFunction(() => document.getElementById('extension-id').textContent.length === 32);
    const after = await call('export');
    assert.equal(after.data.data.tables.locations_v2[0].id, 987);
    assert.equal(JSON.parse(fs.readFileSync(path.join(result.Backup, 'manifest.json'))).version, '1.1.0');
    console.log('PASS: verified native folder swap with Chromium running; extension automatically reloaded to 1.1.1; OAuth, extension ID and real IndexedDB survived.');
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
