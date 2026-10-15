# Screen: `people` (ios) — People list, person profile, kudos and full stats

> **Status:** 🏗️ built (`apps/ios/`, `198407c` — goes live with the Phase 4 store release) · **Version:** 0.1.1 · **App:** `ios` (SwiftUI)
> **Location:** `PeopleListView`, pushed from the Members-tab header `person.2` button (both role variants —
> [admin-members](../admin-members/SPEC.md)) and the Program tab's `People` row
> ([program-member-management](../program-member-management/SPEC.md)); a row pushes `PersonProfileView`; staff's
> `Open full stats` pushes `MemberFullStatsView`. Files: `Features/Home/People/{PeopleListView,PersonProfileView,
> KudosButton,MemberFullStatsView,ActivityVisibilityNotice}.swift`, `Shared/Services/APIClient+People.swift`.
> **Provenance:** **NET-NEW** (reliability-overhaul Phase 4 Track C — People S3).
> **Web parity reference:** [`web members/list`](../../web/members/list/SPEC.md) (`PeopleList`) +
> [`web members/person`](../../web/members/person/SPEC.md); Android [`people`](../../android/people/SPEC.md) +
> [`person-profile`](../../android/person-profile/SPEC.md).
> **Consumes (features):** [`people`](../../../features/people/SPEC.md) 0.2.0 (D-C13 / D-C14; profile streak D-C15),
> [`member-analytics`](../../../features/member-analytics/SPEC.md) (full stats — D-C12), [`program-memberships`](../../../features/program-memberships/SPEC.md)
> (Edit membership), [`invites`](../../../features/invites/SPEC.md) (Invite member), [`frontend-kit`](../../../features/frontend-kit/SPEC.md).

---

## 1. What it is + who uses it
Every role in the program. **List:** `People` + `Search people` (name or username); an `Invite member` · `Send an
invite by username` row for program admins and global admins (`canEditProgramData` → `InviteMemberView`); rows with
initials, `You` / `Admin` / `Logger` pills and a status line (`Active today` · `Active yesterday` · `Last active Oct 12`
· `No workouts yet` · `Activity hidden`); empty `No one in this program yet.` / `No one matches your search.`
**Profile:** the header, then (activity visible) tiles `Current streak`, `Longest streak` (`N days` / `1 day`), `This
month`, `Last active` (`Today` / `Yesterday` / date / `—`), `Recent workouts` (`No workouts logged yet.`) and the kudos
block — or `This member keeps their activity private.`

## 2. Why it exists
People's social layer (people §1–§2), replacing the old roster (`ProgramMembersListView`, retired).

## 3. Route / location
`NavigationLink` pushes inside the program's tab stacks. The one-time visibility notice is an `.alert` on
`AppRootView` (see §8).

## 4. Contents / sections
| Block | What |
|---|---|
| Kudos (`KudosButton`) | `N kudos` + ONE toggle `Give kudos` ↔ `Kudos given`, hint `You gave kudos today. Tap again to undo.`; undo decrements locally only when `removed`; 429 → `You've changed kudos too many times. Try again later.`; 403 `activity_hidden` re-fetches the profile; `.id(kudos)` resets after a re-fetch. |
| Staff rows | `Open full stats` · `History, streaks, health` (when `can_open_full_stats`) → `MemberFullStatsView` (the five Members cards for that person, its own `MemberCardsOwner` token — member-analytics D-C12); `Edit membership` · `Joined date, status, remove` (global admins) → `MemberDetailEditView`. |

## 5. Components + features consumed
`APIClient+People` (`fetchPeople`, `fetchPersonProfile`, `giveKudos`, `undoKudos`, `fetchHideActivity`,
`setHideActivity`), kit `ErrorStateView` / `FloatingBanner`, `ProgramContext` (`loadMembershipDetails`,
`memberCardsOwner`).

## 6. Data / API
`GET /api/people?programId=` · `GET /api/people/:memberId?programId=` · `POST` / `DELETE /api/people/:memberId/kudos`
(people §3); the full-stats cards use the existing member-analytics routes.

## 7. Role-based view rules
| Role | Sees / can do |
|---|---|
| **global_admin** | Every profile's activity; `Open full stats`; `Edit membership`; `Invite member`; kudos only where an active member. |
| **program admin** | Activity always; `Open full stats`; `Invite member`; kudos. |
| **logger** | Activity always; `Open full stats` (the full cards — no web-style logger divergence); kudos. |
| **member** | Activity unless hidden; kudos (not to self / a hidden member). |

## 8. States & edge cases
- Kit states on list and profile (ErrorView + Retry, stale banner, reconnect reload); a profile that 404s on refresh
  dismisses itself.
- **Edit membership (R6):** shown only after this screen's own `loadMembershipDetails()` finished for the profile's
  program (`detailsProgramId == profile.programId`); a remove pops back to People.
- **Notice (R10):** `Who can see your activity` (`Keep visible` / `Hide my activity`), flag `UserDefaults`
  `people.activityVisibilityNoticeSeen.<memberId>`; offered when People opens and after the launch health sync; never
  while notification permission is undetermined; skipped (marked seen) when already hidden, and when the hidden state
  can't be read; it yields to the covers and returns ~0.5 s after they clear; a failed Hide → `Couldn't hide your
  activity` / `<kit message> You can turn on Hide my activity in My Profile.` and it is asked again next time.

## 9. Decisions made
| ID | Decision | Rests on |
|----|----------|----------|
| **D-NP1** | **Entry per NP-U1** — the Members-tab header `person.2` for every role (a swap of the admin Invite button) + the Program-tab `People` row; the roster is retired. | people D-C14; NP-U1. |
| **D-NP2** | **Full stats reuse the Members cards** under a per-view owner token, so the Members tab never shows this person's numbers afterwards (and vice versa). | member-analytics D-C12; iOS plan TC5. |
| **D-NP3** | **Edit membership only after the screen's own details load (R6)** — also fixes the stale-details row (iOS verdict #5). | NP amendments R6. |

## 10. Flagged characteristics
| ID | Characteristic | Follow-up? |
|----|----------------|-----------|
| **F1** | `PeopleListView.swift` / `PersonProfileView.swift` exceed ~200 lines (accepted, plan TC14). | Accepted. |
| **F2** | ~~The profile streak can be stale (people F1).~~ | **RESOLVED** (server-side, 2026-10-14) — people 0.2.0 D-C15 / member-analytics D-C14: the current streak ends on the member's local today or yesterday, else 0, the same number as `MemberFullStatsView`'s streak card. No screen change (the tile renders `stats` as sent). |

## 11. Changelog
| Version | Date | Change |
|---------|------|--------|
| 0.1.1 | 2026-10-14 | F2 resolved — the profile streak no longer goes stale (backend `fd6c15b`: people 0.2.0 D-C15, member-analytics 0.9.0 D-C14). Doc only; no screen change. PATCH. |
| 0.1.0 | 2026-10-13 | Initial SPEC — net-new People (Phase 4, `198407c`): list (search, Invite row, status lines, markers), profile (stats, recent workouts, kudos toggle, hidden line), staff full stats, global-admin Edit membership (R6), the one-time visibility notice. |
