(() => {
  'use strict';
  const el = id => document.getElementById(id);
  async function call(action, extra = {}) {
    const result = await chrome.runtime.sendMessage({ type: 'LMG_UPDATES_V1', action, ...extra });
    if (result?.error) throw new Error(result.error);
    return result?.data || {};
  }
  async function refresh() {
    const state = await call('status');
    el('update-version').textContent = 'Đang dùng v' + state.current;
    el('update-status').textContent = state.available ? 'Có bản v' + state.latest + '. Trình cập nhật Windows sẽ tự cài theo lịch nếu đã được thiết lập.' : state.checkedAt ? 'Chưa có bản mới hơn.' : 'Chưa kiểm tra release.';
    el('update-error').textContent = state.error || '';
    el('update-error').hidden = !state.error;
    el('update-time').textContent = state.checkedAt ? 'Kiểm tra gần nhất: ' + new Date(state.checkedAt).toLocaleString('vi-VN') : '';
    const helper = state.helper;
    el('update-helper').textContent = helper?.state === 'not-installed' || !helper ? 'Trình cập nhật Windows chưa được cài. Chạy Install-LMG-Updater.cmd trong thư mục LMG rồi chọn thư mục đã Load unpacked.' : helper.state === 'error' ? 'Trình cập nhật: ' + helper.message : helper.state === 'ready' ? 'Đã cài v' + helper.version + '. LMG sẽ tự nạp lại; tải lại tab MapGenie khi cần.' : helper.state === 'installing' ? 'Windows đang cài bản cập nhật…' : 'Trình cập nhật Windows đã cài. ' + (helper.message || '');
    el('update-release').href = state.url || 'https://github.com/longnguy3n/LongMapgine/releases/latest';
  }
  el('check-update').addEventListener('click', async () => {
    el('check-update').disabled = true;
    try { await call('check', { force: true }); await refresh(); }
    catch (error) { el('update-error').textContent = error.message; el('update-error').hidden = false; }
    finally { el('check-update').disabled = false; }
  });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes['lmgUpdates.state']) void refresh().catch(() => {}); });
  void refresh().catch(() => {});
  setInterval(() => { void refresh().catch(() => {}); }, 15000);
})();
