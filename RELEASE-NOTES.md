LMG v1.2.1 fixes Data-tab controls staying disabled after the active profile becomes available.

Previously, the popup read the profile only once on mount. If the backend/profile loaded later or changed while the popup remained open, Data kept its old disabled state. Data now refreshes when opened, when the profile list changes, on focus, and periodically while visible. Backend requests are bounded and connection problems are shown inline.

- **Export all games** becomes available once the current profile is detected and retains the legacy v3 save format.
- **Tải bản sao toàn bộ dữ liệu** downloads a complete database backup, including every profile, even when no active profile is selected. Restore this format through Google Drive settings → Khôi phục file database; it is distinct from the legacy Data Manager format.
- **Open data manager** can be used without an active profile.
- Current-game/map and destructive actions still require the relevant page/profile context. The tab explains those requirements instead of leaving only disabled controls.

Verification: reproduced the old disabled-state failure; 28 automated tests pass. Real Chromium clicks download and validate legacy v3 exports, full backups with/without an active profile, and the Drive settings export, in both standalone and MapGenie-embedded popups. Checks verify no data changes during export and reject requests from web pages. Drive-button regression tests also pass.

Update using **Cập nhật ngay**, or install **LMG-1.2.1-chrome.zip** and reload the extension. Refresh open MapGenie tabs afterward. Existing OAuth settings are preserved by the Windows updater.
