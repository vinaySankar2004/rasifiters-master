# Screen: `program-picker` (ios) — the post-auth landing (My Programs hub)

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.2.1 · **App:** `ios` (SwiftUI)
> **Location:** the root view once `authToken` is set — `AppRootView.swift:11-14` shows `ProgramPickerView()`
> inside a `NavigationStack`. Both `LoginView` + `CreateAccountView` flip the root here on success.
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/ProgramPickerView.swift`.
> **Web parity reference:** [`web programs`](../../web/programs/SPEC.md) — same hub concept (program cards +
> invites + create + account menu).
> **Consumes (features):** [`programs`/`invites` via `ProgramContext`] — `APIClient.fetchPrograms()`
> (`GET /programs`), `ProgramContext.deleteProgram()` (`DELETE /programs/:id`),
> `ProgramContext.updateMembershipStatus()` (`PUT /program-memberships`), `loadPendingInvites()`,
> `loadMembershipDetails()` + `loadLookupData()` + `persistSession()` on pick, `signOut()`.
> **Cross-app:** the web `/programs` hub renders the WHOLE flow on ONE page (create/edit/invites/account as
> inline modals); iOS keeps **native multi-screen navigation + sheets** (swipe edit/delete, a floating "+"
> → actions sheet, an account sheet). **This layout divergence is a platform-idiom exception to web parity
> (D-REF), NOT a gap to reconcile.**
> **Stance:** faithful 1:1 port of the legacy iOS `ProgramPickerView` **+ ONE web-parity deviation** (a
> visible error display — the legacy swallowed errors, D-C1). Oddities flagged §10.

---

## 1. What it is + who uses it

The **post-auth landing** — the first screen a signed-in member sees ("My Programs"). It lists the
member's programs as cards, lets them **open** a program (→ the home dashboard), **accept/decline** pending
invites inline, **edit/delete** programs they manage, reach **create-program + invites** (the floating "+"),
and open the **account menu** (profile/password/appearance/notifications/privacy/support/sign-out). Used by
**every authenticated role**; the per-card actions are role-gated (below).

## 2. Why it exists

To pick the **active program** before entering the workspace (the iOS analogue of the web `/programs` hub).
Selecting a card hydrates `ProgramContext` (name/status/id/dates/role/active-members), persists the session,
loads membership + lookup data, and navigates to `AdminHomeView`. Every downstream screen operates on the
program chosen here. It is also the hub for program lifecycle (create/edit/delete/invites) and account
settings.

## 3. Route / location

- **App:** `ios`. **Reached via:** the root bifurcation — `AppRootView` shows `ProgramPickerView` whenever
  `programContext.authToken != nil` (`AppRootView.swift:11-14`); `LoginView`/`CreateAccountView` set the
  token on success and the root swaps here.
- **Leaves to (all currently DEFERRED stubs):** `AdminHomeView` (open a program — `navigationDestination`
  `programToOpen`) · `EditProgramInfoView` (swipe-edit — `programToEdit`) · `ProgramActionsSheet` (the "+"
  floating button — create + invites) · the 4 account destinations `MyProfileView`/`ChangePasswordView`/
  `AppearanceSettingsView`/`NotificationsSettingsView` · plus `APIConfig.privacyPolicyURL`/`supportURL`
  (external browser, from the account sheet). Sign-out → `ProgramContext.signOut()` (root flips to splash).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | "My Programs" / "Manage your fitness programs" + an account avatar button (person.fill circle) → `AccountMenuSheet`. | legacy `ProgramPickerView.swift:200-227` |
| Program list | `List` of `ProgramCard`s over `visiblePrograms` (the search-filtered view of `programContext.programs`); loading → `ProgressView`; empty → `emptyState` ("No programs yet"); filter-empty → `noMatchesState` ("No programs match your search"). **Press-and-hold drag-to-reorder** via `ForEach.onMove` (net-new 0.2.0, D-N1) — no edit mode; disabled while searching. | legacy `:28-98, 269-284`; new `.onMove` + `visiblePrograms` |
| Search (net-new 0.2.0, slimmed 0.2.1, D-N1) | Collapsed by default — a 56pt header circle (magnifier ↔ xmark, matching the account button) toggles a floating `.ultraThinMaterial` capsule (`searchPill`: TextField + clear button, autofocus) under the header; the list's top spacer grows 90→148pt while open. Closing clears the query. Client-side name filter (`localizedCaseInsensitiveContains` on the trimmed query); screen is unchanged while collapsed. | `ProgramPickerView.swift` (`toggleSearch`/`searchPill`) |
| `ProgramCard` | Name + `StatusPill` (status-colored) + date range + (members summary OR "Invitation pending"/"Request pending approval") + a status-colored `ProgressView` + (Accept/Decline capsule buttons when invited/requested). | legacy `:617-740` |
| Swipe actions | Leading **Edit** (pencil, blue) + trailing **Delete** (trash, destructive) — both only when `canManage`. | legacy `:69-89` |
| Floating "+" button | Bottom-right circle → `ProgramActionsSheet`; a red badge with `pendingInvitesCount` when > 0. | legacy `:229-253` |
| `AccountMenuSheet` (inline) | Sheet: header + Profile / Change Password / Appearance / Notifications rows (→ destinations), Privacy Policy / Support (→ URLs), Sign Out. `.medium`/`.large` detents. | legacy `:370-615` |
| Delete / Sign-out alerts | Native `Alert`s — "Delete Program?" (confirm destructive) + "Sign Out" (confirm destructive). | legacy `:174-197` |
| **Error banner** | **WEB-PARITY ADDITION (not in legacy iOS)** — an additive red banner shown whenever `errorMessage != nil` (D-C1). | new `ProgramPickerView.swift` `errorBanner(_:)` |

**Pick flow** (`applyProgram` + `programToOpen`, legacy `:64-68, 286-312`): tap a card when `canOpen` →
write `ProgramContext` fields (name/status/id/active-members; reset `totalWorkouts`/`atRiskMembers` = 0;
`loggedInUserProgramRole` from `my_role`; parse `start_date`/`end_date`) → `persistSession()` →
`loadMembershipDetails()` + `loadLookupData()` (async) → navigate to `AdminHomeView`.
**Invite flow** (`respondToInvite`, legacy `:314-324`): Accept → `updateMembershipStatus(status:"active")`;
Decline/Cancel → `status:"removed"`; then `loadPrograms()`. **Delete** (`deleteProgram`, `:255-267`):
`ProgramContext.deleteProgram(programId:)`. The `returnToMyPrograms` flag (`:127-137`) resets all nav
bindings when a sub-screen requests a pop back to the picker.

## 5. Components + features consumed

- **Components (all inline in the picker file):** `ProgramCard`, `StatusPill` (non-private — reusable),
  `AccountMenuSheet` + `ProfileRow`/`AccountRow`/`SignOutRow` (private). Chrome: `Color.app*` tokens,
  `adaptiveShadow`, native `List`/`swipeActions`/`sheet`/`navigationDestination`/`Alert`. **No new
  dependency** — all ported in the foundation (run 50).
- **Features (via `ProgramContext`):** `APIClient.fetchPrograms()` (`APIClient+Programs.swift:42`),
  `deleteProgram()` (`ProgramContext+ProgramManagement.swift:58`), `updateMembershipStatus()`
  (`ProgramContext+Members.swift:311`), `loadPendingInvites()` (`+ProgramManagement.swift:104`),
  `loadMembershipDetails()`/`loadLookupData()` (`+Members.swift`), `persistSession()`/`signOut()`
  (`+Auth.swift`), `loggedInUserInitials`/`loggedInUserName`/`loggedInUsername`/`isGlobalAdmin`
  (`ProgramContext.swift`). `APIConfig.privacyPolicyURL`/`supportURL` (`APIConfig.swift:18-19`).

## 6. Data / API

- **`GET /programs`** (`APIClient.shared.fetchPrograms(token:)`) — returns `[ProgramDTO]` (id, name, status,
  start/end_date, active/total_members, progress_percent, enrollments_closed, my_role, my_status). The list.
  Since 0.2.0 the array arrives in the member's saved order (unordered programs trailing by start_date) —
  rendered as-is, no client sorting; that's the cross-platform order sync.
- **`PUT /programs/order`** (`APIClient.shared.saveProgramOrder(token:programIds:)`, net-new 0.2.0) — fired
  from `moveProgram` after an `.onMove` with the FULL display order (invited/requested rows included).
  Optimistic: the context array mutates first; on failure the previous order is restored and the error
  surfaces in the D-C1 banner ("Couldn't save program order: …"). Last-write-wins across devices.
- **`DELETE /programs/:id`** (`ProgramContext.deleteProgram(programId:)`) — manage-gated delete.
- **`PUT /program-memberships`** (`ProgramContext.updateMembershipStatus(programId:status:)`) — inline
  invite Accept (`"active"`) / Decline / Cancel (`"removed"`).
- **On pick:** `loadMembershipDetails()` (`GET /program-memberships/details`) + `loadLookupData()` (program
  refresh) + `persistSession()` (Keychain + UserDefaults). Create/edit/all-invites endpoints belong to the
  **deferred** `ProgramActionsSheet`/`EditProgramInfoView`, not this screen.
- All calls send `Authorization: Bearer {programContext.authToken}`.

## 7. Role-based view rules

Gated entirely client-side by `canOpen`/`canManage` (legacy `:46-47`); the backend re-authorizes every
call (the real boundary). `admin_only_data_entry` is **N/A** here — it's read into `ProgramContext` for the
downstream log screens, never gating the picker (no data entry on this screen).

| Role | Sees | Can do |
|------|------|--------|
| **global_admin** | All program cards | Open **any** card; **Edit/Delete any** (swipe); Accept/Decline invites; "+" create/invites; account menu. (`canOpen`/`canManage` both true unconditionally.) |
| **program admin** (`my_status=="active"` && `my_role=="admin"`) | Their programs | Open; **Edit/Delete own** (swipe); Accept/Decline own invites; create/invites; account menu. |
| **logger / member** (`my_status=="active"`) | Their programs | Open active programs; Accept/Decline/Cancel own invites; create/invites; account menu; **NO Edit/Delete** (swipe actions hidden). |
| **invited / requested** (`my_status=="invited"`/`"requested"`) | The pending card (status text + Accept/Decline) | Accept/Decline (or Cancel request) only; **card not openable** (`canOpen==false`) unless global_admin. |

## 8. States & edge cases

- **Loading:** `isLoading` → a centered `ProgressView` (the `.task` runs `loadPrograms` + `loadPendingInvites`).
- **Empty:** `programContext.programs.isEmpty` → "No programs yet — Create a program to get started." card.
- **Error (D-C1):** any `loadPrograms`/`deleteProgram`/`respondToInvite` failure sets `errorMessage`, now
  rendered as an **additive red banner** (does not hide the list). Cleared on the next successful
  `loadPrograms`. **The legacy set `errorMessage` but never displayed it** (errors silently swallowed) — see
  D-C1 / F1.
- **No token:** `loadPrograms` guards `authToken` non-empty → "Please log in to load programs." (now visible
  via the banner).
- **Delete / Sign-out:** native confirm `Alert`s before the destructive action.
- **Forward dependencies (all DEFERRED stubs):** `AdminHomeView`, `ProgramActionsSheet`, `EditProgramInfoView`,
  and the 4 account screens render the `ScaffoldPlaceholder` until ported (F2).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | **This port owns the PICKER ONLY** — `ProgramPickerView.swift` verbatim incl. its inline `ProgramCard`/`StatusPill`/`AccountMenuSheet`. The **7 forward-nav screens** it navigates to (`AdminHomeView`, `ProgramActionsSheet`, `EditProgramInfoView`, `MyProfileView`, `ChangePasswordView`, `AppearanceSettingsView`, `NotificationsSettingsView`) are added as `ScaffoldPlaceholder` stubs and ported later. Mirrors run-21/50 ("the scope cut IS the run"). | user answer ("Picker only + stub the 7"); legacy `ProgramPickerView.swift:138-173`. |
| **D-REF** | **Reference impl = legacy `.../Features/Home/ProgramPickerView.swift`; web parity = [`web programs`](../../web/programs/SPEC.md). `consumed_by=[ios]`. Keep iOS-native multi-screen navigation** — the web hub's single-page-modal layout is a **platform-idiom divergence**, NOT a parity gap. | user answer ("Keep iOS-native navigation"); [[ios-matches-web-not-just-legacy]]; web programs SPEC cross-app note. |
| **D-S1** | **Stance = faithful 1:1 port** — the `List` of `ProgramCard`s, `canOpen`/`canManage` gating, swipe edit/delete, accept/decline invites, the floating "+" with the invite badge, the inline `AccountMenuSheet` (7 rows incl. the iOS-only Notifications + Support), `applyProgram` hydration + `persistSession`, the delete/sign-out `Alert`s, navigation to the deferred screens. Oddities → §10. | legacy `ProgramPickerView.swift:1-764`; user answer. |
| **D-C1** | **ONE web-parity addition — a visible error display.** The legacy sets `errorMessage` in `loadPrograms`/`deleteProgram`/`respondToInvite` but **never renders it** (errors silently swallowed). Added an additive red `errorBanner` (shown whenever `errorMessage != nil`, does not hide the list), matching how the web hub surfaces query errors. Chose additive-banner over web's replace-the-list so mutation errors stay visible alongside the loaded cards. | user answer ("Faithful + surface errors"); web programs error line (`page.tsx:208-211`); legacy never-displayed `errorMessage`. |
| **D-DEPS** | **No new dependency** — every component/service/model/theme symbol was ported in the foundation (run 50); the inline components live in the picker file; `StatusPill` is a fresh non-private type (no collision verified). | foundation inventory (run 50); collision grep (no existing `StatusPill`/component clashes). |
| **D-N1** | **Net-new post-parity enhancement (user-requested 2026-07-05): drag-to-reorder + search.** Reorder = native `List` + `ForEach.onMove` press-and-hold lift-and-drag, NO edit mode (Reminders-style; chosen over the `AdminSummaryTab` `.onDrag/.onDrop` grid precedent — that pattern is for grids, this is a real List). The spacer/error/loading/empty rows sit outside the `ForEach`, so they're neither movable nor drop targets. **`.onMove(perform:)` gets `nil` while the search query is non-empty** — reorder only runs when `visiblePrograms` is the unfiltered array, so offsets map 1:1 onto `programContext.programs` and the full display order is what's persisted. Search (0.2.1) = a collapsed header magnifier toggling a floating material capsule — NOT `.searchable` (tried at 0.2.0; its nav-drawer field collided with the custom `pickerHeader` overlay and restyled the screen — user rejected). New programs land at the bottom (server-side `NULLS LAST, start_date`). | programs feature SPEC 0.2.0 (D-N1); web programs SPEC 0.2.1; user decisions (long-press drag · bottom placement · collapsed search, 2026-07-05). |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Errors were silently swallowed (now surfaced, D-C1).** The legacy set `errorMessage` but rendered it nowhere. Fixed this run via the additive banner; recorded as the closed gap. | legacy `:328, 263, 321`; new `errorBanner` | Closed (D-C1) — was a faithful-divergence-from-web. |
| **F2** | **Forward navigation to not-yet-built screens.** Opening a program, swipe-edit, the "+" sheet, and the 4 account rows all reach `ScaffoldPlaceholder` stubs until those screens are ported. | `ProgramPickerView.swift:138-173`; `_DeferredScreenStubs.swift` | Kept (deliberate) — each stub deleted when its real screen lands (run-50/51 pattern). |
| **F3** | **Vestigial `isDeleting` state** — set true/false in `deleteProgram` but never read (no per-row delete spinner). | legacy `:11, 257, 266` | Kept (faithful) — a rebuild could wire a delete spinner or drop the state. |
| **F4** | **Client-side role gating from `ProgramContext`** (`isGlobalAdmin` / `my_role` / `my_status`) drives `canOpen`/`canManage`; the backend re-authorizes every call (mirrors web programs F1). | legacy `:46-47` | Kept (faithful) — UI-only gate, not the security boundary. |
| **F5** | **Dual invite mechanisms (web parity F3).** The card's inline Accept/Decline uses `PUT /program-memberships` (`updateMembershipStatus`); the deferred `ProgramActionsSheet` invites tab uses `PUT /program-memberships/invite-response` on `ProgramInvite` records. | legacy `:314-324` | Kept (faithful) — same split as web programs F3; lives across two screens. |
| **F6** | **iOS-only account rows** — `AccountMenuSheet` has **Notifications** (native push settings) + **Support** rows that the web account modal lacks; Privacy/Support open `rasifiters.com` URLs (web routes to `/program/privacy` in-app). Platform-appropriate, not a divergence to reconcile. | legacy `:424-460` | Kept (deliberate) — iOS push/notifications is an ios-only feature surface. |
| **F7** | **Single-page-hub layout NOT adopted (D-REF).** Web does create/edit/invites/account inline on `/programs`; iOS splits them into sheets/screens. Platform-idiom exception to web parity. | `AppRootView.swift:11-14`; legacy nav structure | Kept (deliberate) — native iOS navigation idiom wins. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.1 | 2026-07-05 | **Search UI slimmed (user feedback after simulator pass):** dropped `.searchable` (nav-drawer field collided with the custom header + restyled the screen). Now a 56pt header magnifier circle (matching the account button) toggles a floating `.ultraThinMaterial` capsule with autofocus + clear; top spacer animates 90→148pt; closing clears the query. Drag-reorder confirmed working in the simulator; filter/`onMove`-disable semantics unchanged. |
| 0.2.0 | 2026-07-05 | **Net-new post-parity (D-N1): per-member drag-to-reorder + program search.** Press-and-hold reorder via `ForEach.onMove` (no edit mode; `nil` while searching), persisted through `APIClient.saveProgramOrder` → `PUT /programs/order` (optimistic, revert + D-C1 banner on failure). `.searchable` nav-drawer name filter over `visiblePrograms` + `noMatchesState`. List now renders the server-saved order as-is. Pairs with `programs` feature 0.2.0 and web `programs` 0.2.0. |
| 0.1.0 | 2026-06-30 | Initial SPEC authored via `question-asker` — the **fourth iOS screen spec** (first post-auth screen). Documents `ProgramPickerView`: the "My Programs" list of `ProgramCard`s (`fetchPrograms`), `canOpen`/`canManage` role gating, swipe edit/delete, inline invite Accept/Decline (`updateMembershipStatus`), the floating "+" → `ProgramActionsSheet` with the pending-invite badge, the inline `AccountMenuSheet`, `applyProgram` hydration → `AdminHomeView`, delete/sign-out `Alert`s. Decisions: **D-SCOPE** (picker only + stub the 7 forward-nav screens) · **D-REF** (`consumed_by=[ios]`; keep iOS-native navigation — the web single-page-modal layout is a platform-idiom divergence) · **D-S1** (faithful 1:1 port) · **D-C1** (ONE web-parity addition — a visible error banner; the legacy swallowed errors) · **D-DEPS** (no new dependency). Flagged F1–F7 (errors-now-surfaced; deferred forward-nav stubs; vestigial `isDeleting`; client role gating; dual invite mechanisms; iOS-only account rows; single-page-hub layout not adopted). Role rules = the `canOpen`/`canManage` table; `admin_only_data_entry` N/A. Ported `apps/ios/.../Features/Home/ProgramPickerView.swift`; added 7 stubs to `_DeferredScreenStubs.swift` (removed the `ProgramPickerView` stub). Build green-check owned by the user (Xcode). |
