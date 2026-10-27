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
    if (!['fmg-database-v1', 'lmg-database-v2'].includes(data?.format) || !data.tables || Array.isArray(data.tables)) throw new Error('Định dạng dữ liệu LMG không hợp lệ. Hãy cập nhật LMG trên tất cả máy.');
    if (data.format === 'lmg-database-v2') validateSettings(data.mapSettings);
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
    return { format: data.format, tables, ...(data.format === 'lmg-database-v2' ? { mapSettings: data.mapSettings.filter(row => row.value !== null).sort((a, b) => stable([a.origin, a.key]).localeCompare(stable([b.origin, b.key]), 'en')) } : {}) };
  }
  const ORIGINS = ['mapgenie.io', 'rdr2map.com', 'fo76map.com', 'division2map.com', 'gta-5-map.com', 'fallout4map.com'].flatMap(host => ['https://' + host, 'http://' + host]);
  function settingKey(key) {
    return typeof key === 'string' && /^mg:settings:game_\d+:(found_locations_shown|map_type|interiors_overlay_disabled|remember_tag_filters|tag_filter_\d+|map_\d+:swap_tile_coordinates|show_notes_on_load)$/.test(key);
  }
  function validateSettings(rows) {
    if (!Array.isArray(rows) || rows.length > 50000) throw new Error('Thiết lập bản đồ không hợp lệ.');
    const seen = new Set();
    for (const row of rows) {
      if (!row || !ORIGINS.includes(row.origin) || !settingKey(row.key) || !(row.value === null || typeof row.value === 'boolean' || row.key.endsWith(':map_type') && typeof row.value === 'string' && row.value.length <= 200)) throw new Error('Thiết lập bản đồ không hợp lệ.');
      const id = stable([row.origin, row.key]);
      if (seen.has(id)) throw new Error('Thiết lập bản đồ bị trùng.');
      seen.add(id);
    }
    return rows;
  }
  // Upgrade old snapshots without erasing settings which that format never stored.
  const withSettings = (data, rows = []) => { validate(data); return canonical({ ...data, format: 'lmg-database-v2', mapSettings: data.format === 'lmg-database-v2' ? data.mapSettings : rows }); };
  const equal = (a, b) => stable(withSettings(a)) === stable(withSettings(b));
  // A fresh browser may already have a MapGenie account row. That is not saved progress.
  const empty = data => TABLES.every(t => t === 'profiles' || data.tables[t].length === 0) && !(data.mapSettings?.length);
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
  const api = { TABLES, KEYS, ORIGINS, settingKey, validateSettings, withSettings, stable, validate, canonical, equal, empty, decide, heads };
  root.FMGDriveCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
