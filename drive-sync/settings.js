'use strict';
const $ = id => document.getElementById(id);
let current, busy = false;
const labels = { off: 'Đã tắt', syncing: 'Đang đồng bộ', ok: 'Đã đồng bộ', conflict: 'Cần chọn dữ liệu', error: 'Cần kiểm tra' };
async function call(action, extra = {}) {
  const result = await chrome.runtime.sendMessage({ type: 'FMG_DRIVE_UI_V1', action, ...extra });
  if (result?.error) throw new Error(result.error);
  if (!result) throw new Error('Extension không phản hồi. Hãy Reload extension.');
  return result.data;
}
function render() {
  if (!current) return;
  const state = current.status?.state || 'off';
  $('extension-id').textContent = current.extensionId;
  $('badge').textContent = labels[state] || state;
  $('status').textContent = current.status?.message || (current.configured ? 'Sẵn sàng kết nối Google Drive.' : 'Chưa cấu hình OAuth Client ID. Làm theo các bước bên dưới.');
  $('last-success').textContent = current.lastSuccess ? 'Lần thành công gần nhất: ' + new Date(current.lastSuccess).toLocaleString('vi-VN') : 'Chưa có lần đồng bộ thành công.';
  $('reload').hidden = !current.reloadNeeded;
  for (const button of document.querySelectorAll('button')) button.disabled = busy || state === 'syncing';
  $('connect').disabled = busy || current.enabled || !current.configured;
  $('sync').disabled = busy || !current.enabled || state === 'syncing';
  $('disconnect').disabled = busy || !current.enabled || state === 'syncing';
  $('conflict').hidden = state !== 'conflict';
  const select = $('remote');
  const previous = select.value;
  select.replaceChildren();
  for (const head of current.status?.heads || []) {
    const option = document.createElement('option');
    option.value = head.id;
    option.textContent = new Date(head.createdTime).toLocaleString('vi-VN') + ' · ' + Math.ceil(Number(head.size || 0) / 1024) + ' KB · ' + head.id.slice(-8);
    select.append(option);
  }
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
}
async function refresh() { current = await call('status'); render(); }
async function run(task) {
  busy = true; $('error').hidden = true; render();
  try { await task(); }
  catch (error) { $('error').textContent = error.message; $('error').hidden = false; }
  finally { busy = false; try { await refresh(); } catch (error) { $('error').textContent = error.message; $('error').hidden = false; } }
}
function download(data, label) {
  if (!data) throw new Error('Chưa có bản sao khôi phục trên máy này.');
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'fmg-' + label + '-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
for (const action of ['connect', 'disconnect', 'sync', 'acknowledge']) $(action).addEventListener('click', () => run(() => call(action)));
for (const action of ['export', 'recovery']) $(action).addEventListener('click', () => run(async () => download((await call(action)).data, action)));
$('restore').addEventListener('click', () => $('restore-file').click());
$('restore-file').addEventListener('change', event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || !confirm('Khôi phục toàn bộ database từ file? Đồng bộ sẽ tắt; dữ liệu hiện tại được sao lưu trước khi thay thế.')) return;
  void run(async () => call('restore', { data: JSON.parse(await file.text()) }));
});
for (const [button, local] of [['keep-local', true], ['use-remote', false]]) $(button).addEventListener('click', () => {
  const text = local ? 'Dùng toàn bộ dữ liệu trên máy này làm bản mới trên Drive? Các máy khác sẽ nhận bản này.' : 'Thay toàn bộ dữ liệu trên máy bằng bản Drive đã chọn? Một bản sao cục bộ sẽ được giữ để khôi phục.';
  if (!confirm(text)) return;
  const expectedHeads = (current.status?.heads || []).map(f => f.id).sort();
  const choice = local ? 'local' : $('remote').value;
  void run(() => call('resolve', { choice, expectedHeads }));
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.keys(changes).some(key => key.startsWith('fmgDrive.')) && !busy) void refresh().catch(() => {});
});
void run(async () => {});
