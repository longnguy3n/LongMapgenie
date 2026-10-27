First release of **LMG (LongMapgine)**, based on the FMG 3.0.12 Chrome bundle.

- LMG name, SVG logo and Chrome icons; version and update links now point to LongMapgine.
- Optional Google Drive synchronization for progress, tracked categories, notes, presets, bookmarks and profiles.
- Local offline storage, conflict detection between devices, and recovery backups before remote replacement.
- Vietnamese setup page and OAuth configuration guide.
- Preserved internal storage keys and formats for compatibility with the preceding build.

### Install

Download **LMG-1.0.0-chrome.zip**, extract it, then use **chrome://extensions → Developer mode → Load unpacked**. Export existing FMG data before switching and disable the old extension.

### Google Drive configuration

Google Drive is optional and **requires your own Chrome Extension OAuth Client ID**. No Client ID is bundled. Follow `HUONG-DAN.txt` or the README, then reload the extension and connect from its Drive settings page.

Extension ID: `okoelmnpaigkpbnooodiafamdbikbian`.

### Verification and known limits

- Passed 14 logic tests and an isolated Chromium integration test covering the extension worker, offscreen backend, real IndexedDB, backup/restore, persistence and settings layout.
- Live Google login and real Drive transfers have not been tested without a configured OAuth client.
- Simultaneous independent changes require choosing an entire local or remote database; automatic record merging is not included.
- Reload open MapGenie tabs after downloading changes.

The `.sha256` attachment contains the ZIP's SHA-256 checksum. Upstream FMG credit is retained in the repository.
