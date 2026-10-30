LongMapgenie v1.4.1 makes release checks and Windows updates manual-only.

- Removed the six-hour Windows trigger and the first automatic run after installation. Re-running the installer replaces old timer triggers with an on-demand task, while keeping the native-host identity and **Cập nhật ngay** working. Missed scheduled checks are not replayed at login.
- Removed the Chrome release-check alarm and startup/install checks. Opening the popup now reads cached status; it does not contact GitHub. Existing release-check alarms are cleared when the updated worker starts.
- **Kiểm tra phiên bản** fetches GitHub metadata only when clicked, without launching PowerShell. **Cập nhật ngay** starts the Windows helper to check/download/install. Ready-marker polling only reads local files to finish a user-requested update; Google Drive sync is unchanged.
- Updated settings text and installation instructions to describe manual-only behavior.

For an existing installation, run **Install-LMG-Updater.cmd from this version once** and select the actual installed extension folder to remove the Windows timer. Reload the extension to load the new Chrome behavior. The source checkout must not be selected as the updater's installation target.

Validation: automated checks confirm startup, stale timer events and popup status reads make no GitHub requests; explicit checks still work. The Chromium/native-host test migrates a periodic Windows fixture task to zero triggers, verifies it does not run during setup, then starts it successfully using **Cập nhật ngay**. Tests use isolated tasks and browser profiles.
