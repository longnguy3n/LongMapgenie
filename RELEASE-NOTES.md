LMG v1.1.2 fixes the unclickable **Đồng bộ Google Drive** button.

The popup's inherited CSS disabled pointer events outside the legacy app container. The Drive button now explicitly accepts clicks, opening the sync settings in both the standalone popup and the popup embedded in MapGenie.

- Existing Windows updater installations receive this release through the normal six-hour check. Refresh open MapGenie tabs after the extension updates.
- For manual installation, download **LMG-1.1.2-chrome.zip**, preserve any configured `oauth2` section when replacing `manifest.json`, and reload LMG in `chrome://extensions`.
- A temporary workaround on older releases is **chrome://extensions → LMG → Details → Extension options**.

Verification: reproduced the failure before the fix, then confirmed real pointer clicks open and initialize settings in both contexts using isolated Chromium. The JavaScript suite also passes. Google sign-in and live Drive transfers are not part of this fix's validation.
