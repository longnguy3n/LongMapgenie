(function (root) {
  'use strict';
  const REPO = 'https://github.com/longnguy3n/LongMapgenie';
  function version(value) {
    const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/.exec(String(value));
    if (!match) throw new Error('Phiên bản release không hợp lệ.');
    const parts = match.slice(1).filter(v => v !== undefined).map(Number);
    if (parts.some(v => !Number.isSafeInteger(v) || v > 65535)) throw new Error('Phiên bản ngoài giới hạn Chrome.');
    return parts;
  }
  function compare(a, b) {
    const x = version(a), y = version(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
    }
    return 0;
  }
  function release(data) {
    if (data?.draft || data?.prerelease) throw new Error('Bỏ qua bản nháp hoặc thử nghiệm.');
    const number = version(data?.tag_name).join('.');
    const tag = 'v' + number;
    if (data.tag_name !== tag) throw new Error('Tag không đúng định dạng.');
    const filename = 'LMG-' + number + '-chrome.zip';
    const assets = data.assets || [];
    const zip = assets.find(a => a.name === filename);
    const checksum = assets.find(a => a.name === filename + '.sha256');
    const base = REPO + '/releases/download/' + tag + '/';
    if (!zip || !checksum || zip.browser_download_url !== base + filename || checksum.browser_download_url !== base + filename + '.sha256') throw new Error('Release thiếu gói cài hoặc checksum hợp lệ.');
    return { latest: number, url: REPO + '/releases/tag/' + tag, packageUrl: zip.browser_download_url };
  }
  const api = { REPO, version, compare, release };
  root.LMGUpdateCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
