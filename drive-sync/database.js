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
        let port;
        let applying = false;
        const observed = new WeakSet();
        const snapshot = async () => {
          const tables = {};
          await Promise.all(C.TABLES.map(async name => { tables[name] = await db.table(name).toArray(); }));
          return C.canonical({ format: 'fmg-database-v1', tables });
        };
        const send = message => { try { port?.postMessage(message); } catch {} };
        for (const name of C.TABLES) {
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
                data = await db.transaction('r', C.TABLES, snapshot);
              } else if (request.action === 'replace') {
                const next = C.canonical(request.data);
                applying = true;
                try {
                  await db.transaction('rw', C.TABLES, async () => {
                    const current = await snapshot();
                    if (!C.equal(current, request.expected)) throw new Error('Dữ liệu trên máy vừa thay đổi. Hãy đồng bộ lại.');
                    for (const name of C.TABLES) {
                      await db.table(name).clear();
                      if (next.tables[name].length) await db.table(name).bulkPut(next.tables[name]);
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
