const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
test('native updater rejects untrusted origins, arbitrary actions and oversized messages before accessing tasks', { skip: process.platform !== 'win32' }, () => {
  const origin = 'chrome-extension://okoelmnpaigkpbnooodiafamdbikbian/';
  for (const item of [
    { origin: 'https://mapgenie.io/', action: 'update', error: /Origin/ },
    { origin, action: 'run-command', error: /Unknown updater action/ },
    { origin, action: 'update', size: 4097, error: /message size/ }
  ]) {
    const body = Buffer.from(JSON.stringify({ action: item.action }));
    const header = Buffer.alloc(4); header.writeUInt32LE(item.size || body.length);
    const result = spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname, '../updater/NativeHost.ps1'),'-Origin',item.origin], {
      input: Buffer.concat([header, body]), windowsHide: true, timeout: 15000
    });
    assert.equal(result.status, 0, result.stderr?.toString());
    assert.equal(result.stdout.readUInt32LE(0), result.stdout.length - 4);
    assert.match(JSON.parse(result.stdout.subarray(4).toString()).error, item.error);
  }
});
