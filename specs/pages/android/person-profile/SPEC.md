# Screen: `person-profile` (android) — a person's profile + kudos

> **Status:** 🏗️ built (`apps/android/`, `d528f75` — goes live with the Phase 4 store release) · **Version:** 0.1.0 ·
> **App:** `android` (Compose) · **Thin port-note.** Full behavior = [`people`](../../../features/people/SPEC.md) §3 §C–§E
> (D-C13 / D-C14); iOS [`people`](../../ios/people/SPEC.md) (`PersonProfileView`), web
> [`members/person`](../../web/members/person/SPEC.md).
> **Location:** `Routes.PERSON_PROFILE` = `members/person` (`PersonProfileScreen`, `AppScaffold.kt`), from a
> [`people`](../people/SPEC.md) row.
> **Files:** `ui/people/PersonProfileScreen.kt`, `core/PeopleStore.kt`.

## Parity (web + iOS)
- Top bar `Profile`; the header (initials, name, markers); when activity is visible: stat tiles `Current streak`,
  `Longest streak`, `This month` (`1 day` / `N days`), `Last active` (`Today` / `Yesterday` / `Oct 12` / `—`) — compact
  one-line label over a one-line value so they fit at 360 dp; `Recent workouts` / `No workouts logged yet.`; kudos `<n>
  kudos` + `Give kudos` / `Kudos given` + `You gave kudos today. Tap again to undo.`; otherwise `This member keeps their
  activity private.`
- Staff rows: `Open full stats` · `History, streaks, health` (when `canOpenFullStats`) → `members/full-stats`
  ([member-management](../member-management/SPEC.md) D-NP3 — `MemberFullStatsScreen`); `Edit membership` · `Joined
  date, status, remove` (global admins) → `MEMBER_EDIT` (the editor loads its own data before rendering — R6, its D-NP2).
- Kit states (ErrorView, stale banner, reconnect reload).

## Android realization
- **D-NP1 (kudos):** an undo subtracts 1 only when `removed`; a 403 re-fetches the profile; a 429 shows `You've changed
  kudos too many times. Try again later.` (`PeopleStore`).
- **D-NP2 (Edit membership row):** shown for global admins without waiting on a load here — the gating (R6) lives in
  the editor screen, which renders only once its own `loadMembershipDetails()` finished.

## Changelog
| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-10-13 | Initial thin port-note — net-new person profile (Phase 4, `d528f75`): stats tiles (360 dp fit), recent workouts, kudos toggle + undo + 429 / 403 handling, hidden line, Open full stats, Edit membership. |
