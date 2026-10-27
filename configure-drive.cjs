// Usage: node configure-drive.cjs CLIENT_ID.apps.googleusercontent.com
// This public identifier is not a client secret. Do not place secrets in this extension.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const file = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
const id = crypto.createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, c => String.fromCharCode(97 + parseInt(c, 16)));
console.log('Extension ID:', id);
const clientId = process.argv[2];
if (!clientId) {
  console.log('Chay: node configure-drive.cjs CLIENT_ID.apps.googleusercontent.com');
} else {
  if (!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('OAuth Client ID khong hop le.');
  manifest.oauth2 = { client_id: clientId, scopes: ['https://www.googleapis.com/auth/drive.appdata'] };
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  console.log('Da luu Client ID. Reload extension trong Chrome.');
}
