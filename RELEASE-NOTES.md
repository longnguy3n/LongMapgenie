LongMapgenie v1.4.0 adds profile renaming and simplifies the popup. The project and GitHub repository now use the correct name **LongMapgenie**.

- Removed V1P3R from the popup footer; upstream attribution remains in the third-party documentation.
- Added **Đổi tên** beside each profile with Save/Cancel, Vietnamese names, blank/length validation and protection against stale edits. Names are limited to 80 characters. Profile IDs, active selection, progress and preset ownership remain unchanged.
- All profiles and their names are included in Google Drive snapshots. After renaming, use **Đồng bộ ngay**; sync and reload maps on the receiving machine. Existing whole-snapshot conflict handling applies when both devices change data.
- Removed the duplicate full-backup button from Data. Full backup/restore remains available in **Đồng bộ Google Drive**, including without a configured Google login.
- Removed **Import from Mapgenie account** and its bundled client/backend import methods. File import through Data Manager, Export all games and Export current game remain available.
- Corrected package/extension branding, homepage, release URLs and updater endpoints to **longnguy3n/LongMapgenie**. The existing extension ID, OAuth setup, database and installed native-host identity are retained.

**One-time upgrade from 1.3.0 or earlier:** download and extract this release, run its **Install-LMG-Updater.cmd** and select your existing installed extension folder. Use **Cập nhật ngay** or wait for the helper's first check. After installation, press **Reload** in `chrome://extensions` once, then refresh MapGenie tabs. Old helpers pin the former repository URL and cannot accept the renamed repository's asset URLs. The new updater preserves OAuth and backups; later updates use the corrected repository automatically.

Verification covers profile renaming in standalone/embedded popups, validation and stale-edit protection, preservation of IDs and progress/preset ownership, all-profile upload/download through the mocked Drive API, retained manual exports/Drive backups, and Windows updater checks. Tests use isolated browser profiles. Live Google sign-in and transfers between two real Google accounts/devices were not exercised.
