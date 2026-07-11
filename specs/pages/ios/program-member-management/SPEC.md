# Screen: `program-member-management` (ios) — the Program tab's Member Management section

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** `AdminProgramTab.swift:30` (`ProgramMemberManagementSection()`, always shown). The section
> is a card with two nav rows: **View Members** (everyone → `ProgramMembersListView` → global-admin-only
> `MemberDetailEditView`) + **Invite Member** (`canEditProgramData` → `InviteMemberView`).
> **Files:** `apps/ios/RaSi-Fiters-App/Features/Home/ProgramManagement/MemberManagementSection.swift`
> (section + `ProgramMembersListView` + `MemberDetailEditView`) + `InviteMemberView.swift`.
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/Tabs/MemberManagementSection.swift`
> + `.../Features/Home/Helpers/AdminHomeHelpers.swift` (`InviteMemberView`, line 1659).
> **Web parity reference:** [`web members/list`](../../web/members/list/SPEC.md) (roster) ·
> [`web members/detail`](../../web/members/detail/SPEC.md) (editor) · [`web members/invite`](../../web/members/invite/SPEC.md) (invite).
> **Consumes (features):** [`program-memberships`](../../../features/program-memberships/SPEC.md) (`fetchMembershipDetails`,
> `updateMembership`, `removeMember`) · [`invites`](../../../features/invites/SPEC.md) (`sendProgramInvite`).
> **Stance:** faithful 1:1 port of legacy iOS **+ 2 cross-platform cleanups** (clear-stale-error-on-edit, tokenize
> bare colors). The global-admin-only detail gate + invite privacy-swallow match BOTH legacy iOS **and** web.

---

## 1. What it is + who uses it

The **Member Management section** of the Program tab (Tab 4) — a program-settings card that lets any member
**view the roster** and lets a **program/global admin invite** members and (global-admin only) **edit a
member's membership** (joined date, active flag) or **remove** them. The iOS analogue of the web `/members/*`
sub-routes (`list`/`detail`/`invite`), collapsed under one native card with push-navigation.

## 2. Why it exists

To give managers native roster/membership control inside the Program tab, matching the built web `/members`
sub-routes. `ProgramMembersListView` is a searchable roster; `MemberDetailEditView` edits `joined_at` +
`is_active` (or removes); `InviteMemberView` sends a privacy-safe username invite. Also the shared nav target
of the **Members tab** (run 55) — this port lights up both entry points at once.

## 3. Route / location

- **App:** `ios`. **Section mount:** `AdminProgramTab.swift:30`, always visible (every role sees the roster).
- **View Members** row → `NavigationLink { ProgramMembersListView() }` (everyone). Inside: global_admin taps a
  row → `MemberDetailEditView(membership:)`; other roles see static read-only rows.
- **Invite Member** row → `NavigationLink { InviteMemberView() }`, shown only when `canEditProgramData`.
- **Shared:** `ProgramMembersListView` + `InviteMemberView` are also the nav targets of `AdminMembersTab`
  (run 55) / `StandardMembersTab` — the same struct, one definition.

## 4. Contents / sections

- **Section card** (`MemberManagementSection.swift:9-66`) — `sectionHeader("Members")` + View Members row
  (subtitle `"\(members.count) enrolled"`) + conditional Invite Member row.
- **`ProgramMembersListView`** (`:68-160`) — `List` over `membershipDetails` with `.searchable` name filter;
  `memberRow` = avatar (orange if admin) + name + admin star + `@username` + "Inactive" badge (`!is_active`);
  `.refreshable` → `loadMembershipDetails()`. Global-admin rows are `NavigationLink`s; others plain.
- **`MemberDetailEditView`** (`:162-…`) — identity header + read-only facts (Gender/DOB/Account Created) +
  editable Joined-Program `DatePicker` + Active `Toggle` + inline error + orange **Save changes**
  (`updateMembership(role:nil,isActive,joinedAt)`) + soft-red **Remove from Program** (`.alert` confirm →
  `removeMember`). Initializes `joinedAt`/`isActive` from the DTO `onAppear`.
- **`InviteMemberView`** (`InviteMemberView.swift`) — header + `@username` field (asciiCapable, no autocap) +
  blue info-note + inline error + orange **Send Invitation** + a transient success toast.

## 5. Components + shared features consumed

- Chrome: `sectionHeader`/`settingsRow` (`ProgramCards.swift`, run 57), native `List`/`Form`/`DatePicker`/
  `Toggle`/`.alert`/`.searchable`. Theme: `appOrange(Light)`/`appRed(Light)`/`appGreen`/`appBlue`,
  `adaptiveShadow`/`adaptiveBackground`/`adaptiveTint`. **No new component** (D-DEPS).
- Features: `memberships` (details/update/remove), `invites` (send).

## 6. Data / API

- `fetchMembershipDetails(token, programId)` → `[MembershipDetailDTO]` (via `ProgramContext.loadMembershipDetails`,
  loaded on the tab `.task`).
- `updateMembership(memberId, role:nil, isActive, joinedAt)` — sends only `is_active` + `joined_at` (role nil).
- `removeMember(memberId)` → `removeMemberFromProgram`.
- `sendProgramInvite(token, programId, username)` — one-shot, called directly on `APIClient.shared`.

## 7. Role-based view rules

| Role | View Members | Member row tap | Invite Member | Edit / Remove |
|------|--------------|----------------|---------------|---------------|
| **global_admin** | ✅ roster | ✅ → editor | ✅ | ✅ Save/Remove |
| **program admin** | ✅ roster | ❌ read-only rows | ✅ | ❌ (no editor) |
| **logger** | ✅ roster | ❌ read-only rows | ❌ (row hidden) | ❌ |
| **member** | ✅ roster | ❌ read-only rows | ❌ (row hidden) | ❌ |

- `canViewMemberDetails = isGlobalAdmin`; `canInviteMember = canEditProgramData` (admin/global_admin).
- **`admin_only_data_entry` — N/A.** This edits membership + invites (role-gated), not workout/health data
  entry; the lock never gates this section (matches web members/detail + members/invite: N/A).

## 8. States & edge cases

- **List:** loading is implicit (empty until `loadMembershipDetails`); search-empty shows the full list; no
  explicit empty/error state (both web + legacy iOS swallow list load errors — F1).
- **Editor:** inline error on Save/Remove failure (cleared on field edit — D-C2); Remove requires `.alert`
  confirm; `isSaving` gates both Save and Remove.
- **Invite:** privacy-safe — any non-network failure shows the success toast (F3); network errors show an
  inline retry message.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | Member Management ported **as part of the 3-section cluster in ONE run** (run 62) — section + `ProgramMembersListView` + `MemberDetailEditView` + `InviteMemberView`; the detail views can't be split off (shared stubs referenced by the Members tab). | run 58/59/60/61 cluster-IS-the-run; `AdminMembersTab.swift:37`, `StandardMembersTab.swift:44` |
| **D-REF** | Keep the **iOS-native multi-screen** shape (section card → push roster → push editor + push invite) vs web's flat `/members/*` routes — the destinations + role gating already match web, so structural idiom not a parity gap. | run 52/53 D-REF |
| **D-S1** | **Faithful 1:1** — roster search + global-admin-only editability + `updateMembership(role:nil)` payload + privacy-swallow invite are identical on both clients (faithful IS web parity). | legacy `MemberManagementSection.swift`; web SPECs |
| **D-DEPS** | **No new dependency** — every API fn, DTO, `ProgramContext` wrapper, theme color, and `sectionHeader`/`settingsRow` helper already ported (foundation run 50 + run 57). | grep-verified |
| **D-C1** | **Tokenize bare colors** — `.orange`→`Color.appOrange` (avatar/star/save), `.blue`→`Color.appBlue` (invite row + info-note); light-mode-safe (run-26/61). | `MemberManagementSection.swift`, `InviteMemberView.swift` |
| **D-C2** | **Clear stale error on edit** — `MemberDetailEditView` clears the error `.onChange` of `joinedAt`/`isActive`; `InviteMemberView` clears `.onChange` of `username`. Matches web members/detail D-C3 + members/invite D-C2. | web SPECs |
| **D-C3** | **Full-pill tap target on Send Invitation** — the CTA's `.frame/.padding/.background/.cornerRadius` now live INSIDE the `Button` label closure with `.contentShape(RoundedRectangle(cornerRadius: 14))` + `.buttonStyle(.plain)`, so the whole orange pill is tappable (not just the icon+text). Matches the `AppPrimaryButton` reference pattern. No behavior/contract change. | `InviteMemberView.swift`; `AppButton.swift` |

## 10. Flagged characteristics (kept as-is)

- **F1 — list load errors swallowed.** No error banner on the roster; both web `/members/list` and legacy iOS
  swallow (both-swallow = parity, run 55). Rebuild-cleanup candidate.
- **F2 — client gate STRICTER than backend.** The editor is global-admin-only on the client (both iOS + web),
  but the backend `updateMembership`/`removeMember` also authorize a **program admin** of the target program.
  Kept faithful; the backend is the real boundary (web members/detail F1; run 40/43 client-stricter shape).
- **F3 — invite errors swallowed as success (privacy).** Any non-network failure (unknown username / already
  invited / blocked / 403) renders the success toast with the field cleared, so the screen never confirms a
  username exists (web members/invite F1). **Load-bearing — never surface the real error.**
- **F4 — client role gating (JWT-decoded).** `isGlobalAdmin`/`canEditProgramData` are display/gating only; the
  backend re-verifies every call.
- **F5 — Save/Remove share one `isSaving` flag** (web members/detail F5); Save sends only `is_active`+`joined_at`.
- **F6 — invite `sendProgramInvite` called directly on `APIClient.shared`** (not via a `ProgramContext` wrapper),
  and the view stays put on success (no nav) — faithful to legacy iOS + web.

## 11. Changelog

- **0.1.1** (2026-07-11) — D-C3: fix limited tap target on the Send Invitation CTA (styling moved inside the
  Button label + `.contentShape` → whole pill tappable). Audit swept all ~180 iOS buttons; this was the only
  offender. No behavior/contract change.
- **0.1.0** (run 62, 2026-06-30) — initial port. Section + roster + editor + invite; 6 shared stubs removed
  (double-duty with the Members tab). Faithful 1:1 + D-C1 tokenize + D-C2 clear-stale-error.
