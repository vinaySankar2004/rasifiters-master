# Screen: `people` (android) — the People list

> **Status:** 🏗️ built (`apps/android/`, `d528f75` — goes live with the Phase 4 store release) · **Version:** 0.1.0 ·
> **App:** `android` (Compose) · **Thin port-note.** Full behavior = [`people`](../../../features/people/SPEC.md) (D-C13 /
> D-C14); iOS [`people`](../../ios/people/SPEC.md), web [`members/list`](../../web/members/list/SPEC.md) (`PeopleList`).
> **Location:** `Routes.MEMBER_ROSTER` (`PeopleListScreen`, in `AppScaffold.kt` — replaces `ProgramMembersListScreen`),
> opened by the Members-tab header `People` button (every role — [members](../members/SPEC.md) D-NP1) and the Program
> tab's `People` · `<n> enrolled` row ([program](../program/SPEC.md) D-NP1).
> **Files:** `ui/people/{PeopleListScreen,ActivityVisibilityNotice}.kt`, `core/PeopleStore.kt`, `net/PeopleDtos.kt`.

## Parity (web + iOS)
- Top bar `People` + the program name; `Invite member` · `Send an invite by username` on top for program admins and
  global admins (`isProgramAdmin` → `MEMBER_INVITE`); `Search people` (name or username); rows with initials, the name
  and `You` / `Admin` / `Logger` pills, and the status line `Activity hidden` / `No workouts yet` / `Active today` /
  `Active yesterday` / `Last active <day>`; empty `No one in this program yet.` / `No one matches your search.`; a row
  opens the [person profile](../person-profile/SPEC.md). Kit states: ErrorView (offline copy), stale banner, reconnect
  reload.

## Android realization
- **D-NP1 (search survives navigation):** the query is `rememberSaveable`.
- **D-NP2 (the one-time notice, R10):** `ActivityVisibilityNotice` (`Who can see your activity` + the people D-C12
  body, `Keep visible` / `Hide my activity`; not dismissible by back or an outside tap), flag per member in prefs
  `rasi.people` key `activity_notice_seen.<memberId>`. Hosts: this list (always) and the program picker (only while
  workout sync is on). It shows only when the notification-permission prompt isn't open and has been answered
  (`endNotificationPrompt` on the `POST_NOTIFICATIONS` result) and no Health Connect review is pending; already hidden
  → marked seen without showing; unknown → retried later; counts as seen only once the choice landed.
- **D-NP3 (focus):** a row tap stashes the person in `ProgramContext.people.focus` (the static-route idiom) and pushes
  `members/person`.

## Changelog
| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-10-13 | Initial thin port-note — net-new People list (Phase 4, `d528f75`): Invite row, saved search, status lines + markers, kit states, the per-member visibility notice. |
