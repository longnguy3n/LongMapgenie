/* Shared pure logic. No credentials or browser APIs. */
(function (root) {
  'use strict';
  const TABLES = ['bookmarks', 'categories', 'categories_v2', 'locations', 'locations_v2', 'notes', 'presets', 'presetsOrdering', 'profiles'];
  const KEYS = {
    bookmarks: ['url'], categories: ['id', 'user_id'], locations: ['id', 'user_id'],
    categories_v2: ['game_id', 'user_id', 'id'], locations_v2: ['game_id', 'user_id', 'id'],
    notes: ['id'], presets: ['id'], presetsOrdering: ['id', 'user_id'], profiles: ['id']
  };
  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  function validate(data) {
    if (data?.format !== 'fmg-database-v1' || !data.tables || Array.isArray(data.tables)) throw new Error('Định dạng dữ liệu LMG không hợp lệ.');
    if (stable(Object.keys(data.tables).sort()) !== stable(TABLES)) throw new Error('Phiên bản cấu trúc database không tương thích.');
    for (const name of TABLES) {
      const rows = data.tables[name];
      if (!Array.isArray(rows)) throw new Error('Bảng dữ liệu không hợp lệ: ' + name);
      const keys = new Set();
      for (const row of rows) {
        if (!row || Array.isArray(row) || typeof row !== 'object') throw new Error('Bản ghi không hợp lệ: ' + name);
        const parts = KEYS[name].map(key => row[key]);
        if (parts.some(v => !['string', 'number'].includes(typeof v) || (typeof v === 'number' && !Number.isFinite(v)))) throw new Error('Khóa bản ghi không hợp lệ: ' + name);
        const key = stable(parts);
        if (keys.has(key)) throw new Error('Khóa bản ghi trùng: ' + name);
        keys.add(key);
      }
    }
    return data;
  }
  function canonical(data) {
    validate(data);
    const tables = {};
    for (const name of TABLES) tables[name] = [...data.tables[name]].sort((a, b) => stable(KEYS[name].map(k => a[k])).localeCompare(stable(KEYS[name].map(k => b[k])), 'en'));
    return { format: 'fmg-database-v1', tables };
  }
  const equal = (a, b) => stable(canonical(a)) === stable(canonical(b));
  // A fresh browser may already have a MapGenie account row. That is not saved progress.
  const empty = data => TABLES.every(t => t === 'profiles' || data.tables[t].length === 0);
  function decide(local, remote, base) {
    validate(local);
    if (!remote) return 'upload';
    validate(remote);
    if (equal(local, remote)) return 'same';
    if (!base) return empty(local) ? 'download' : 'conflict';
    if (equal(local, base)) return 'download';
    if (equal(remote, base)) return 'upload';
    return 'conflict';
  }
  function heads(files) {
    const superseded = new Set(files.flatMap(f => f.parents));
    const result = files.filter(f => !superseded.has(f.id));
    if (files.length && !result.length) throw new Error('Lịch sử đồng bộ không hợp lệ.');
    return result;
  }
  const api = { TABLES, KEYS, stable, validate, canonical, equal, empty, decide, heads };
  root.FMGDriveCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
