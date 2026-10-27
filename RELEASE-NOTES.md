LMG v1.1.1 adds automatic updates for the Windows Load unpacked installation.

- The GitHub repository and releases are now public.
- Background release checks every six hours, a NEW badge, and update status in settings.
- Removed the red “Failed to fetch latest version” popup on GitHub/network errors.
- Fixed binary checksum responses from GitHub release downloads on Windows PowerShell (v1.1.1).
- Windows updater with a folder chooser: run **Install-LMG-Updater.cmd** and select the folder actually loaded in Chrome.
- A hidden task runs for the current Windows user, first after about one minute and then every six hours. No elevated run level or Node.js is required.
- Verified release URLs, SHA-256 and asset digests, extension identity checks, safe ZIP extraction, OAuth preservation, folder backups and rollback on install failure.
- Automatic extension reload after successful installation; uninstall script removes the scheduled task.

### First-time setup

Download and extract **LMG-1.1.1-chrome.zip**. Run **Install-LMG-Updater.cmd**, choose the installed extension folder and close the installer. Keep Chrome Developer mode enabled. Use an extracted runtime folder, not a Git checkout.

The initial move from v1.0.0 needs one manual Reload in chrome://extensions because v1.0.0 has no automatic reload listener. From v1.1.0 onward, the helper and extension handle installation/reload. Reload open MapGenie tabs to activate updated page scripts.

Google Drive still requires your OAuth Client ID. The updater preserves an already configured oauth2 section. See HUONG-DAN.txt and the README for setup and recovery.

### Verification

Passed 22 JavaScript tests, ten Windows updater tests, the original Chromium integration suite, and a live native-folder-swap test with Chromium running. That test confirmed automatic reload while retaining the extension ID, OAuth configuration and real IndexedDB data. All tests use isolated folders/profiles; no background task was installed for your real extension.

Google OAuth sign-in and real Drive transfers remain unverified without a configured client. The .sha256 attachment contains the ZIP checksum.
