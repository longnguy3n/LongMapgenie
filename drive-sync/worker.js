'use strict';
importScripts('core.js');
(() => {
  const C = FMGDriveCore;
  const API = 'https://www.googleapis.com/drive/v3';
  const PREFIX = 'fmgDrive.';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  let databasePort, running = false, generation = 0;
  const pending = new Map();
  const get = async key => (await chrome.storage.local.get(PREFIX + key))[PREFIX + key];
  const set = (key, value) => chrome.storage.local.set({ [PREFIX + key]: value });
  const status = async (state, message, extra = {}) => set('status', { state, message, time: Date.now(), ...extra });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  function configured() { return Boolean(chrome.runtime.getManifest().oauth2?.client_id); }
  async function token(interactive = false) {
    if (!configured()) throw new Error('Chưa cấu hình OAuth Client ID. Xem hướng dẫn bên dưới.');
    const result = await chrome.identity.getAuthToken({ interactive, scopes: [SCOPE] });
    const value = typeof result === 'string' ? result : result?.token;
    if (!value) throw new Error('Chưa đăng nhập Google Drive.');
    return value;
  }
  async function request(url, options = {}, retry = true) {
    // Never accept arbitrary destinations from downloaded metadata or the UI.
    if (new URL(url).origin !== 'https://www.googleapis.com') throw new Error('Địa chỉ API không hợp lệ.');
    const accessToken = await token();
    const response = await fetch(url, {
      ...options, signal: AbortSignal.timeout(25000),
      headers: { ...options.headers, Authorization: 'Bearer ' + accessToken }
    });
    if (response.status === 401 && retry) {
      await chrome.identity.removeCachedAuthToken({ token: accessToken });
      return request(url, options, false);
    }
    if (!response.ok) throw new Error('Google Drive HTTP ' + response.status + '. Dữ liệu trên máy vẫn được giữ.');
    return response;
  }
  async function listFiles() {
    const files = [];
    let pageToken;
    do {
      const query = new URLSearchParams({
        spaces: 'appDataFolder', q: "trashed = false and appProperties has { key='fmgSync' and value='v1' }",
        fields: 'nextPageToken,files(id,description,createdTime,size)', pageSize: '1000'
      });
      if (pageToken) query.set('pageToken', pageToken);
      const result = await (await request(API + '/files?' + query)).json();
      for (const file of result.files || []) {
        let description;
        try { description = JSON.parse(file.description); } catch { throw new Error('Metadata bản sao Drive bị hỏng.'); }
        if (description.format !== 'fmg-drive-v1' || !Array.isArray(description.parents) || description.parents.some(p => typeof p !== 'string')) throw new Error('Metadata bản sao Drive không tương thích.');
        files.push({ ...file, parents: description.parents });
      }
      pageToken = result.nextPageToken;
    } while (pageToken);
    return files;
  }
  async function readFile(file) {
    const response = await request(API + '/files/' + encodeURIComponent(file.id) + '?alt=media');
    const envelope = await response.json();
    if (envelope.format !== 'fmg-drive-v1' || C.stable(envelope.parents) !== C.stable(file.parents)) throw new Error('Bản sao Drive không hợp lệ.');
    return C.canonical(envelope.data);
  }
  async function upload(data, parents) {
    const boundary = 'fmg_' + crypto.randomUUID();
    const envelope = { format: 'fmg-drive-v1', parents, createdAt: new Date().toISOString(), data: C.canonical(data) };
    const metadata = {
      name: 'fmg-' + envelope.createdAt.replace(/[:.]/g, '-') + '.json',
      parents: ['appDataFolder'], mimeType: 'application/json',
      appProperties: { fmgSync: 'v1' }, description: JSON.stringify({ format: envelope.format, parents })
    };
    const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata)
      + '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + JSON.stringify(envelope) + '\r\n--' + boundary + '--';
    // Multipart is documented for <=5 MiB. Larger saves use the resumable endpoint.
    let result;
    if (new Blob([body]).size <= 5 * 1024 * 1024) {
      result = await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body
      });
    } else {
      const json = JSON.stringify(envelope);
      const session = await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': 'application/json' }, body: JSON.stringify(metadata)
      });
      const location = session.headers.get('Location');
      if (!location) throw new Error('Không tạo được phiên tải dữ liệu lên Drive.');
      result = await request(location, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: json });
    }
    const file = await result.json();
    if (!file.id) throw new Error('Drive không trả mã bản sao.');
    return file.id;
  }
  async function database(action, args = {}) {
    for (let i = 0; !databasePort && i < 40; i++) await sleep(250);
    if (!databasePort) throw new Error('Backend LMG chưa sẵn sàng. Mở MapGenie rồi thử lại.');
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Database phản hồi quá chậm.')); }, 20000);
      pending.set(id, { resolve, reject, timer });
      try { databasePort.postMessage({ channel: 'FMG_DRIVE_DATABASE_V1', id, action, ...args }); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'FMG_DRIVE_DATABASE_V1') return;
    let url;
    try { url = new URL(port.sender?.url); } catch { port.disconnect(); return; }
    if (port.sender?.id !== chrome.runtime.id || url.origin !== 'https://mapgenie.io' || !url.searchParams.has('fmgBackend')) { port.disconnect(); return; }
    databasePort = port;
    port.onMessage.addListener(message => {
      if (message.event === 'ready') { void automatic(); return; }
      // Changes are persisted immediately by LMG. The periodic alarm batches cloud writes.
      if (message.event === 'dirty') return;
      if (message.channel !== 'FMG_DRIVE_DATABASE_V1') return;
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id); clearTimeout(waiter.timer);
      message.error ? waiter.reject(new Error(message.error)) : waiter.resolve(message.data);
    });
    port.onDisconnect.addListener(() => {
      if (databasePort !== port) return;
      databasePort = null;
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Backend LMG vừa ngắt kết nối.')); }
      pending.clear();
    });
  });
  async function applyRemote(local, remote) {
    // Keep a recovery copy before the atomic compare-and-replace transaction.
    await set('recovery', { time: Date.now(), data: local });
    await database('replace', { data: remote, expected: local });
  }
  function publicHeads(heads) { return heads.map(f => ({ id: f.id, createdTime: f.createdTime, size: f.size })); }
  async function sync(resolution) {
    if (running) throw new Error('Đang đồng bộ. Hãy chờ thao tác hiện tại hoàn tất.');
    running = true;
    const currentGeneration = generation;
    try {
      if (!(await get('enabled'))) throw new Error('Đồng bộ đang tắt.');
      await status('syncing', 'Đang kiểm tra dữ liệu trên máy và Google Drive…');
      const local = C.canonical(await database('snapshot'));
      const files = await listFiles();
      const heads = C.heads(files);
      const headIds = heads.map(f => f.id).sort();
      const base = await get('base');
      let remote;
      let chosen = heads[0];
      if (resolution) {
        if (C.stable(headIds) !== C.stable(resolution.expectedHeads)) throw new Error('Drive vừa thay đổi. Kiểm tra lại xung đột trước khi chọn.');
        if (resolution.choice !== 'local') {
          chosen = heads.find(f => f.id === resolution.choice);
          if (!chosen) throw new Error('Không tìm thấy bản sao đã chọn.');
        }
      }
      if (heads.length === 1 || resolution?.choice !== 'local' && resolution) remote = await readFile(chosen);
      let action = heads.length > 1 ? 'conflict' : C.decide(local, remote, base?.data);
      if (resolution) action = resolution.choice === 'local' ? 'upload' : 'download';
      if (generation !== currentGeneration || !(await get('enabled'))) throw new Error('Đồng bộ đã bị tắt.');
      if (action === 'conflict') {
        await status('conflict', 'Có thay đổi khác nhau trên nhiều máy. Chọn bản dữ liệu cần giữ; các bản trước vẫn được lưu trên Drive.', { heads: publicHeads(heads) });
        return;
      }
      let id = chosen?.id;
      let saved = local;
      let downloaded = false;
      if (action === 'upload') {
        id = await upload(local, headIds);
      } else if (action === 'download') {
        await applyRemote(local, remote);
        saved = remote; downloaded = true;
        // Explicitly resolve concurrent immutable heads with a new child snapshot.
        if (heads.length > 1) id = await upload(remote, headIds);
      }
      await set('base', { id, data: saved });
      await set('lastSuccess', Date.now());
      if (downloaded) await set('reloadNeeded', true);
      await status('ok', downloaded ? 'Đã nhận dữ liệu từ Drive. Tải lại trang MapGenie để thấy thay đổi.' : action === 'upload' ? 'Đã lưu toàn bộ dữ liệu lên Drive.' : 'Dữ liệu đã đồng bộ.');
      // Never overwrite an existing snapshot: concurrent uploads remain separate heads.
      // Retain 20 recent snapshots plus every head; only delete known superseded ancestors.
      if (action === 'upload' || downloaded && heads.length > 1) {
        const ordered = [...files].sort((a, b) => String(b.createdTime).localeCompare(String(a.createdTime)));
        const protectedIds = new Set([...headIds, ...ordered.slice(0, 19).map(f => f.id)]);
        for (const file of ordered.slice(19).reverse()) {
          if (protectedIds.has(file.id)) continue;
          try { await request(API + '/files/' + encodeURIComponent(file.id), { method: 'DELETE' }); }
          catch { break; } // Cleanup must never invalidate a successful sync.
        }
      }
    } catch (error) {
      await status('error', error.message || String(error));
      throw error;
    } finally { running = false; }
  }
  async function automatic() {
    if (running || !(await get('enabled'))) return;
    if ((await get('status'))?.state === 'conflict') return;
    try { await sync(); } catch {} // Reported in the settings UI; local changes remain intact.
  }
  async function ensureAlarm() {
    if (!await chrome.alarms.get('fmg-drive-sync')) await chrome.alarms.create('fmg-drive-sync', { periodInMinutes: 1 });
  }
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'fmg-drive-sync') void automatic(); });
  chrome.runtime.onStartup.addListener(() => { void ensureAlarm(); });
  chrome.runtime.onInstalled.addListener(() => { void ensureAlarm(); });
  void ensureAlarm();
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'FMG_DRIVE_UI_V1') return;
    // Only the private settings page can authorize login, resolve conflicts or restore data.
    if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('drive-sync/settings.html')) { respond({ error: 'Không được phép.' }); return; }
    (async () => {
      switch (message.action) {
        case 'status': return { configured: configured(), extensionId: chrome.runtime.id, enabled: !!await get('enabled'), status: await get('status'), lastSuccess: await get('lastSuccess'), reloadNeeded: !!await get('reloadNeeded') };
        case 'connect':
          await token(true); await set('enabled', true); await sync(); return {};
        case 'disconnect':
          if (running) throw new Error('Hãy chờ đồng bộ hoàn tất trước khi ngắt kết nối.');
          generation++; await set('enabled', false); await chrome.identity.clearAllCachedAuthTokens(); await status('off', 'Đã tắt đồng bộ. Dữ liệu trên máy và Drive vẫn còn.'); return {};
        case 'sync': await sync(); return {};
        case 'resolve': await sync({ choice: message.choice, expectedHeads: message.expectedHeads }); return {};
        case 'export': return { data: await database('snapshot') };
        case 'recovery': return { data: (await get('recovery'))?.data || null };
        case 'restore': {
          if (running) throw new Error('Hãy chờ đồng bộ hoàn tất trước khi khôi phục.');
          running = true;
          try {
            const restored = C.canonical(message.data);
            await set('enabled', false);
            const local = await database('snapshot');
            await applyRemote(local, restored);
            await set('reloadNeeded', true);
            await status('off', 'Đã khôi phục database và tắt đồng bộ. Tải lại MapGenie; kết nối lại Drive khi sẵn sàng.');
            return {};
          } finally { running = false; }
        }
        case 'acknowledge': await set('reloadNeeded', false); return {};
        default: throw new Error('Lệnh không hợp lệ.');
      }
    })().then(data => respond({ data })).catch(error => respond({ error: error.message || String(error) }));
    return true;
  });
})();
