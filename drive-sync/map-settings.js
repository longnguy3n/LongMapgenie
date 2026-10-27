/* Collect only LMG's map preferences; never authentication or arbitrary site storage. */
(() => {
  'use strict';
  const query = new URLSearchParams(location.search);
  if (window !== window.top || query.has('fmgBackend') || query.has('fmgStorage')) return;
  const C = globalThis.FMGDriveCore;
  let known = new Map(), epoch, stopped = false, active = false;
  let queue = Promise.resolve();
  function reloadNotice(message = 'LMG: thiết lập đã thay đổi ở tab khác hoặc từ Drive. Tải lại bản đồ để tiếp tục đồng bộ. ') {
    if (!document.body) { document.addEventListener('DOMContentLoaded', () => reloadNotice(message), { once: true }); return; }
    if (document.getElementById('lmg-settings-reload')) return;
    const notice = document.createElement('div');
    notice.id = 'lmg-settings-reload'; notice.setAttribute('role', 'status');
    notice.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;z-index:2147483647;padding:12px;background:#193c34;color:#fff;border:1px solid #65c89e;border-radius:8px;font:14px sans-serif';
    notice.append(message);
    const button = document.createElement('button'); button.textContent = 'Tải lại bản đồ';
    button.addEventListener('click', () => location.reload()); notice.append(button);
    document.body.append(notice);
  }
  function read() {
    const entries = new Map();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!C.settingKey(key)) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key));
        C.validateSettings([{ origin: location.origin, key, value }]);
        entries.set(key, value);
      } catch { /* Ignore malformed preferences, leave unrelated storage untouched. */ }
    }
    return entries;
  }
  async function send(mode, entries) {
    const result = await chrome.runtime.sendMessage({ type: 'LMG_MAP_SETTINGS_V1', mode, entries, epoch });
    if (!result || result.error) throw new Error(result?.error || 'Không nhận được thiết lập bản đồ.');
    return result.data;
  }
  function capture() {
    if (!active || stopped) return queue;
    const current = read(), changes = [];
    for (const key of new Set([...known.keys(), ...current.keys()])) {
      const before = known.get(key) ?? null, value = current.get(key) ?? null;
      if (before !== value) changes.push({ key, before, value });
    }
    if (!changes.length) return queue;
    known = current;
    queue = queue.then(async () => {
      if (stopped) return;
      const result = await send('patch', changes);
      if (result.reload) {
        stopped = true;
        reloadNotice();
      }
    }).catch(error => {
      // Retain localStorage, retry differences after reconnect instead of dropping offline edits.
      known = new Map([...known, ...changes.map(row => [row.key, row.before])]);
      console.warn('LMG map settings:', error.message);
    });
    return queue;
  }
  globalThis.LMGMapSettingsReady = (async () => {
    const local = read();
    const result = await send('bootstrap', [...local].map(([key, value]) => ({ key, value })));
    epoch = result.epoch;
    const early = read(), edits = [];
    for (const key of new Set([...local.keys(), ...early.keys()])) if ((local.get(key) ?? null) !== (early.get(key) ?? null)) edits.push([key, early.get(key) ?? null]);
    const incoming = new Map(result.entries.map(row => [row.key, row.value]));
    for (const key of new Set([...local.keys(), ...incoming.keys()])) {
      const value = incoming.get(key) ?? null;
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value));
    }
    known = read(); active = true;
    window.addEventListener('lmg:map-setting-change', capture);
    // The originating tab sends the change. Mirroring it would replay stale toggles out of order.
    window.addEventListener('storage', event => { if (event.key === null || C.settingKey(event.key)) known = read(); });
    window.addEventListener('pagehide', capture);
    document.addEventListener('visibilitychange', capture);
    setInterval(capture, 1000);
    // A preference changed while the backend was starting must not be overwritten by bootstrap.
    for (const [key, value] of edits) {
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value));
    }
    await capture();
  })().catch(error => {
    console.warn('LMG map settings initialization:', error.message);
    reloadNotice('LMG chưa kết nối được bộ lưu setting. Tải lại bản đồ để thử lại. ');
  });
})();
