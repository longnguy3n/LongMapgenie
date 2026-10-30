importScripts('../updates/core.js');
(() => {
  'use strict';
  const C = LMGUpdateCore, KEY = 'lmgUpdates.state';
  const current = chrome.runtime.getManifest().version;
  let checking, applying = false, starting;
  const MANUAL = 'lmgUpdates.manual';
  const read = async () => (await chrome.storage.local.get(KEY))[KEY] || {};
  const write = value => chrome.storage.local.set({ [KEY]: value });
  async function check() {
    if (checking) return checking;
    const previous = await read();
    const interval = 15000;
    if (previous.checkedAt && Date.now() - previous.checkedAt < interval) return { ...previous, current };
    checking = (async () => {
      let state = { ...previous, current, checkedAt: Date.now() };
      try {
        const response = await fetch('https://api.github.com/repos/longnguy3n/LongMapgenie/releases/latest', {
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
  async function native(host, action) {
    if (!/^com\.longmapgine\.updater\.f[a-f0-9]{16}$/.test(host || '')) throw new Error('Chạy lại Install-LMG-Updater.cmd của bản mới để bật Cập nhật ngay, rồi chọn đúng thư mục LMG.');
    let result;
    try { result = await chrome.runtime.sendNativeMessage(host, { action }); }
    catch { throw new Error('Không gọi được updater Windows. Chạy lại Install-LMG-Updater.cmd của bản mới và chọn đúng thư mục LMG đã Load unpacked.'); }
    if (result?.error) throw new Error('Updater Windows: ' + result.error);
    if (!result) throw new Error('Updater Windows không phản hồi.');
    return result;
  }
  async function manualStatus() {
    let manual = (await chrome.storage.local.get(MANUAL))[MANUAL];
    if (manual?.state !== 'running') return manual;
    try {
      const result = await native(manual.host, 'status');
      if (!result.running && Date.parse(result.lastRunAt) >= manual.startedAt - 2000) {
        if (result.exitCode !== 0) throw new Error('Cập nhật thất bại (Windows ' + result.exitCode + '). Xem trạng thái updater bên dưới rồi thử lại.');
        manual = { ...manual, state: 'done', message: 'Đã kiểm tra và cài bản mới nhất. Nếu có thay đổi, LMG sẽ tự nạp lại.' };
      } else if (Date.now() - manual.requestedAt > 10 * 60000) throw new Error('Updater chưa hoàn tất sau 10 phút. Kiểm tra kết nối và tác vụ LMG trong Task Scheduler.');
    } catch (error) { manual = { ...manual, state: 'error', message: error.message }; }
    await chrome.storage.local.set({ [MANUAL]: manual });
    return manual;
  }
  async function updateNow() {
    if (starting) return starting;
    starting = (async () => {
      const previous = await manualStatus();
      if (previous?.state === 'running') return previous;
      if (globalThis.LMGUpdateGate?.busy()) throw new Error('Đang đồng bộ Drive. Hãy chờ đồng bộ xong rồi cập nhật.');
      const marker = await localStatus();
      const result = await native(marker?.nativeHost, 'update');
      if (!result.started || !Number.isFinite(Date.parse(result.startedAt))) throw new Error('Updater chưa xác nhận bắt đầu.');
      const manual = { state: 'running', host: marker.nativeHost, startedAt: Date.parse(result.startedAt), requestedAt: Date.now() };
      await chrome.storage.local.set({ [MANUAL]: manual });
      return manual;
    })().finally(() => { starting = null; });
    return starting;
  }
  async function applyReady() {
    if (applying) return;
    const marker = await localStatus();
    if (marker?.state !== 'ready' || !marker.id || !marker.version) return;
    if (C.compare(marker.version, current) <= 0) return;
    const applied = (await chrome.storage.local.get('lmgUpdates.applied'))['lmgUpdates.applied'];
    if (applied === marker.id) return;
    const disk = await (await fetch(chrome.runtime.getURL('manifest.json') + '?t=' + Date.now(), { cache: 'no-store' })).json();
    if (disk.version !== marker.version || disk.key !== chrome.runtime.getManifest().key || !['LMG', 'LongMapgenie'].includes(disk.name)) return;
    if (globalThis.LMGUpdateGate?.busy()) return;
    applying = true;
    try {
      if (globalThis.LMGUpdateGate && !await globalThis.LMGUpdateGate.prepare()) return;
      await chrome.storage.local.set({ 'lmgUpdates.applied': marker.id, 'lmgUpdates.reloadNotice': marker.version });
      chrome.runtime.reload();
    } finally { applying = false; globalThis.LMGUpdateGate?.resume(); }
  }
  async function schedule() {
    // Migrate persistent alarms from older installations. Only explicit UI actions fetch releases.
    await chrome.alarms.clear('lmg-release-check');
    if (!await chrome.alarms.get('lmg-local-update')) await chrome.alarms.create('lmg-local-update', { periodInMinutes: 1 });
  }
  chrome.runtime.onInstalled.addListener(() => { void schedule(); });
  chrome.runtime.onStartup.addListener(() => { void schedule(); });
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'lmg-local-update') void applyReady().catch(() => {});
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'LMG_UPDATES_V1') return;
    const allowed = ['popup.html', 'drive-sync/settings.html'].map(p => chrome.runtime.getURL(p));
    if (sender.id !== chrome.runtime.id || !allowed.includes(sender.url)) { respond({ error: 'Không được phép.' }); return; }
    (async () => {
      if (message.action === 'check') {
        if (sender.url !== chrome.runtime.getURL('drive-sync/settings.html')) throw new Error('Chỉ kiểm tra cập nhật từ trang cài đặt LMG.');
        return await check();
      }
      if (message.action === 'status') return { ...await read(), current, helper: await localStatus(), manual: await manualStatus() };
      if (message.action === 'update-now') {
        if (sender.url !== chrome.runtime.getURL('drive-sync/settings.html')) throw new Error('Chỉ cập nhật từ trang cài đặt LMG.');
        return await updateNow();
      }
      if (message.action === 'apply') { await applyReady(); return {}; }
      throw new Error('Lệnh cập nhật không hợp lệ.');
    })().then(data => respond({ data })).catch(error => respond({ error: error.message }));
    return true;
  });
  void schedule();
})();
