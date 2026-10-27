/* Runs only in the existing MapGenie backend iframe, in the isolated extension world. */
(() => {
  'use strict';
  if (!new URLSearchParams(location.search).has('fmgBackend')) return;
  const C = globalThis.FMGDriveCore;
  globalThis.FMGDriveDB = {
    async attach(backend) {
      try {
        const db = backend.database.dexie;
        await db.open();
        const stores = [...C.TABLES, 'lmgSettings', 'lmgState'];
        let port;
        let applying = false;
        const observed = new WeakSet();
        const snapshot = async () => {
          const tables = {};
          await Promise.all(C.TABLES.map(async name => { tables[name] = await db.table(name).toArray(); }));
          const mapSettings = (await db.table('lmgSettings').toArray()).filter(row => row.value !== null);
          return C.canonical({ format: 'lmg-database-v2', tables, mapSettings });
        };
        const send = message => { try { port?.postMessage(message); } catch {} };
        for (const name of [...C.TABLES, 'lmgSettings']) {
          const watch = (...args) => {
            const transaction = args[args.length - 1];
            if (applying || !transaction || observed.has(transaction)) return;
            observed.add(transaction);
            transaction.on('complete', () => send({ event: 'dirty' }));
          };
          db.table(name).hook('creating', watch);
          db.table(name).hook('updating', watch);
          db.table(name).hook('deleting', watch);
        }
        function connect() {
          port = chrome.runtime.connect({ name: 'FMG_DRIVE_DATABASE_V1' });
          port.onMessage.addListener(async request => {
            if (request?.channel !== 'FMG_DRIVE_DATABASE_V1') return;
            try {
              let data;
              if (request.action === 'snapshot') {
                data = await db.transaction('r', stores, snapshot);
              } else if (request.action === 'map-settings') {
                const { origin, entries, epoch, mode } = request;
                if (!C.ORIGINS.includes(origin) || !['bootstrap', 'patch'].includes(mode)) throw new Error('Nguồn thiết lập không hợp lệ.');
                C.validateSettings(entries.map(row => ({ origin, key: row.key, value: row.value })));
                data = await db.transaction('rw', ['lmgSettings', 'lmgState'], async () => {
                  const settings = db.table('lmgSettings'), state = await db.table('lmgState').get('settings') || { id: 'settings', epoch: 0 };
                  if (mode === 'patch' && epoch !== state.epoch) return { reload: true };
                  const current = (await settings.toArray()).filter(row => row.origin === origin);
                  const byKey = new Map(current.map(row => [row.key, row.value]));
                  if (mode === 'patch' && entries.some(row => (byKey.get(row.key) ?? null) !== row.before && (byKey.get(row.key) ?? null) !== row.value)) return { reload: true };
                  for (const row of entries) {
                    if (mode === 'patch' || !state.restored && !byKey.has(row.key)) await settings.put({ origin, key: row.key, value: row.value });
                  }
                  return { epoch: state.epoch, entries: (await settings.toArray()).filter(row => row.origin === origin) };
                });
              } else if (request.action === 'replace') {
                const next = C.canonical(request.data);
                applying = true;
                try {
                  await db.transaction('rw', stores, async () => {
                    const current = await snapshot();
                    if (!C.equal(current, request.expected)) throw new Error('Dữ liệu trên máy vừa thay đổi. Hãy đồng bộ lại.');
                    for (const name of C.TABLES) {
                      await db.table(name).clear();
                      if (next.tables[name].length) await db.table(name).bulkPut(next.tables[name]);
                    }
                    if (next.format === 'lmg-database-v2') {
                      await db.table('lmgSettings').clear();
                      if (next.mapSettings.length) await db.table('lmgSettings').bulkPut(next.mapSettings);
                      const state = await db.table('lmgState').get('settings');
                      await db.table('lmgState').put({ id: 'settings', epoch: (state?.epoch || 0) + 1, restored: true });
                    }
                  });
                } finally { applying = false; }
                data = { replaced: true };
              } else throw new Error('Lệnh database không hợp lệ.');
              send({ channel: 'FMG_DRIVE_DATABASE_V1', id: request.id, data });
            } catch (error) { send({ channel: 'FMG_DRIVE_DATABASE_V1', id: request.id, error: String(error.message || error) }); }
          });
          port.onDisconnect.addListener(() => {
            void chrome.runtime.lastError;
            port = null;
            setTimeout(() => { if (chrome.runtime?.id) connect(); }, 1000);
          });
          send({ event: 'ready' });
        }
        connect();
      } catch (error) { console.error('LMG Drive database:', error); }
    }
  };
})();
