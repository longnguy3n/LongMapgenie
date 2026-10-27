const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const C = require('../drive-sync/core.js');
const root = path.resolve(__dirname, '..');
const copy = value => JSON.parse(JSON.stringify(value));
function data(ids = []) {
  const value = { format: 'fmg-database-v1', tables: Object.fromEntries(C.TABLES.map(t => [t, []])) };
  value.tables.locations_v2 = ids.map(id => ({ game_id: 1, user_id: 10, id }));
  return value;
}
function event() {
  const listeners = [];
  return { listeners, addListener(fn) { listeners.push(fn); }, fire(...args) { for (const fn of listeners) fn(...args); } };
}
function harness({ local = data(), base, remote = [], failStatus, configured = true, diskConfigured = configured } = {}) {
  let db = copy(local), serial = 0;
  const storage = { 'fmgDrive.enabled': true, ...(base ? { 'fmgDrive.base': { id: base.id, data: copy(base.data) } } : {}) };
  const cloud = remote.map(f => ({ id: f.id, parents: f.parents || [], data: copy(f.data), createdTime: f.createdTime || '2026-10-27T00:00:00Z' }));
  const requests = [], writes = [], timers = new Set();
  const chrome = {
    runtime: { id: 'testid', getURL: p => 'chrome-extension://testid/' + p,
      getManifest: () => configured ? { oauth2: { client_id: 'test.apps.googleusercontent.com' } } : {},
      onConnect: event(), onMessage: event(), onStartup: event(), onInstalled: event() },
    storage: { local: {
      async get(key) { return key ? { [key]: storage[key] } : { ...storage }; },
      async set(value) { Object.assign(storage, copy(value)); }
    } },
    alarms: { async get() { return {}; }, async create() {}, onAlarm: event() },
    identity: { async getAuthToken() { return { token: 'fake-test-token' }; }, async removeCachedAuthToken() {}, async clearAllCachedAuthTokens() {} }
  };
  const context = vm.createContext({
    chrome, console, URL, URLSearchParams, Blob, AbortSignal, crypto: webcrypto,
    setTimeout(fn, ms) { const id = setTimeout(fn, ms); timers.add(id); return id; },
    clearTimeout(id) { clearTimeout(id); timers.delete(id); },
    fetch: async (url, options = {}) => {
      if (url.startsWith('chrome-extension://')) return Response.json(diskConfigured ? { oauth2: { client_id: 'test.apps.googleusercontent.com' } } : {});
      requests.push({ url, options });
      if (failStatus) return new Response('', { status: failStatus });
      const parsed = new URL(url);
      if (options.method === 'DELETE') {
        const id = decodeURIComponent(parsed.pathname.split('/').pop());
        const index = cloud.findIndex(f => f.id === id);
        if (index >= 0) cloud.splice(index, 1);
        return new Response(null, { status: 204 });
      }
      if (options.method === 'POST') {
        const pieces = options.body.split('\r\n\r\n');
        const envelope = JSON.parse(pieces[2].split('\r\n--')[0]);
        const file = { id: 'created-' + ++serial, ...envelope, createdTime: new Date().toISOString() };
        cloud.push(file); writes.push(file);
        return Response.json({ id: file.id });
      }
      if (parsed.searchParams.get('alt') === 'media') {
        const file = cloud.find(f => f.id === decodeURIComponent(parsed.pathname.split('/').pop()));
        return Response.json({ format: 'fmg-drive-v1', parents: file.parents, data: file.data });
      }
      return Response.json({ files: cloud.map(f => ({ id: f.id, createdTime: f.createdTime, size: 100, description: JSON.stringify({ format: 'fmg-drive-v1', parents: f.parents }) })) });
    }
  });
  context.importScripts = name => vm.runInContext(fs.readFileSync(path.join(root, 'drive-sync', name), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'drive-sync/worker.js'), 'utf8'), context);
  const port = {
    name: 'FMG_DRIVE_DATABASE_V1', sender: { id: 'testid', url: 'https://mapgenie.io/?fmgBackend' },
    onMessage: event(), onDisconnect: event(), disconnect() {},
    postMessage(message) {
      queueMicrotask(() => {
        let result;
        if (message.action === 'snapshot') result = { data: copy(db) };
        else if (!C.equal(db, message.expected)) result = { error: 'Concurrent local edit' };
        else { db = copy(message.data); result = { data: { replaced: true } }; }
        port.onMessage.fire({ channel: 'FMG_DRIVE_DATABASE_V1', id: message.id, ...result });
      });
    }
  };
  chrome.runtime.onConnect.fire(port);
  return {
    storage, cloud, requests, writes, chrome, port,
    get db() { return copy(db); },
    set db(value) { db = copy(value); },
    async ui(action, extra = {}, sender) {
      const response = await new Promise(resolve => chrome.runtime.onMessage.listeners[0]({ type: 'FMG_DRIVE_UI_V1', action, ...extra }, sender || { id: 'testid', url: 'chrome-extension://testid/drive-sync/settings.html' }, resolve));
      return copy(response);
    },
    async popupExport(sender) {
      return await new Promise(resolve => chrome.runtime.onMessage.listeners[0]({ type: 'LMG_DATA_EXPORT_V1' }, sender, resolve));
    },
    close() { for (const id of timers) clearTimeout(id); }
  };
}
test('three-way decisions preserve deletions and detect independent edits', () => {
  const a = data([1]), b = data([1, 2]), c = data([1, 3]);
  assert.equal(C.decide(b, a, a), 'upload');
  assert.equal(C.decide(a, b, a), 'download');
  assert.equal(C.decide(b, c, a), 'conflict');
  assert.equal(C.decide(data(), a, a), 'upload');
  assert.equal(C.decide(a, data(), a), 'download');
  assert.equal(C.decide(data(), a, null), 'download');
  assert.equal(C.decide(b, a, null), 'conflict');
});

test('OAuth status distinguishes a saved manifest from configuration loaded by Chrome', async () => {
  for (const [configured, diskConfigured, reloadNeeded] of [[false, true, true], [true, true, false], [false, false, false]]) {
    const h = harness({ configured, diskConfigured });
    try {
      const status = (await h.ui('status')).data;
      assert.equal(status.configured, configured);
      assert.equal(status.oauthReloadNeeded, reloadNeeded);
      assert.equal(h.requests.length, 0);
    } finally { h.close(); }
  }
});

test('full popup backup works without an active profile and rejects web-page requests', async () => {
  const local = data([12]);
  const h = harness({ local, configured: false });
  try {
    const backup = await h.popupExport({ id: 'testid', url: 'chrome-extension://testid/popup.html' });
    assert.equal(C.equal(backup.data, local), true);
    assert.ok((await h.popupExport({ id: 'testid', url: 'https://mapgenie.io/' })).error);
    assert.ok((await h.popupExport({ id: 'other', url: 'chrome-extension://testid/popup.html' })).error);
    assert.equal(C.equal(h.db, local), true);
    assert.equal(h.requests.length, 0);
  } finally { h.close(); }
});
test('row and object ordering does not cause a false conflict', () => {
  assert.equal(C.equal(data([2, 1]), data([1, 2])), true);
});
test('invalid schemas and duplicate primary keys are rejected', () => {
  assert.throws(() => C.validate({ format: 'fmg-database-v1', tables: {} }));
  assert.throws(() => C.validate(data([1, 1])));
});
test('concurrent heads survive; an explicit child resolves both', () => {
  assert.deepEqual(C.heads([{ id: 'a', parents: [] }, { id: 'b', parents: ['a'] }, { id: 'c', parents: ['a'] }]).map(f => f.id), ['b', 'c']);
  assert.deepEqual(C.heads([{ id: 'b', parents: ['a'] }, { id: 'c', parents: ['a'] }, { id: 'd', parents: ['b', 'c'] }]).map(f => f.id), ['d']);
});
test('first upload saves all tables, not an API token', async () => {
  const value = data([1]);
  value.tables.notes.push({ id: 'note1', user_id: 10, game_id: 1, title: 'Ghi chú' });
  value.tables.bookmarks.push({ url: 'https://mapgenie.io/test', createdAt: 'now' });
  value.tables.profiles.push({ id: 10, name: 'Player', active: 1 });
  const h = harness({ local: value });
  try {
    assert.equal((await h.ui('sync')).error, undefined);
    assert.equal(h.writes.length, 1);
    assert.equal(C.equal(h.writes[0].data, value), true);
    assert.equal(JSON.stringify(h.writes).includes('fake-test-token'), false);
    assert.equal(h.storage['fmgDrive.status'].state, 'ok');
  } finally { h.close(); }
});
test('a new empty machine receives Drive progress and retains a recovery copy', async () => {
  const h = harness({ remote: [{ id: 'a', data: data([7]) }] });
  try {
    assert.equal((await h.ui('sync')).error, undefined);
    assert.equal(C.equal(h.db, data([7])), true);
    assert.equal(C.empty(h.storage['fmgDrive.recovery'].data), true);
    assert.equal(h.storage['fmgDrive.reloadNeeded'], true);
    assert.equal(h.writes.length, 0);
  } finally { h.close(); }
});
test('local and cloud changes pause without replacing either database', async () => {
  const h = harness({ local: data([1, 2]), base: { id: 'a', data: data([1]) }, remote: [{ id: 'b', parents: ['a'], data: data([1, 3]) }] });
  try {
    await h.ui('sync');
    assert.equal(h.storage['fmgDrive.status'].state, 'conflict');
    assert.equal(C.equal(h.db, data([1, 2])), true);
    assert.equal(h.writes.length, 0);
  } finally { h.close(); }
});
test('explicit conflict resolution checks heads and preserves old snapshots', async () => {
  const h = harness({ local: data([9]), remote: [{ id: 'a', data: data([1]) }, { id: 'b', data: data([2]) }] });
  try {
    await h.ui('sync');
    assert.equal(h.storage['fmgDrive.status'].state, 'conflict');
    assert.match((await h.ui('resolve', { choice: 'local', expectedHeads: ['a'] })).error, /Drive vừa thay đổi/);
    assert.equal(h.writes.length, 0);
    assert.equal((await h.ui('resolve', { choice: 'b', expectedHeads: ['a', 'b'] })).error, undefined);
    assert.equal(C.equal(h.db, data([2])), true);
    assert.deepEqual(h.writes[0].parents, ['a', 'b']);
    assert.equal(h.cloud.length, 3);
  } finally { h.close(); }
});
test('HTTP failure never changes local data or the last common base', async () => {
  const h = harness({ local: data([5]), base: { id: 'old', data: data([1]) }, failStatus: 503 });
  try {
    assert.match((await h.ui('sync')).error, /503/);
    assert.equal(C.equal(h.db, data([5])), true);
    assert.equal(h.storage['fmgDrive.base'].id, 'old');
    assert.equal(h.writes.length, 0);
  } finally { h.close(); }
});
test('a change during download aborts replacement, leaving new local progress intact', async () => {
  const h = harness({ local: data([1]), base: { id: 'a', data: data([1]) }, remote: [{ id: 'b', parents: ['a'], data: data([1, 2]) }] });
  const original = h.port.postMessage;
  h.port.postMessage = message => { if (message.action === 'replace') h.db = data([1, 8]); original(message); };
  try {
    assert.match((await h.ui('sync')).error, /Concurrent local edit/);
    assert.equal(C.equal(h.db, data([1, 8])), true);
    assert.equal(h.storage['fmgDrive.base'].id, 'a');
  } finally { h.close(); }
});
test('web pages cannot invoke login, export or conflict resolution', async () => {
  const h = harness();
  try {
    const result = await h.ui('connect', {}, { id: 'testid', url: 'https://mapgenie.io/' });
    assert.match(result.error, /Không được phép/);
    assert.equal(h.requests.length, 0);
  } finally { h.close(); }
});
test('no OAuth config means no Drive traffic', async () => {
  const h = harness({ configured: false });
  try {
    assert.match((await h.ui('connect')).error, /OAuth Client ID/);
    assert.equal(h.requests.length, 0);
  } finally { h.close(); }
});
test('restore validates first, pauses sync, saves recovery, and restores every table', async () => {
  const h = harness({ local: data([1]) });
  try {
    assert.ok((await h.ui('restore', { data: {} })).error);
    assert.equal(C.equal(h.db, data([1])), true);
    assert.equal((await h.ui('restore', { data: data([9]) })).error, undefined);
    assert.equal(C.equal(h.db, data([9])), true);
    assert.equal(C.equal(h.storage['fmgDrive.recovery'].data, data([1])), true);
    assert.equal(h.storage['fmgDrive.enabled'], false);
  } finally { h.close(); }
});
test('manifest hooks and private sync resources are wired correctly', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.equal(manifest.name, 'LMG');
  assert.equal(manifest.version, JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version);
  assert.equal(manifest.homepage_url, 'https://github.com/longnguy3n/LongMapgine');
  assert.ok(manifest.permissions.includes('identity'));
  assert.ok(manifest.permissions.includes('alarms'));
  assert.equal(manifest.background.service_worker, 'drive-sync/entry.js');
  assert.ok(manifest.key);
  if (manifest.oauth2) {
    assert.match(manifest.oauth2.client_id, /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/);
    assert.deepEqual(manifest.oauth2.scopes, ['https://www.googleapis.com/auth/drive.appdata']);
  }
  assert.ok(!manifest.web_accessible_resources.some(entry => entry.resources.some(resource => resource.startsWith('drive-sync/'))));
  assert.match(fs.readFileSync(path.join(root, 'content-scripts/backend.js'), 'utf8'), /FMGDriveDB\?\.attach\(\$v.provide\(\)\)/);
});
