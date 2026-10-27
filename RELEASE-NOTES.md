LMG v1.2.0 adds **Cập nhật ngay** and clearer OAuth setup diagnostics.

- **Cập nhật ngay** starts the installed Windows updater immediately through Chrome native messaging, with progress and completion/error feedback. The existing six-hour schedule remains available.
- Run the new **Install-LMG-Updater.cmd** once to enable the button, even if an older updater is already installed. Choose the extracted extension folder loaded in Chrome, not a Git checkout. The installer registers the native host for the current user; uninstall removes it with the selected scheduled task.
- The native host accepts only LMG's extension origin and the fixed update/status actions. The extension allows installation requests only from its private settings page. Release URL, SHA-256, extension identity, backup and OAuth-preservation checks remain in place.
- OAuth settings now detect when Client ID has been saved but Chrome still has the old manifest, and offer **Nạp lại extension để nhận OAuth**. The configuration script prints the exact file it changed.

Verification: JavaScript and Windows updater suites; real Chromium click through the native host into a temporary Windows task; OAuth saved-on-disk detection and reload; popup click regression; database restore/persistence; automatic reload including the new nativeMessaging permission. Test tasks and native registrations were removed after the integration run. Real Google sign-in/Drive transfers were not exercised.

Download **LMG-1.2.0-chrome.zip**, preserve your existing OAuth settings when replacing manifest.json manually, reload LMG, and rerun the installer once. Refresh open MapGenie tabs after updates.
