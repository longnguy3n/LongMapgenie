// Usage: node tests/settings-migration-browser.cjs [path/to/LMG-1.2.2-chrome.zip]
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lmg-settings-migration-'));
const installed = path.join(temp, 'extension'), profile = path.join(temp, 'profile');
const archive = path.resolve(process.argv[2] || path.join(root, 'dist/LMG-1.2.2-chrome.zip'));
const quote = s => "'" + s.replaceAll("'", "''") + "'";
execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(installed)}`]);
const key = 'mg:settings:game_1:map_type';
async function launch(reload = false) {
  const context = await chromium.launchPersistentContext(profile, {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--disable-extensions-except=' + installed, '--load-extension=' + installed]
  });
  await context.route('https://**/*', route => new URL(route.request().url()).hostname === 'mapgenie.io'
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><body>Migration test</body>' }) : route.abort());
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const ui = await context.newPage();
  if (reload) {
    await ui.goto('chrome://extensions');
    await ui.evaluate(() => new Promise(resolve => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, resolve)));
    await ui.evaluate(id => new Promise((resolve, reject) => chrome.developerPrivate.reload(id, { failQuietly: false }, () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve())), new URL(worker.url()).host);
  }
  let loaded = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { await ui.goto('chrome-extension://' + new URL(worker.url()).host + '/drive-sync/settings.html'); loaded = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  if (!loaded) { await context.close(); throw new Error('Extension did not finish reloading'); }
  const call = (action, extra = {}) => ui.evaluate(({ action, extra }) => chrome.runtime.sendMessage({ type: 'FMG_DRIVE_UI_V1', action, ...extra }), { action, extra });
  return { context, call };
}
(async () => {
  let run = await launch(), original;
  try {
    original = (await run.call('export')).data.data;
    assert.equal(original.format, 'fmg-database-v1');
    original.tables.locations_v2 = [{ id: 123, game_id: 1, user_id: -1 }];
    original.tables.profiles = [{ id: -1, name: 'Existing user', active: 1 }];
    original.tables.presets = [{ id: 3, game_id: 1, user_id: -1, name: 'Saved filter', categories: [42] }];
    original.tables.presetsOrdering = [{ id: 1, user_id: -1, ordering: [3] }];
    assert.equal((await run.call('restore', { data: original })).error, undefined);
    const map = await run.context.newPage(); await map.goto('https://mapgenie.io/lmg-settings-test');
    await map.evaluate(key => localStorage.setItem(key, JSON.stringify('Satellite')), key);
  } finally { await run.context.close(); }
  for (const item of ['manifest.json', 'background.js', 'page.js', 'chunks', 'content-scripts', 'drive-sync', 'updates']) fs.cpSync(path.join(root, item), path.join(installed, item), { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(installed, 'manifest.json'))); delete manifest.oauth2;
  fs.writeFileSync(path.join(installed, 'manifest.json'), JSON.stringify(manifest));
  run = await launch(true);
  try {
    let after = (await run.call('export')).data.data;
    assert.equal(after.format, 'lmg-database-v2');
    assert.deepEqual(after.tables, original.tables);
    const map = await run.context.newPage();
    await map.goto('https://mapgenie.io/lmg-settings-test');
    for (let i = 0; i < 60; i++) {
      after = (await run.call('export')).data.data;
      if (after.mapSettings.some(row => row.key === key)) break;
      await map.waitForTimeout(100);
    }
    assert.deepEqual(after.mapSettings, [{ origin: 'https://mapgenie.io', key, value: 'Satellite' }]);
    assert.deepEqual(after.tables, original.tables);
    console.log('PASS: real v1.2.2 IndexedDB upgrades in place; progress, profiles, presets/order preserved; existing localStorage preferences imported.');
  } finally { await run.context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
