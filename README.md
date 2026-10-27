# LMG — LongMapgine

Chrome extension for MapGenie with local progress storage and optional Google Drive synchronization.

LMG is based on the supplied FMG 3.0.12 Chrome bundle. It adds a separate Drive synchronization layer, conflict handling, recovery backups, and Vietnamese setup instructions. This repository contains the packaged upstream JavaScript plus readable source for the Drive integration; it is not a reconstruction of the original TypeScript project.

## Install

1. Download `LMG-1.3.0-chrome.zip` from [Releases](https://github.com/longnguy3n/LongMapgine/releases/latest) and extract it.
2. If you already use FMG, export your existing saves with **Export all games**, then disable that extension.
3. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
4. Select the extracted folder containing `manifest.json`.
5. Open MapGenie and verify your progress. If the old data is missing, import the previous export using **Data Manager**.

Do not run FMG and LMG together on the same page. Local storage inheritance can depend on Chrome's storage partitioning; keep the export when switching builds.

## Automatic Windows updates

The repository and releases are public. LMG checks release metadata every six hours and shows a `NEW` badge when a newer stable package is available. GitHub outages or rate limits no longer produce the red popup error.

Chrome cannot replace an unpacked extension's files by itself. For automatic installation on Windows:

1. Install/extract v1.1.0 or newer. Double-click **Install-LMG-Updater.cmd**.
2. In the folder chooser, select the **actual folder used by Chrome's Load unpacked**. It must contain LMG's `manifest.json`. A Git source checkout is deliberately rejected; use an extracted runtime folder.
3. Close the installer. It registers a task for your current Windows user, with a hidden window and no elevated run level. The first check is scheduled about one minute later, then every six hours while you are signed in.
4. Keep Chrome's **Developer mode enabled**. After a verified package is installed, LMG detects the ready marker within about one minute and reloads itself when Drive sync is not busy. Reload existing MapGenie tabs to use the new page scripts.

For the first transition from **v1.0.0**, install v1.1.0 and press **Reload** in `chrome://extensions` once: v1.0.0 does not contain the automatic reload listener. Later updates use the new listener. Preserve `oauth2` when replacing an existing configured manifest manually; the Windows updater preserves it automatically.

The updater accepts only the exact LongMapgine release URL, verifies SHA-256 (and GitHub's asset digest when present), validates the extension public key/version and ZIP paths, preserves the local OAuth configuration, and swaps the complete folder with rollback if the swap fails. Backups remain in a sibling `.lmg-updates-*` directory. It does not change Chrome profiles or IndexedDB files. Downloads and the scheduled helper are under `%LOCALAPPDATA%\LongMapgine\updater\`.

To stop background updates, run **Uninstall-LMG-Updater.cmd** and select the same extension folder. The task is removed; extension data and backups remain. Moving the extension folder requires uninstalling the old task and installing one for the new path.

The helper runs PowerShell already included with Windows; Node.js is not required for updating. The folder chooser intentionally leaves selecting the installed copy to you. Setup does not turn Developer mode on or modify browser security policies.

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
- Sync covers locations, tracked categories, notes, presets/order, bookmarks, profiles, legacy database tables and LMG map preferences: found locations visibility, map type, interior overlays, tag filters, showing notes on load and tile-coordinate swap.
- Upgrade **every device to 1.3.0 or newer**. Reopen maps after upgrading to collect existing preferences from that website's localStorage. One page collects all LMG preferences for its origin, including other games; open each supported website you used before the first manual sync. Preferences remain scoped to the same website origin on other devices.
- Full backups now use `lmg-database-v2`. Older database backups remain importable and preserve settings they never contained; older extension versions reject v2 instead of silently discarding settings. The legacy Export all games format does not include map settings; use the full database backup for those.
- Chrome checks Drive about once per minute while it is running. You can also sync manually.
- Snapshots are stored in the app's hidden `appDataFolder`; they do not appear as ordinary files in My Drive.
- Independent edits on two devices stop synchronization until you choose the entire local or remote database. Automatic record-level merging is not implemented.
- Each cloud upload creates a new snapshot. Concurrent uploads remain separate heads instead of overwriting each other. The app retains approximately 20 recent snapshots plus unresolved heads.
- Before applying remote data, LMG saves a local recovery copy and atomically checks that local data has not changed during the download.
- Reload open MapGenie tabs after receiving remote changes.
- MapGenie authentication tokens, cookies and map caches are not included in Drive snapshots.

Map settings are copied into IndexedDB and included in the same atomic snapshot/restore transaction as presets and progress. Stale tabs cannot write settings over a newly downloaded snapshot; reload the map when prompted. Settings are shared by game/map on a website, while presets retain their existing profile ownership. OAuth configuration, updater paths and the extension's power switch stay local.

## Ads and Admiral

LMG blocks identified ad scripts on supported map websites, including MapGenie's Pogo scripts and the observed Admiral host, and hides known ad containers. A persistent observer also hides late-arriving overlays branded **Powered by Admiral**. The existing LMG power switch controls the added network and page rules. The rules preserve map resources, Google sign-in, consent scripts and ordinary dialogs. Ad providers can change their domains or markup, so future variants may need another rule update.

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

Version 1.1.1 passed 22 JavaScript tests, ten Windows updater tests, the original Chromium integration suite, and a real folder-swap/reload test with Chromium running. The reload test verified that OAuth configuration, extension ID and IndexedDB data survived the update. The updater was also tested against a real public GitHub release download, including its binary checksum response. Tests use isolated folders and do not register a persistent task for the user's real extension.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/updater.ps1
node tests/update-browser.cjs
```

**Live Google OAuth, real Drive transfers, and concurrent real-device sync have not been validated yet.** They require an OAuth client configured for this extension. The mock browser test does not certify compatibility with every current MapGenie page.

To regenerate icons from the native SVG:

```sh
npm run icons
```

To package a release in PowerShell:

```powershell
./tools/package.ps1
```

Packaging uses an explicit runtime-file list, excludes tests/dependencies/Git metadata, omits local OAuth configuration from the archive without editing the working manifest, and writes a ZIP plus SHA-256 checksum into `dist/`.

## Source map

| Path | Purpose |
| --- | --- |
| `drive-sync/core.js` | Validation, canonical snapshots and conflict decisions |
| `drive-sync/database.js` | Isolated backend adapter and atomic database replacement |
| `drive-sync/worker.js` | OAuth, Drive requests, scheduling, snapshots and recovery |
| `drive-sync/settings.*` | Drive settings and setup UI |
| `drive-sync/entry.js` | Starts the Drive worker and existing extension worker |
| `configure-drive.cjs` | Adds the public OAuth Client ID to the local manifest |
| `updates/` | Periodic release checks, update status UI and safe runtime reload |
| `updater/` | Windows folder chooser, scheduled task and verified ZIP installer |
| `background.js`, `page.js`, `content-scripts/`, `chunks/` | Bundled upstream extension with integration/branding changes |

Internal `fmg:*` database names, `FMG_DRIVE_*` messages and snapshot formats are intentionally retained for compatibility with the preceding build. Keep the manifest public key unchanged to preserve the extension ID.

## Credits

Original FMG project: [V1P3R-FMG/free-map-genie](https://github.com/V1P3R-FMG/free-map-genie), by V1P3R and its contributors. LMG branding and the Drive integration are maintained in [longnguy3n/LongMapgine](https://github.com/longnguy3n/LongMapgine). See [third-party notices](THIRD-PARTY-NOTICES.md).

Official API references: [Chrome OAuth](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth), [Drive application data](https://developers.google.com/workspace/drive/api/guides/appdata), [Drive uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

### Update immediately (v1.2.0)

Run the new **Install-LMG-Updater.cmd** once and select the extracted runtime folder. This also registers a per-user native messaging host restricted to LMG. In LMG settings, **Cập nhật ngay** starts the Windows updater task immediately and reports completion or failure. **Kiểm tra phiên bản** only checks GitHub metadata. The six-hour schedule remains available. Existing updater users must run the new installer once to enable the button; uninstall removes both the selected task and its native host registrations.

Use a runtime folder rather than the repository checkout: the installer rejects folders containing `.git`. Google Chrome and Chromium are registered; no administrator privileges or Node.js are needed for the updater. Native messaging follows the [Chrome native messaging interface](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

### OAuth saved but not loaded

`configure-drive.cjs` now prints the exact manifest path it changed. LMG settings compare the saved manifest with Chrome's loaded configuration and show **Nạp lại extension để nhận OAuth** when a reload is needed. Reloading the web page alone does not reload the extension manifest. The reload button waits for active Drive work to finish and flushes the database before reloading. Live Google OAuth authorization still requires your own correctly configured Google Cloud client.

Verification for v1.2.0: JavaScript tests cover manual-update completion, missing registration, failed tasks, concurrent clicks, sender restrictions and OAuth detection. Windows tests preserve the native host marker across folder replacement. An isolated Chromium test installs a temporary native host and Windows task, clicks the actual Update now button, verifies immediate task execution, and removes the test registrations. It also changes OAuth on disk and verifies that extension reload enables Connect. Separate browser tests cover popup clicks, database restore/persistence and automatic reload when adding the nativeMessaging permission.

### Manual backups and Data-tab recovery (v1.2.1)

The Data tab refreshes profile/page availability while visible and after switching tabs or profiles. **Export all games** writes a legacy v3 file for the active profile. **Tải bản sao toàn bộ dữ liệu** writes the full `fmg-database-v1` snapshot across all profiles and requires neither an active profile nor Google OAuth; restore it in Drive settings using **Khôi phục file database**. Opening Data Manager is also independent of profile availability. Actions for the current map/game retain their context requirements.

`node tests/data-browser.cjs` exercises late profile arrival, real legacy/full/Drive downloads, opening Data Manager without a profile, unchanged data after export, and both standalone and embedded popup contexts. The corresponding new endpoint is read-only and accepts messages only from LMG's own popup.

### Local profiles (v1.2.2)

Profiles can be created from an empty list without MapGenie login. The first local profile becomes active automatically. The old empty-state message incorrectly said "User not logged in" and hid the create button. Profile operations now show failures and preserve the existing selection if activation fails.

The compiled repository copies in `content-scripts/backend.js` and `chunks/react-redux-toastr.min-Z6pgLarm.js` now allocate negative profile IDs inside a single IndexedDB transaction, considering both profiles and user IDs in progress tables. This fixes third-profile/concurrent collisions and avoids assigning retained progress from a deleted profile to a new one. Deletion removes the newest local profile's list entry, preserves its progress rows, and selects a remaining profile if necessary. The UI asks for confirmation before deletion.

Run `node tests/profiles-browser.cjs` for real offline profile creation, activation/reload persistence, concurrent ID allocation, deletion, and export availability in both popup contexts. MapGenie account-specific imports still require login; local LMG profiles are independent of that account.
