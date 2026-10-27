// Small readable helpers for the compiled legacy Data tab.
export function withTimeout(work, milliseconds = 8000) {
  let timer;
  return Promise.race([
    Promise.resolve().then(work),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Chưa kết nối được dữ liệu. Hãy tải lại trang MapGenie rồi thử lại.')), milliseconds); })
  ]).finally(() => clearTimeout(timer));
}

export async function readDataStatus(backend) {
  const [login, profile] = await Promise.allSettled([
    withTimeout(() => backend.isLoggedIn()), withTimeout(() => backend.getActiveProfile())
  ]);
  return {
    mapgenieLoggedIn: login.status === 'fulfilled' && !!login.value,
    hasActiveProfile: profile.status === 'fulfilled' && profile.value != null,
    statusError: profile.status === 'rejected' ? profile.reason?.message || 'Không đọc được profile.' : null
  };
}

export function watchDataStatus(refresh) {
  let pending = false, stopped = false;
  const run = async () => {
    if (pending || stopped) return;
    pending = true;
    try { await refresh(); } finally { pending = false; }
  };
  void run();
  const timer = setInterval(() => { void run(); }, 5000);
  window.addEventListener('focus', run);
  return () => { stopped = true; clearInterval(timer); window.removeEventListener('focus', run); };
}

export async function downloadFullBackup() {
  const response = await chrome.runtime.sendMessage({ type: 'LMG_DATA_EXPORT_V1' });
  if (response?.error) throw new Error(response.error);
  if (!['fmg-database-v1', 'lmg-database-v2'].includes(response?.data?.format)) throw new Error('Chưa đọc được database. Hãy thử lại.');
  const url = URL.createObjectURL(new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'lmg-database-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
