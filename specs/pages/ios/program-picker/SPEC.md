# Screen: `program-picker` (ios) — the post-auth landing (My Programs hub)

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.4.2 · **App:** `ios` (SwiftUI)
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
| Search (net-new 0.2.0, slimmed 0.2.1, floated 0.2.2, D-N1) | Collapsed by default — a 56pt **floating circle stacked above the "+" button** (magnifier ↔ xmark, same style; a header placement wrapped the title, rejected 0.2.2) toggles a floating `.ultraThinMaterial` capsule (`searchPill`: TextField + clear button, autofocus) under the header; the list's top spacer grows 90→148pt while open. Closing clears the query. Client-side name filter (`localizedCaseInsensitiveContains` on the trimmed query); screen is unchanged while collapsed. | `ProgramPickerView.swift` (`floatingSearchButton`/`toggleSearch`/`searchPill`) |
| `ProgramCard` | Name + `StatusPill` (status-colored) + date range + (members summary OR "Invitation pending"/"Request pending approval") + a status-colored `ProgressView` of **time elapsed** (`progress_percent` — days in ÷ total days, D-BAR) + (Accept/Decline capsule buttons when invited/requested). | legacy `:617-740` |
| Swipe actions | Leading **Edit** (pencil, blue) + trailing **Delete** (trash, destructive) — both only when `canManage`. | legacy `:69-89` |
| Floating "+" button | Bottom-right circle → `ProgramActionsSheet`; a red badge with `pendingInvitesCount` when > 0. **0.4.0 (D-NP1):** the badge is `inboxBadgeCount` / `inboxBadgeLabel` — the server `badge` for every role (`99+` cap), falling back to `isGlobalAdmin ? 0 : pendingInvites.count` until counts load; the picker's `load()` also refreshes the counts. **0.4.1 (D-REL1):** spoken label `Program actions` / `Program actions, <inboxBadgeLabel> new` — the same source as the badge. | `ProgramPickerView.swift` |
| `AccountMenuSheet` (inline) | Sheet: header + Profile / Change Password / Appearance / Notifications rows (→ destinations), Privacy Policy / Support (→ URLs), Sign Out. `.medium`/`.large` detents. | legacy `:370-615` |
| Delete / Sign-out alerts | Native `Alert`s — "Delete Program?" (confirm destructive) + "Sign Out" (confirm destructive). | legacy `:174-197` |
| **Error banner** | **WEB-PARITY ADDITION (not in legacy iOS)** — an additive red banner shown whenever `errorMessage != nil` (D-C1). | new `ProgramPickerView.swift` `errorBanner(_:)` |

**Pick flow** (`applyProgram` + `programToOpen`, legacy `:64-68, 286-312`): tap a card when `canOpen` →
**if it is a different program, `resetProgramScopedData()` first** (0.4.1, D-REL1 — Members cards + owner token,
metrics preview, `membershipDetails`, every Summary field, `workoutTypes`, `programWorkouts`) → write `ProgramContext`
fields (name/status/id/active-members; reset `totalWorkouts`/`atRiskMembers` = 0;
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

- **Loading (D-C2, 1.5.0):** `LoadState<[ProgramDTO]>` — the last good list shows at once (in memory, else the
  `LaunchCache` copy), then the network; programs + invites load in parallel. A `ProgressView` shows only with no list
  at all. Pull-to-refresh reloads both and starts a background `pull_to_refresh` health sync.
- **Empty:** `programContext.programs.isEmpty` → "No programs yet — Create a program to get started." card.
- **Error (D-C2, supersedes the D-C1 banner):** no list + a failed load → the kit `ErrorStateView` (Retry); a list +
  a failed refresh → the kit "Couldn't refresh" floating banner; a failed delete / reorder / cancel-request → a
  dismissable kit error banner. One floating banner at a time (`bottomInset: 150`, above the FAB stack): action
  error > stale > "update available"; the list's bottom spacer grows while one shows. Offline → the app-wide offline
  banner instead (AppRootView), whose band is a bottom safe-area inset on the whole stack, so the cards and floating
  buttons sit above it. Back online → refetch. A load that fails while offline (link down or proven offline —
  polish-1) shows the offline error view, a client timeout included.
- ~~**Invite push tap (D-C3):** pops to the picker and opens the program-actions sheet on its Invites tab.~~
  *(Superseded at 0.4.0 by D-NP1 — `inboxRoute` targets.)*
- **Notification targets (0.4.0, D-NP1):** the picker consumes `ProgramContext.inboxRoute` (on appear and on change):
  the program already open → reload only; otherwise it closes its own sheets, waits 0.5 s, and skips while a
  full-screen cover is up; `program(id)` → pop + open it (loading the list first if needed); `programs` → pop;
  `invites` / `inbox` → pop + the "+" sheet on its Inbox tab; `log_workout` → the quick-add workout form (flagged as
  opened from a notification, so it returns to the covered screen).
- **Delete / Sign-out:** native confirm `Alert`s before the destructive action.
- **Forward dependencies (all DEFERRED stubs):** `AdminHomeView`, `ProgramActionsSheet`, `EditProgramInfoView`,
  and the 4 account screens render the `ScaffoldPlaceholder` until ported (F2).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | **This port owns the PICKER ONLY** — `ProgramPickerView.swift` verbatim incl. its inline `ProgramCard`/`StatusPill`/`AccountMenuSheet`. The **7 forward-nav screens** it navigates to (`AdminHomeView`, `ProgramActionsSheet`, `EditProgramInfoView`, `MyProfileView`, `ChangePasswordView`, `AppearanceSettingsView`, `NotificationsSettingsView`) are added as `ScaffoldPlaceholder` stubs and ported later. Mirrors run-21/50 ("the scope cut IS the run"). | user answer ("Picker only + stub the 7"); legacy `ProgramPickerView.swift:138-173`. |
| **D-REF** | **Reference impl = legacy `.../Features/Home/ProgramPickerView.swift`; web parity = [`web programs`](../../web/programs/SPEC.md). `consumed_by=[ios]`. Keep iOS-native multi-screen navigation** — the web hub's single-page-modal layout is a **platform-idiom divergence**, NOT a parity gap. | user answer ("Keep iOS-native navigation"); [[ios-matches-web-not-just-legacy]]; web programs SPEC cross-app note. |
| **D-S1** | **Stance = faithful 1:1 port** — the `List` of `ProgramCard`s, `canOpen`/`canManage` gating, swipe edit/delete, accept/decline invites, the floating "+" with the invite badge, the inline `AccountMenuSheet` (7 rows incl. the iOS-only Notifications + Support), `applyProgram` hydration + `persistSession`, the delete/sign-out `Alert`s, navigation to the deferred screens. Oddities → §10. | legacy `ProgramPickerView.swift:1-764`; user answer. |
| **D-C1** | *(Superseded by D-C2 — iOS 1.5.0: the kit error view / banners replace this inline banner.)* **ONE web-parity addition — a visible error display.** The legacy sets `errorMessage` in `loadPrograms`/`deleteProgram`/`respondToInvite` but **never renders it** (errors silently swallowed). Added an additive red `errorBanner` (shown whenever `errorMessage != nil`, does not hide the list), matching how the web hub surfaces query errors. Chose additive-banner over web's replace-the-list so mutation errors stay visible alongside the loaded cards. | user answer ("Faithful + surface errors"); web programs error line (`page.tsx:208-211`); legacy never-displayed `errorMessage`. |
| **D-DEPS** | **No new dependency** — every component/service/model/theme symbol was ported in the foundation (run 50); the inline components live in the picker file; `StatusPill` is a fresh non-private type (no collision verified). | foundation inventory (run 50); collision grep (no existing `StatusPill`/component clashes). |
| **D-N1** | **Net-new post-parity enhancement (user-requested 2026-07-05): drag-to-reorder + search.** Reorder = native `List` + `ForEach.onMove` press-and-hold lift-and-drag, NO edit mode (Reminders-style; chosen over the `AdminSummaryTab` `.onDrag/.onDrop` grid precedent — that pattern is for grids, this is a real List). The spacer/error/loading/empty rows sit outside the `ForEach`, so they're neither movable nor drop targets. **`.onMove(perform:)` gets `nil` while the search query is non-empty** — reorder only runs when `visiblePrograms` is the unfiltered array, so offsets map 1:1 onto `programContext.programs` and the full display order is what's persisted. Search (0.2.1) = a collapsed header magnifier toggling a floating material capsule — NOT `.searchable` (tried at 0.2.0; its nav-drawer field collided with the custom `pickerHeader` overlay and restyled the screen — user rejected). New programs land at the bottom (server-side `NULLS LAST, start_date`). | programs feature SPEC 0.2.0 (D-N1); web programs SPEC 0.2.1; user decisions (long-press drag · bottom placement · collapsed search, 2026-07-05). |
| **D-C2** | **Kit adoption + instant open (reliability Phase 3 C2; board §6.5, D-9; frontend-kit §5–§6).** `LoadState<[ProgramDTO]>`; cache-first (`LaunchCache`, per member, cleared on sign-out) then network; programs + invites in parallel; `ErrorStateView` / stale banner / dismissable action-error banner via `ScreenBanner` at `bottomInset: 150`; the app-config "update available" banner shows here only (amendment A7); offline = the app-wide banner, its band reserved as the stack's bottom safe-area inset (A6); a pushed invite request is skipped while a full-screen cover is up (never a dead "+"); refetch on reconnect. **Pull-to-refresh (amendment A13)**: the header's height became a clear top safe-area inset (+ a 6 pt spacer row, min row height 0), so the spinner sits below the header while every card rests exactly where it did. | frontend-kit §5–§6, D-KIT-8/9; Phase 3 client amendments (`specs/initiatives/reliability-overhaul/plans/phase-3-client-amendments.md`) A6 / A7 / A13 / A14. |
| **D-C3** | **Invites + account (Phase 3 C2).** An invite push tap (`ProgramContext.openInvitesRequested`, amendment U2) opens `ProgramActionsSheet` on its Invites tab. The card's *invited* Accept / Decline is retired — the Invites tab is the one inbox; a *requested* membership keeps "Cancel request" (A10). The account menu's Sign Out runs `SessionTeardown` (this device only, auth D-C14); "Sign out everywhere" is in [My Profile](../my-profile/SPEC.md), not here (U3). | notifications §3.2; invites §3.1; Phase 3 client amendments (`specs/initiatives/reliability-overhaul/plans/phase-3-client-amendments.md`) U2 / U3 / A10. |
| **D-NP1** | **Inbox badge, Inbox account row, notification routing (0.4.0; notifications D-C31, invites D-C10; NP amendments R4, R5; iOS plan TC10).** The "+" badge = the server `badge` (`inboxBadgeCount`), fallback own pending invites / 0 for global admins, `99+`; `AccountMenuSheet` gains an `Inbox` row (`<n> new` / `99+ new`, else `Invites and notifications`) that pushes `InboxView`; `inboxRoute` replaces U2's `openInvitesRequested` (D-C3's push-tap clause superseded) — routing rules in §8. The visibility notice may be offered from the launch path (people D-C14). | notifications §3.9; iOS plan TC10, TC3. |
| **D-REL1** | **Phase 4 polish (#10, #30, #36, #45).** #10 / #30 opening a *different* program first calls `ProgramContext.resetProgramScopedData()` (`ProgramContext+ProgramSwitch.swift`): the Members-tab cards (+ `memberCardsOwner`, so they render placeholders, never "loaded and empty"), the metrics preview, `membershipDetails` (roster + roles — PA6), every Summary field, `workoutTypes` and `programWorkouts` — so no tab shows the previous program's numbers under the new name, while loading or offline; the shared loaders drop a reply for a program that is no longer current (frontend-kit **D-KIT-23**; analytics **D-C11**). Reopening the same program keeps its data. #36 the "+" spoken label `Program actions` / `Program actions, N new` reads the badge's own count (`inboxBadgeLabel` — one source, P-10; invites **D-C11**); an openable card carries the `.isButton` trait; the requested card's **Cancel request** chip gets a 44-pt hit area (`.minTapTarget(alignment: .leading)` — its row grows ~12 pt, P-8; frontend-kit **D-KIT-22**). #45 the account sheet's Apple Health row subtitle reads `Sync workouts, sleep, and steps` (was "Sync workouts automatically"; Android keeps "Sync workouts and sleep"). | `05e185a`; polish amendments PA1, PA6 |
| **D-BAR** | **The card bar = time elapsed** — `progressValue` reads the server's `progress_percent` (days in ÷ total days, 0–100; programs §4), the source Android has read since its port. Until 0.4.2 it was `active_members / total_members`, faithful to the legacy, but the backend counts both the same way (programs F2), so the bar was always full. A deliberate fix of a legacy bug; the member-count text is unchanged. Ships in iOS 1.5.2 (62) — the user pulled (61) from review to include it. | `ProgramPickerView.swift` (`ProgramCard.progressValue`); programs F2; web programs D-BAR; user report 2026-10-14. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Errors were silently swallowed (now surfaced, D-C1).** The legacy set `errorMessage` but rendered it nowhere. Fixed this run via the additive banner; recorded as the closed gap. | legacy `:328, 263, 321`; new `errorBanner` | Closed (D-C1) — was a faithful-divergence-from-web. |
| **F2** | **Forward navigation to not-yet-built screens.** Opening a program, swipe-edit, the "+" sheet, and the 4 account rows all reach `ScaffoldPlaceholder` stubs until those screens are ported. | `ProgramPickerView.swift:138-173`; `_DeferredScreenStubs.swift` | Kept (deliberate) — each stub deleted when its real screen lands (run-50/51 pattern). |
| **F3** | **Vestigial `isDeleting` state** — set true/false in `deleteProgram` but never read (no per-row delete spinner). | legacy `:11, 257, 266` | Kept (faithful) — a rebuild could wire a delete spinner or drop the state. |
| **F4** | **Client-side role gating from `ProgramContext`** (`isGlobalAdmin` / `my_role` / `my_status`) drives `canOpen`/`canManage`; the backend re-authorizes every call (mirrors web programs F1). | legacy `:46-47` | Kept (faithful) — UI-only gate, not the security boundary. |
| **F5** | **Dual invite mechanisms (web parity F3).** The card's inline Accept/Decline uses `PUT /program-memberships` (`updateMembershipStatus`); the deferred `ProgramActionsSheet` invites tab uses `PUT /program-memberships/invite-response` on `ProgramInvite` records. | legacy `:314-324` | Kept (faithful) — same split as web programs F3; lives across two screens. |
| **F6** | ~~**iOS-only account rows**~~ — web gained **Notifications** + **Support** rows in Phase 4, and since 2026-10-13 all three open Privacy / Support as the same `rasifiters.com` pages (web privacy-policy D-ONE). | legacy `:424-460` | Resolved (2026-10-13). |
| **F7** | **Single-page-hub layout NOT adopted (D-REF).** Web does create/edit/invites/account inline on `/programs`; iOS splits them into sheets/screens. Platform-idiom exception to web parity. | `AppRootView.swift:11-14`; legacy nav structure | Kept (deliberate) — native iOS navigation idiom wins. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.4.2 | 2026-10-14 | **D-BAR — the card bar shows time elapsed** (`progress_percent`, Android parity) instead of `active / total` members, which the backend always returns equal (a permanently full bar, faithful to the legacy). Found by the user; §4 + §9. Rides iOS 1.5.2 (62). |
| 0.4.1 | 2026-10-13 | **D-REL1 — Phase 4 polish (`05e185a`).** #10 / #30 a program switch clears every program-scoped value first (`resetProgramScopedData`, incl. `membershipDetails`); #36 "+" label `Program actions, N new` from the badge's own count, card `.isButton` trait, 44-pt Cancel request; #45 Apple Health subtitle `Sync workouts, sleep, and steps`. |
| 0.4.0 | 2026-10-13 | **D-NP1 — Phase 4 Notifications (`198407c`).** "+" badge = the server `badge` (fallback own invites, global admins 0); `Inbox` account row; `inboxRoute` notification routing (program / programs / invites / inbox / log_workout) replaces the invite-tap flag (D-C3 clause superseded); counts refresh with the picker load. |
| 0.3.1 | 2026-10-13 | **Polish 1 (offline detection).** Offline = link down OR proven offline by a failed request (`NetworkMonitor`); with no list, a load that fails while offline → the kit's offline `ErrorStateView` + Retry, a client timeout included (`AppError.labeled(online:)`, rule 6); the offline banner, stale-banner suppression and refetch-on-reconnect follow the combined value. |
| 0.3.0 | 2026-10-13 | **reliability Phase 3 C2 (iOS 1.5.0).** D-C2: instant open (cache, then network), programs + invites in parallel, kit error view / stale / action-error / update banners (one at a time, `bottomInset: 150`), pull-to-refresh with the header as a top safe-area inset (cards unmoved), refetch on reconnect — D-C1 superseded. D-C3: an invite push tap opens the Invites tab; the card's invited Accept / Decline retired (Cancel request kept). |
| 0.2.2 | 2026-07-05 | **Search toggle moved out of the header (user feedback):** the 0.2.1 header magnifier circle squeezed the "My Programs" title into wrapping. Now a `floatingSearchButton` stacked above the floating "+" (bottom-right, 14pt gap, identical circle style); header restored to its original layout. Pill/filter semantics unchanged. |
| 0.2.1 | 2026-07-05 | **Search UI slimmed (user feedback after simulator pass):** dropped `.searchable` (nav-drawer field collided with the custom header + restyled the screen). Now a 56pt header magnifier circle (matching the account button) toggles a floating `.ultraThinMaterial` capsule with autofocus + clear; top spacer animates 90→148pt; closing clears the query. Drag-reorder confirmed working in the simulator; filter/`onMove`-disable semantics unchanged. |
| 0.2.0 | 2026-07-05 | **Net-new post-parity (D-N1): per-member drag-to-reorder + program search.** Press-and-hold reorder via `ForEach.onMove` (no edit mode; `nil` while searching), persisted through `APIClient.saveProgramOrder` → `PUT /programs/order` (optimistic, revert + D-C1 banner on failure). `.searchable` nav-drawer name filter over `visiblePrograms` + `noMatchesState`. List now renders the server-saved order as-is. Pairs with `programs` feature 0.2.0 and web `programs` 0.2.0. |
| 0.1.0 | 2026-06-30 | Initial SPEC authored via `question-asker` — the **fourth iOS screen spec** (first post-auth screen). Documents `ProgramPickerView`: the "My Programs" list of `ProgramCard`s (`fetchPrograms`), `canOpen`/`canManage` role gating, swipe edit/delete, inline invite Accept/Decline (`updateMembershipStatus`), the floating "+" → `ProgramActionsSheet` with the pending-invite badge, the inline `AccountMenuSheet`, `applyProgram` hydration → `AdminHomeView`, delete/sign-out `Alert`s. Decisions: **D-SCOPE** (picker only + stub the 7 forward-nav screens) · **D-REF** (`consumed_by=[ios]`; keep iOS-native navigation — the web single-page-modal layout is a platform-idiom divergence) · **D-S1** (faithful 1:1 port) · **D-C1** (ONE web-parity addition — a visible error banner; the legacy swallowed errors) · **D-DEPS** (no new dependency). Flagged F1–F7 (errors-now-surfaced; deferred forward-nav stubs; vestigial `isDeleting`; client role gating; dual invite mechanisms; iOS-only account rows; single-page-hub layout not adopted). Role rules = the `canOpen`/`canManage` table; `admin_only_data_entry` N/A. Ported `apps/ios/.../Features/Home/ProgramPickerView.swift`; added 7 stubs to `_DeferredScreenStubs.swift` (removed the `ProgramPickerView` stub). Build green-check owned by the user (Xcode). |
