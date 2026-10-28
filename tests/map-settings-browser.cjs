// Real IndexedDB + localStorage bridge, no real Google account or user's browser data.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const key = 'mg:settings:game_1:found_locations_shown';
const presetKey = 'mg:settings:game_1:tag_filter_42';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lmg-map-settings-'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { for (let i = 0; i < 80; i++) { if (await fn()) return; await pause(100); } throw new Error('Timed out waiting for map settings'); }
(async () => {
  const context = await chromium.launchPersistentContext(profile, {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--disable-extensions-except=' + root, '--load-extension=' + root]
  });
  try {
    await context.route('https://**/*', route => ['mapgenie.io', 'rdr2map.com'].includes(new URL(route.request().url()).hostname)
      ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Map settings fixture</body></html>' }) : route.abort());
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const ui = await context.newPage();
    await ui.goto('chrome-extension://' + id + '/drive-sync/settings.html');
    const call = (action, extra = {}) => ui.evaluate(({ action, extra }) => chrome.runtime.sendMessage({ type: 'FMG_DRIVE_UI_V1', action, ...extra }), { action, extra });
    const snapshot = async () => { const r = await call('export'); assert.equal(r.error, undefined); return r.data.data; };
    const map = await context.newPage();
    const cdp = await context.newCDPSession(map), worlds = [];
    cdp.on('Runtime.executionContextCreated', ({ context }) => worlds.push(context));
    await cdp.send('Runtime.enable');
    await map.goto('https://mapgenie.io/lmg-settings-test');
    await until(() => worlds.some(w => w.name === 'LongMapgenie'));
    await cdp.send('Runtime.evaluate', { contextId: worlds.find(w => w.name === 'LongMapgenie').id, expression: 'globalThis.LMGMapSettingsReady', awaitPromise: true, returnByValue: true });
    await map.evaluate(key => {
      localStorage.setItem('auth_token', 'must-stay-local');
      localStorage.setItem(key, 'true');
      window.dispatchEvent(new Event('lmg:map-setting-change'));
    }, key);
    await until(async () => (await snapshot()).mapSettings.some(row => row.key === key && row.value === true));
    assert.equal(JSON.stringify(await snapshot()).includes('must-stay-local'), false);
    // Deletion/toggle off propagates rather than resurrecting on the next load.
    await map.evaluate(key => { localStorage.removeItem(key); window.dispatchEvent(new Event('lmg:map-setting-change')); }, key);
    await until(async () => !(await snapshot()).mapSettings.length);
    await map.reload(); await pause(500);
    assert.equal(await map.evaluate(key => localStorage.getItem(key), key), null);
    const remote = await snapshot();
    remote.mapSettings = [
      { origin: 'https://mapgenie.io', key, value: false },
      { origin: 'https://mapgenie.io', key: presetKey, value: true },
      { origin: 'https://rdr2map.com', key, value: true }
    ];
    remote.tables.presets = [{ id: 5, game_id: 1, user_id: -1, name: 'Loot', categories: [42] }];
    remote.tables.presetsOrdering = [{ id: 1, user_id: -1, ordering: [5] }];
    assert.equal((await call('restore', { data: remote })).error, undefined);
    // An open stale tab cannot overwrite a newly restored snapshot, even for an unrelated key.
    await map.evaluate(key => { localStorage.setItem(key, 'false'); window.dispatchEvent(new Event('lmg:map-setting-change')); }, presetKey);
    await pause(400);
    assert.deepEqual((await snapshot()).mapSettings, remote.mapSettings);
    await map.reload();
    await until(() => map.evaluate(key => localStorage.getItem(key) === 'false', key));
    assert.equal(await map.evaluate(key => localStorage.getItem(key), presetKey), 'true');
    assert.equal(await map.evaluate(() => localStorage.getItem('auth_token')), 'must-stay-local');
    const second = await context.newPage();
    await second.goto('https://rdr2map.com/lmg-settings-test');
    await until(() => second.evaluate(key => localStorage.getItem(key) === 'true', key));
    assert.deepEqual((await snapshot()).tables.presetsOrdering, remote.tables.presetsOrdering);
    // Legacy restore preserves preferences, while a v2 empty settings array clears them.
    const legacy = { format: 'fmg-database-v1', tables: remote.tables };
    assert.equal((await call('restore', { data: legacy })).error, undefined);
    assert.deepEqual((await snapshot()).mapSettings, remote.mapSettings);
    assert.equal((await call('restore', { data: { ...remote, mapSettings: [] } })).error, undefined);
    await map.reload(); await pause(500);
    assert.equal(await map.evaluate(key => localStorage.getItem(key), key), null);
    assert.equal((await snapshot()).mapSettings.length, 0);
    console.log('PASS: local settings capture, deletion, cross-origin restoration, stale-tab protection, presets/order, v1 backup migration, v2 reset and auth exclusion.');
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
