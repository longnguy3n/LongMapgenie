importScripts('../updates/core.js');
(() => {
  'use strict';
  const C = LMGUpdateCore, KEY = 'lmgUpdates.state';
  const current = chrome.runtime.getManifest().version;
  let checking, applying = false;
  const read = async () => (await chrome.storage.local.get(KEY))[KEY] || {};
  const write = value => chrome.storage.local.set({ [KEY]: value });
  async function check(force = false) {
    if (checking) return checking;
    const previous = await read();
    const interval = force ? 15000 : 6 * 3600000;
    if (previous.checkedAt && Date.now() - previous.checkedAt < interval) return { ...previous, current };
    checking = (async () => {
      let state = { ...previous, current, checkedAt: Date.now() };
      try {
        const response = await fetch('https://api.github.com/repos/longnguy3n/LongMapgine/releases/latest', {
          headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error(response.status === 404 ? 'Chưa truy cập được release. Sẽ thử lại sau.' : response.status === 403 || response.status === 429 ? 'GitHub đang giới hạn lượt kiểm tra. Sẽ thử lại sau.' : 'Không kiểm tra được phiên bản (HTTP ' + response.status + ').');
        state = { ...state, ...C.release(await response.json()), error: null };
        state.available = C.compare(state.latest, current) > 0;
      } catch (error) { state.error = error.message || 'Không có kết nối. Sẽ kiểm tra lại sau.'; }
      await write(state);
      await chrome.action.setBadgeText({ text: state.available ? 'NEW' : '' });
      if (state.available) await chrome.action.setBadgeBackgroundColor({ color: '#227c60' });
      return state;
    })().finally(() => { checking = null; });
    return checking;
  }
  async function localStatus() {
    try {
      const response = await fetch(chrome.runtime.getURL('lmg-update-status.json') + '?t=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) return null;
      return await response.json();
    } catch { return null; }
  }
  async function applyReady() {
    if (applying) return;
    const marker = await localStatus();
    if (marker?.state !== 'ready' || !marker.id || !marker.version) return;
    if (C.compare(marker.version, current) <= 0) return;
    const applied = (await chrome.storage.local.get('lmgUpdates.applied'))['lmgUpdates.applied'];
    if (applied === marker.id) return;
    const disk = await (await fetch(chrome.runtime.getURL('manifest.json') + '?t=' + Date.now(), { cache: 'no-store' })).json();
    if (disk.version !== marker.version || disk.key !== chrome.runtime.getManifest().key || disk.name !== 'LMG') return;
    if (globalThis.LMGUpdateGate?.busy()) return;
    applying = true;
    try {
      if (globalThis.LMGUpdateGate && !await globalThis.LMGUpdateGate.prepare()) return;
      await chrome.storage.local.set({ 'lmgUpdates.applied': marker.id, 'lmgUpdates.reloadNotice': marker.version });
      chrome.runtime.reload();
    } finally { applying = false; globalThis.LMGUpdateGate?.resume(); }
  }
  async function schedule() {
    if (!await chrome.alarms.get('lmg-release-check')) await chrome.alarms.create('lmg-release-check', { periodInMinutes: 360 });
    if (!await chrome.alarms.get('lmg-local-update')) await chrome.alarms.create('lmg-local-update', { periodInMinutes: 1 });
  }
  const backgroundCheck = () => { void check().catch(() => {}); };
  chrome.runtime.onInstalled.addListener(() => { void schedule(); backgroundCheck(); });
  chrome.runtime.onStartup.addListener(() => { void schedule(); backgroundCheck(); });
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'lmg-release-check') backgroundCheck();
    if (alarm.name === 'lmg-local-update') void applyReady().catch(() => {});
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'LMG_UPDATES_V1') return;
    const allowed = ['popup.html', 'drive-sync/settings.html'].map(p => chrome.runtime.getURL(p));
    if (sender.id !== chrome.runtime.id || !allowed.includes(sender.url)) { respond({ error: 'Không được phép.' }); return; }
    (async () => {
      if (message.action === 'check') return await check(!!message.force);
      if (message.action === 'status') return { ...await read(), current, helper: await localStatus() };
      if (message.action === 'apply') { await applyReady(); return {}; }
      throw new Error('Lệnh cập nhật không hợp lệ.');
    })().then(data => respond({ data })).catch(error => respond({ error: error.message }));
    return true;
  });
  void schedule();
})();
