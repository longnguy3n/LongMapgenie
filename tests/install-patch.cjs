const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
function replaceOnce(name, before, after) {
  const file = path.join(root, name);
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(after)) return;
  if (source.split(before).length !== 2) throw new Error('Unexpected bundle: ' + name);
  fs.writeFileSync(file, source.replace(before, after));
}
replaceOnce('content-scripts/backend.js', '$v.provide(),s.log("Backend content script started.")', 'globalThis.FMGDriveDB?.attach($v.provide()),s.log("Backend content script started.")');
replaceOnce('background.js', 'handlePort(e){var t;', 'handlePort(e){if(e.name==="FMG_DRIVE_DATABASE_V1")return;var t;');
replaceOnce('popup.html', '<div id="root"></div>', '<div id="root"></div>\n    <button id="fmg-drive-settings">Đồng bộ Google Drive</button>\n    <script src="/drive-sync/popup.js"></script>\n    <link rel="stylesheet" href="/drive-sync/popup.css">');
const manifestPath = path.join(root, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.name = 'LMG';
manifest.version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
manifest.description = 'MapGenie enhancements with optional Google Drive progress sync.';
manifest.permissions = [...new Set([...manifest.permissions, 'identity', 'alarms', 'unlimitedStorage'])];
manifest.host_permissions = [...new Set([...manifest.host_permissions, 'https://www.googleapis.com/*'])];
manifest.background.service_worker = 'drive-sync/entry.js';
manifest.options_ui = { page: 'drive-sync/settings.html', open_in_tab: true };
if (!manifest.key) {
  const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  manifest.key = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}
const backend = manifest.content_scripts.find(script => script.js.includes('content-scripts/backend.js'));
backend.js = ['drive-sync/core.js', 'drive-sync/database.js', 'content-scripts/backend.js'];
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Patched LMG copy. OAuth remains unconfigured until configure-drive.cjs is run.');
