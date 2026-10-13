# Screen: `member-management` (android) — Invite + member editor + full stats cluster (the roster retired 0.2.0)

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.2.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios program-member-management`](../../ios/program-member-management/SPEC.md)
> + [`web members/list`](../../web/members/list/SPEC.md) · [`web members/detail`](../../web/members/detail/SPEC.md)
> · [`web members/invite`](../../web/members/invite/SPEC.md) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` routes `Routes.MEMBER_INVITE` (`InviteMemberScreen`), `Routes.MEMBER_ROSTER`
> (`ProgramMembersListScreen`), `Routes.MEMBER_EDIT` (`MemberDetailEditScreen`). Entered now from the **Members tab**
> (Invite glass button → invite; "View Members" pill → roster; global-admin roster row → editor).
> **Consumes:** `sendProgramInvite` (`POST /program-memberships/invite`) · `loadMembershipDetails`
> (`GET /program-memberships/details`) · `editMembership` (`PUT /program-memberships`) · `removeMember`
> (`DELETE /program-memberships`). Editor reads scoped `focusedMemberId`.
> **Files:** `ui/members/MemberManagementScreens.kt` + `MemberCards.kt` (`MemberInitialsAvatar`).
> **Ownership note:** these three nominally belong to the **Program tab (Phase G)**; they were lit up now for the
> Members-tab entry points, and Phase G reuses them as-is (see `Routes.kt` — "double-duty with the Program tab").

## Parity + Android-idiom deviations

- **Invite (`InviteMemberScreen`) — privacy-safe (F3, server-side since invites 0.2.0):** an exact-username field +
  info banner + "Send Invitation". The server answers every privacy-safe no-op with `200 "Invitation sent"`; since
  0.1.1 the client-side swallow is **removed** (invites §3.1): the **"Invitation sent"** toast shows only on 200 and
  every other status / transport failure shows the frontend-kit copy (or the server's 400 text) inline.
- ~~**Roster (`ProgramMembersListScreen`) — faithful:** a **searchable** ("Search members", substring, case-insensitive)
  list of `RosterRow`s — initials avatar (**orange + a ★** when `programRole == "admin"`), the member name, **@username**,
  and an **"Inactive" badge** when `!isActive`. Only **global-admin** rows are tappable (chevron shown) → they
  `focusMember(...)` and push `MEMBER_EDIT`; for everyone else the roster is read-only.~~ **Removed 0.2.0 (D-NP1):**
  `ProgramMembersListScreen` + `RosterRow` are deleted; `MEMBER_ROSTER` now renders the [`people`](../people/SPEC.md) list.
- **Editor (`MemberDetailEditScreen`) — global-admin only, faithful:** header (avatar + name + @username + a
  "Program Admin" badge for admins); **read-only** Gender / Date of Birth / Account Created fact rows; an
  **editable "Joined Program" date** (`DatePillField`, no future) + an **Active Membership `Switch`**; **"Save
  changes"** → `editMembership(isActive, joinedAt)`; and a **"Remove from Program"** action → an `AlertDialog`
  confirm → `removeMember`. Both writes reload the roster (`loadMembershipDetails`) and pop back on success; errors
  stay inline via `FormErrorText`. Missing member → "Member not found."
- **Deviation A-1 (Members-tab entry, not a Program-tab section):** iOS/web surface these inside a Program-tab
  "Member Management" card; on Android they are standalone routes reached from the Members tab this phase (the
  Program tab is Phase G and will reuse the same routes).
- **Deviation A-2 (flat Material chrome):** iOS glass rows/sheets → flat `SummaryCard`/surface rows + `DetailTopBar`;
  the invite success is a floating pill **toast** (auto-dismiss ~1.8s) rather than an iOS success Alert.

## Phase 4 (0.2.0)

- **D-NP1 (the roster → People; NP-U1, people D-C14):** the roster screen is gone (`MEMBER_ROSTER` = `PeopleListScreen`).
  The invite is now reached from People's `Invite member` row (program admins + global admins) and the Program tab.
- **D-NP2 (the editor loads its own data — R6, Android 39(d)):** `MemberDetailEditScreen` (reached from a person
  profile's `Edit membership`, global admins) runs its own `loadMembershipDetails()` and renders the form only once that
  load finished (`remember` keyed on `(memberId, loaded)`), so it never edits stale rows; before then a spinner, the kit
  `ErrorView`, or `Member not found.`
- **D-NP3 (`MemberFullStatsScreen`, route `members/full-stats`):** staff's `Open full stats` from a profile — title
  `Full stats`, the five Members cards for `focusedMemberId` through `MemberCardsView` (the held-key rule —
  member-analytics D-C12), pull-to-refresh, reconnect reload and the stale banner.

## Data / API

| Call | Endpoint | Sets / does |
|------|----------|-------------|
| `sendProgramInvite(username)` | `POST /program-memberships/invite` | sends an invite; "Invitation sent" on 200, else the kit error (0.1.1) |
| `loadMembershipDetails()` | `GET /program-memberships/details` | `membershipDetails` (roster + editor rows) |
| `editMembership(memberId, isActive, joinedAt)` | `PUT /program-memberships` | updates active + joined-program date; reloads roster |
| `removeMember(memberId)` | `DELETE /program-memberships` | removes the member; reloads roster |

Bearer-authed by the OkHttp layer.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-10-13 | **Phase 4 People (`d528f75`).** D-NP1 roster screen removed (`MEMBER_ROSTER` → People); D-NP2 the editor loads its own details and renders only once loaded; D-NP3 new `MemberFullStatsScreen` (`members/full-stats`). |
| 0.1.2 | 2026-10-13 | Phase 4 quick wins: invite / member save / remove errors go through `toAppError()` (server text kept for 400/422 and row errors — frontend-kit D-KIT-19, #8). |
| 0.1.1 | 2026-10-13 | **Reliability Phase 3 C3.** Invite-send swallow removed (invites §3.1): "Invitation sent" only on 200 (toast copy aligned with web / iOS), every other outcome through the frontend kit. Compile-checked green (`assembleDebug`). |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase E, lit early for the Members tab; Program-tab Phase G reuses). Invite (privacy-safe F3 swallow) · searchable roster (admin ★ / @username / Inactive badge; global-admin rows → editor) · global-admin editor (read-only Gender/DOB/Account-Created + editable Joined-Program date + Active Switch + Save `editMembership` + Remove confirm → `removeMember`). Deviations A-1 (Members-tab entry) + A-2 (flat chrome, toast). `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
