# LMG — LongMapgine

Chrome extension for MapGenie with local progress storage and optional Google Drive synchronization.

LMG is based on the supplied FMG 3.0.12 Chrome bundle. It adds a separate Drive synchronization layer, conflict handling, recovery backups, and Vietnamese setup instructions. This repository contains the packaged upstream JavaScript plus readable source for the Drive integration; it is not a reconstruction of the original TypeScript project.

## Install

1. Download `LMG-1.0.0-chrome.zip` from [Releases](https://github.com/longnguy3n/LongMapgine/releases/latest) and extract it.
2. If you already use FMG, export your existing saves with **Export all games**, then disable that extension.
3. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
4. Select the extracted folder containing `manifest.json`.
5. Open MapGenie and verify your progress. If the old data is missing, import the previous export using **Data Manager**.

Do not run FMG and LMG together on the same page. Local storage inheritance can depend on Chrome's storage partitioning; keep the export when switching builds.

## Google Drive setup

Drive sync is **off by default**. A release does not contain an OAuth Client ID and cannot sign in to Google until you configure one.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable **Google Drive API**.
2. Configure Google Auth Platform branding/audience. For an External app in Testing, add your account as a test user.
3. Create a **Chrome Extension** OAuth client (some interfaces call it Chrome App) using this extension ID:

   ```text
   okoelmnpaigkpbnooodiafamdbikbian
   ```

4. Configure the `https://www.googleapis.com/auth/drive.appdata` scope as required by the Google console.
5. In the extracted extension folder, run:

   ```sh
   node configure-drive.cjs YOUR_CLIENT_ID.apps.googleusercontent.com
   ```

6. Reload LMG in `chrome://extensions`, open its popup, choose **Đồng bộ Google Drive**, then **Kết nối Google Drive**.

Only the public Client ID is needed; do not include a Client Secret. Sign in to Chrome with the Google account you want to use. Copy the same configured extension, including its manifest public key and Client ID, to the second machine. Use the same Google account and OAuth project on each device.

The complete Vietnamese guide is [HUONG-DAN.txt](HUONG-DAN.txt). Configuration help is also built into the Drive settings page.

## Sync behavior

- Local IndexedDB remains the primary store, including when offline.
- Sync covers locations, tracked categories, notes, presets/order, bookmarks, profiles, and legacy database tables.
- Chrome checks Drive about once per minute while it is running. You can also sync manually.
- Snapshots are stored in the app's hidden `appDataFolder`; they do not appear as ordinary files in My Drive.
- Independent edits on two devices stop synchronization until you choose the entire local or remote database. Automatic record-level merging is not implemented.
- Each cloud upload creates a new snapshot. Concurrent uploads remain separate heads instead of overwriting each other. The app retains approximately 20 recent snapshots plus unresolved heads.
- Before applying remote data, LMG saves a local recovery copy and atomically checks that local data has not changed during the download.
- Reload open MapGenie tabs after receiving remote changes.
- MapGenie authentication tokens, cookies and map caches are not included in Drive snapshots.

Use **Tải database hiện tại** and **Khôi phục file database** for full database backups. These files differ from the original **Export all games** format, which is still imported through Data Manager.

## Development and verification

Requires Node.js 20 or newer. The extension itself loads unpacked without an npm build step.

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

The browser suite uses an isolated temporary profile and intercepted website responses. It tests the real extension worker, offscreen iframe, Dexie/IndexedDB reads and writes, restore validation, recovery, persistence, and settings layout. It does not log in to Google. `CHROMIUM_PATH` and `PLAYWRIGHT_MODULE` can override the browser executable and Playwright module location.

The first release passed 14 automated logic tests and the Chromium integration suite. **Live Google OAuth, real Drive transfers, and concurrent real-device sync have not been validated yet.** They require an OAuth client configured for this extension. The mock browser test does not certify compatibility with every current MapGenie page.

To regenerate icons from the native SVG:

```sh
npm run icons
```

To package a release in PowerShell:

```powershell
./tools/package.ps1
```

Packaging uses an explicit runtime-file list, excludes tests/dependencies/Git metadata, rejects a locally configured OAuth client, and writes a ZIP plus SHA-256 checksum into `dist/`.

## Source map

| Path | Purpose |
| --- | --- |
| `drive-sync/core.js` | Validation, canonical snapshots and conflict decisions |
| `drive-sync/database.js` | Isolated backend adapter and atomic database replacement |
| `drive-sync/worker.js` | OAuth, Drive requests, scheduling, snapshots and recovery |
| `drive-sync/settings.*` | Drive settings and setup UI |
| `drive-sync/entry.js` | Starts the Drive worker and existing extension worker |
| `configure-drive.cjs` | Adds the public OAuth Client ID to the local manifest |
| `background.js`, `page.js`, `content-scripts/`, `chunks/` | Bundled upstream extension with integration/branding changes |

Internal `fmg:*` database names, `FMG_DRIVE_*` messages and snapshot formats are intentionally retained for compatibility with the preceding build. Keep the manifest public key unchanged to preserve the extension ID.

## Credits

Original FMG project: [V1P3R-FMG/free-map-genie](https://github.com/V1P3R-FMG/free-map-genie), by V1P3R and its contributors. LMG branding and the Drive integration are maintained in [longnguy3n/LongMapgine](https://github.com/longnguy3n/LongMapgine). See [third-party notices](THIRD-PARTY-NOTICES.md).

Official API references: [Chrome OAuth](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth), [Drive application data](https://developers.google.com/workspace/drive/api/guides/appdata), [Drive uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads).
