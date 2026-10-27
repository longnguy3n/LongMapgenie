const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../updates/core.js');
const root = path.resolve(__dirname, '..');
function release(version = '1.2.0') {
  const name = 'LMG-' + version + '-chrome.zip';
  const base = C.REPO + '/releases/download/v' + version + '/';
  return { tag_name: 'v' + version, draft: false, prerelease: false, assets: [name, name + '.sha256'].map(name => ({ name, browser_download_url: base + name })) };
}
function event() {
  const listeners = [];
  return { listeners, addListener(fn) { listeners.push(fn); }, fire(...args) { listeners.forEach(fn => fn(...args)); } };
}
function harness({ response = release(), httpStatus = 200, marker = { state: 'not-installed' }, disk = { name: 'LMG', version: '1.2.0', key: 'key' }, busy = false } = {}) {
  const storage = {}, alarms = [], badges = [];
  let requests = 0, reloads = 0, flushes = 0;
  const chrome = {
    runtime: { id: 'test', getManifest: () => ({ name: 'LMG', version: '1.1.0', key: 'key' }), getURL: p => 'chrome-extension://test/' + p,
      onInstalled: event(), onStartup: event(), onMessage: event(), reload() { reloads++; } },
    storage: { local: { async get(key) { return { [key]: storage[key] }; }, async set(data) { Object.assign(storage, data); } } },
    alarms: { onAlarm: event(), async get() {}, async create(name, options) { alarms.push({ name, ...options }); } },
    action: { async setBadgeText(value) { badges.push(value.text); }, async setBadgeBackgroundColor() {} }
  };
  const context = vm.createContext({ chrome, URL, AbortSignal, console, LMGUpdateGate: { busy: () => busy, async prepare() { flushes++; return true; }, resume() {} },
    async fetch(url) {
      if (url.startsWith('https://api.github.com/')) { requests++; return new Response(JSON.stringify(response), { status: httpStatus }); }
      if (url.includes('manifest.json')) return Response.json(disk);
      return Response.json(marker);
    }
  });
  context.importScripts = () => vm.runInContext(fs.readFileSync(path.join(root, 'updates/core.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'updates/worker.js'), 'utf8'), context);
  return { storage, alarms, badges, chrome, get requests() { return requests; }, get reloads() { return reloads; }, get flushes() { return flushes; },
    async call(action, extra = {}, sender = { id: 'test', url: 'chrome-extension://test/drive-sync/settings.html' }) {
      return await new Promise(resolve => chrome.runtime.onMessage.listeners[0]({ type: 'LMG_UPDATES_V1', action, ...extra }, sender, resolve));
    }
  };
}
test('update versions are compared numerically and malformed tags are rejected', () => {
  assert.equal(C.compare('1.10.0', '1.9.9'), 1);
  assert.equal(C.compare('1.1.0.0', '1.1.0'), 0);
  assert.throws(() => C.version('1.2.0-beta'));
  assert.throws(() => C.version('1.999999.0'));
});
test('release validation requires stable tags and assets from the exact repository', () => {
  assert.equal(C.release(release()).latest, '1.2.0');
  assert.throws(() => C.release({ ...release(), prerelease: true }));
  const malicious = release(); malicious.assets[0].browser_download_url = 'https://example.com/update.zip';
  assert.throws(() => C.release(malicious));
  assert.throws(() => C.release({ ...release(), assets: [] }));
});
test('periodic checks cache metadata and show a NEW badge without repeated network calls', async () => {
  const h = harness();
  assert.equal((await h.call('check')).data.available, true);
  await h.call('check');
  assert.equal(h.requests, 1);
  assert.deepEqual(h.badges, ['NEW']);
  assert.ok(h.alarms.some(a => a.name === 'lmg-release-check' && a.periodInMinutes === 360));
});
test('private repository, rate limit and offline-like HTTP errors are nonfatal', async () => {
  for (const status of [404, 403, 429, 503]) {
    const h = harness({ httpStatus: status, response: { message: 'Not available' } });
    const result = await h.call('check');
    assert.equal(result.error, undefined);
    assert.ok(result.data.error);
    assert.equal(h.reloads, 0);
  }
});
test('a helper ready marker reloads only after matching disk manifest and database flush', async () => {
  const h = harness({ marker: { state: 'ready', id: 'update1', version: '1.2.0' } });
  await h.call('apply');
  assert.equal(h.flushes, 1);
  assert.equal(h.reloads, 1);
  await h.call('apply');
  assert.equal(h.reloads, 1);
});
test('incomplete installation, wrong identity and active sync prevent reloading', async () => {
  for (const options of [
    { marker: { state: 'installing', id: 'x', version: '1.2.0' } },
    { marker: { state: 'ready', id: 'x', version: '1.2.0' }, disk: { name: 'LMG', version: '1.2.0', key: 'other-key' } },
    { marker: { state: 'ready', id: 'x', version: '1.2.0' }, busy: true }
  ]) {
    const h = harness(options); await h.call('apply'); assert.equal(h.reloads, 0);
  }
});
test('web pages cannot trigger updater controls', async () => {
  const h = harness();
  const response = await h.call('check', {}, { id: 'test', url: 'https://mapgenie.io/' });
  assert.ok(response.error); assert.equal(h.requests, 0);
});
test('legacy popup no longer makes an unauthenticated request with an error toast', () => {
  const popup = fs.readFileSync(path.join(root, 'chunks/popup-DkXAhNd0.js'), 'utf8');
  assert.ok(popup.includes('type:"LMG_UPDATES_V1",action:"check"'));
  assert.ok(!popup.includes('Failed to fetch latest version'));
});
