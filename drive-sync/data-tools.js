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
