LMG v1.2.2 fixes local profile creation when the Profiles tab is empty.

The old UI displayed "User not logged in" for an empty local profile list and hid the create button unless a profile already existed. Local profile creation has no Pro check in LMG's backend. The Profiles tab now offers **Tạo profile** even without a MapGenie account, and explains that these are local LMG profiles.

- The first local profile is selected automatically. Profiles refresh while the tab is visible, and failed reads/actions show an error instead of pretending the operation succeeded.
- Fixed duplicate IDs when creating a third guest profile. Allocation is transactional and checks existing profile IDs and user IDs referenced by saved progress, so concurrent creation and deleted-profile data do not collide.
- Selecting a missing profile cannot clear the current selection.
- Deleting the newest local profile requires confirmation and selects a remaining profile when needed. Saved progress rows are retained, and new profiles do not inherit those orphaned rows by reusing their IDs.

Verification: all 28 automated tests pass, plus real Chromium/IndexedDB tests for first/third/concurrent creation, activation persistence, invalid selection, delete confirmation/fallback, preserved progress and Data-tab availability in standalone and embedded popups. Existing manual export and database restore tests also pass. All mutations in these tests use isolated profiles; no user's browser database was modified.

Update with **Cập nhật ngay**, or install **LMG-1.2.2-chrome.zip**, reload LMG and refresh MapGenie tabs. Open **Profiles → Tạo profile**. These profiles are stored by LMG; MapGenie account login remains necessary for actions that import from that account.
