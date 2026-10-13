# Screen: `program-picker` (android) — the post-auth landing (My Programs hub)

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.3.1 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios program-picker`](../../ios/program-picker/SPEC.md)
> + [`web programs`](../../web/programs/SPEC.md) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/RootScreen.kt` `SignedInGraph` route `Routes.PROGRAM_PICKER` (`ProgramPickerScreen`) — the
> signed-in landing; picking a program navigates to `Routes.SHELL` (`AppScaffold`, the per-program tab shell).
> **Consumes:** [`programs`](../../../features/programs/SPEC.md) + [`invites`](../../../features/invites/SPEC.md)
> via `ProgramContext` — `GET /programs`, `PUT /programs/order`, `DELETE /programs/:id`, `GET /program-memberships/my-invites`
> (global admins `/all-invites`), `PUT /program-memberships/invite-response`, `PUT /program-memberships` (Cancel Request);
> [`app-config`](../../../features/app-config/SPEC.md) (update banner) + [`frontend-kit`](../../../features/frontend-kit/SPEC.md).
> **Files:** `ui/programs/ProgramPickerScreen.kt` + `ui/programs/AccountMenuSheet.kt` + `ui/programs/ProgramActionsSheet.kt`
> + `ui/programs/InviteInbox.kt`.
> **Scope:** the picker + its forward-nav are now wired. The **"+"** opens the `ProgramActionsSheet`
> (My Invites / Create); the account sheet's **Profile / Change Password / Appearance / Notifications** rows
> navigate to the real settings screens (registered in `SignedInGraph`, reusing the Program-tab screens).
> **Health Connect** remains deferred (Phase H/J) and is now **omitted** from the sheet (not shown as a dead row).

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1):** header **"My Programs" / "Manage your fitness programs"** + a circular account
  avatar button (→ the account sheet); a scrollable list of program cards over the member's saved order
  (rendered as-is, no client sort); each `ProgramCard` = name + status pill (status-colored) + date range +
  (members summary OR "Invitation pending"/"Request pending approval") + a status-colored progress bar +
  a **Cancel Request** pill on "requested" cards (A-5: invited cards no longer accept inline); loading spinner; **"No programs
  yet"** empty state; client-side `canOpen`/`canManage` role gating (global_admin opens/manages any; program
  admin manages own; active members open only; invited/requested non-openable); tap an openable card →
  `selectProgram()` + navigate to the shell; a floating **"+"** with a pending-invite **badge**; the inline
  **account sheet** (Profile / Change Password / Appearance / Notifications / Health Connect / Privacy Policy /
  Support / Sign Out); native **Delete** + **Sign Out** confirm dialogs.
- **D-C1 (web-parity addition) — SUPERSEDED in part by A-7 (0.3.0):** the dismissible inline **error banner** now
  shows only **reorder / delete / Cancel Request** failures (kit copy). Load failures moved to the frontend kit
  (A-7: `ErrorView` with no data, the floating stale banner with data); invite errors show in the inbox (A-5).
- **D-N1 (net-new post-parity, kept):** **drag-to-reorder** + **floating search** — reorder persists via
  `PUT /programs/order` (optimistic: the `ProgramContext.programs` list mutates first, reverts + banners on
  failure); search is client-side name filter over the loaded list.
- **Deviation A-1 (Edit/Delete idiom):** manage actions live in a per-card **overflow (⋮) menu**, NOT iOS
  swipe actions — because **long-press is the reorder gesture** on Android, so swipe/long-press can't also carry
  Edit/Delete. Delete is wired (→ confirm dialog → `DELETE /programs/:id`); **Edit is deferred** (no menu item
  yet — lands with the edit screen in a later phase).
- **Deviation A-2 (reorder idiom):** reorder = **long-press-drag over the `LazyColumn`** (the Material analog of
  SwiftUI `List.onMove`), a self-contained `ReorderState` that swaps the source list per crossing and re-anchors
  the dragged item by folding the offset delta. **Disabled while searching** (offsets must map 1:1 onto the full
  list) — matches iOS's `nil` `.onMove` while filtering. New programs land at the bottom (server `NULLS LAST`).
- **Deviation A-3 (account sheet):** a Material3 `ModalBottomSheet` (iOS `AccountMenuSheet` analog). Privacy
  Policy / Support open externally via `LocalUriHandler` (Support → the `mailto:` recovery fallback in
  `AppLinks`, since Android has no separate support URL); **Profile / Change Password / Appearance /
  Notifications** rows now **navigate** to the real settings screens (same screens the Program tab uses,
  registered in `SignedInGraph` so they're reachable before any program is open). The iOS "Apple Health" row
  ("Health Connect" on Android) is **omitted** here — deferred to Phase H/J — matching `ProgramAccountSection`.
- **A-4 (invite badge source, rewritten 0.3.0):** the "+" badge = the invite inbox count (`GET /my-invites`; global
  admins `/all-invites` — iOS `pendingInvites.count` parity) + the member's own `requested` programs. The earlier
  list-derived badge rested on invites arriving in `GET /programs`, which they never do in prod.
- **A-5 (the "+" actions sheet, rewritten 0.3.0 — invites §3.1, A10):** `ProgramActionsSheet` — a `ModalBottomSheet`
  with a **My Invites** (global admins: **All Invites**) **/ Create** segmented toggle. Opens on the invites tab when
  there is something to act on (or on an invite push tap, A-9), else **Create**. *Create* = name/status/start/end →
  `POST /programs` → reload (creator becomes admin). The invites tab is the ONE inbox: `InviteCard`s from
  `/my-invites` (`/all-invites` for global admins, sorted by program, with a "To: name @username" line and a
  **Revoke** pill) answered via `PUT /invite-response` (`accept` / `decline` / `revoke`); **Decline** asks
  "Decline invitation?" with a **"Block future invites"** checkbox (iOS `DeclineInviteDialog` parity); Accept
  closes the sheet. The 200 response message is **not shown** (iOS parity; invites §3.1 as amended). Errors show in
  the tab (kit copy, or the server's 400 text). The member's own "requested" programs keep **Cancel Request**
  (`PUT /program-memberships`, status removed). Loading → spinner; failed with nothing to show → `ErrorView`;
  empty → "No pending invitations". The inline invited Accept/Decline on cards is **removed** (A10, all surfaces).
  The tab-content region stays pinned to a fixed height.
- **Deviation A-6 (edge-back to picker):** on any of the 4 main tabs, the system back / left-edge-swipe pops the
  whole shell straight back to the picker in one gesture (a `BackHandler` in `AppScaffold`), instead of the
  default tab→start-tab pop. On a detail/log screen it's disabled, so back there pops the detail as usual.
- **A-7 (frontend kit, 0.3.0):** this member's **cached list shows first** (`core/LaunchCache`), then refreshes;
  programs + the invite inbox load **in parallel**; a failed first load with no cache → `ErrorView` + Retry (never an
  empty "No programs yet"); no data while offline (polish-1: link down or proven offline) → the kit's **offline**
  `ErrorView` + Retry, never the spinner; **pull to refresh** (M3 `PullToRefreshBox`) reloads both. ONE floating banner slot above
  the FABs (`FloatingBanner`, `bottomInset = 146.dp` + `navigationBarsPadding`): **offline** (the app-wide
  connectivity monitor, A6) › **stale** ("Couldn't refresh" + Retry) › **update available** (A-8). While a banner
  shows, the list's bottom padding grows from 120 dp to 238 dp (146 + the 76 dp banner block + a 16 dp gap) **plus the
  system nav-bar inset**, so the last card scrolls clear of it with any navigation mode.
- **A-8 (version gate, 0.3.0):** the dismissable **"A new version of RaSi Fiters is available"** banner (Update → the
  Play Store listing via a plain intent; × remembers the dismissal per version) shows **on the picker only** (A7).
  The blocking "Update required" screen is app-wide (`RootScreen`); while it shows, neither nav graph is composed,
  so no sheet or dialog (each its own window) can sit above it.
- **A-9 (push tap, 0.3.0 — notifications §3.2, U2):** tapping an **invite** push pops back to the picker, which opens
  the actions sheet **on its invites tab** and reloads; any other push type only acknowledges + re-fetches its data.
- **F-kept (from iOS/web):** client-side role gating is UI-only (the backend re-authorizes every call); the pick
  currently hydrates only the active `ProgramDTO` into `ProgramContext` (membership/lookup hydration lands with
  the downstream screens).

## Data / API (all via `ProgramContext`, Bearer-authed by the OkHttp layer)

- **`GET /programs`** → `List<ProgramDTO>` (`id, name, status, start/end_date, active/total_members,
  progress_percent, my_role, my_status, admin_only_data_entry`) — `loadPrograms()` on entry.
- **`PUT /programs/order`** (`{ program_ids }`) — `persistProgramOrder(previousOrder)` after a drop; returns
  `{ message }`; optimistic with revert-on-failure.
- **`POST /programs`** (`{ name, status, start_date, end_date }`) — `createProgram()` from the actions sheet's
  Create tab; the creator becomes the program's admin. Backend defaults a blank/unknown status → `planned` and
  returns a slim `{ id, message }`, so we **reload** the list rather than decode a full `ProgramDTO`.
- **`DELETE /programs/:id`** — `deleteProgram()`; drops the card locally on success.
- **`GET /program-memberships/my-invites`** (global admins **`/all-invites`**) → `List<PendingInviteDTO>` — `loadInvites()`
  on entry, pull-to-refresh, an invite SSE/push, and after every response.
- **`PUT /program-memberships/invite-response`** (`{ invite_id, action, block_future? }`) — `respondToInvite()`, then
  inbox + programs reload in parallel.
- **`PUT /program-memberships`** (`{ program_id, member_id, status: "removed" }`) — `cancelJoinRequest()` (a
  "requested" card's Cancel Request), then reloads the list.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.3.1 | 2026-10-13 | **Polish 1 (offline detection).** No data while offline (link down OR proven offline by a failed request) → the kit's offline `ErrorView` + Retry, never the spinner (rule 6); the offline banner now follows the combined monitor; back online, a failed / stale list reloads itself (D-KIT-13). Compile-checked green (`assembleDebug`). |
| 0.3.0 | 2026-10-13 | **Reliability Phase 3 C3.** Invites move to the ONE inbox (`/my-invites`; global admins `/all-invites` + Revoke) answered via `/invite-response` with the decline "Block future invites" dialog; inline invited Accept/Decline retired, requested Cancel Request kept (A-4/A-5 rewritten, A10). Kit adoption: cached list first, parallel loads, `ErrorView`, one floating offline / stale / update banner above the FABs with list padding, pull to refresh (A-7). Update-available banner + withheld sheets under the blocking update screen (A-8). Invite push tap opens the invites tab (A-9). D-C1 narrowed to reorder / delete / cancel failures. Compile-checked green (`assembleDebug`). |
| 0.2.0 | 2026-07-08 | Forward-nav wired (pre-Phase-H cleanup). New `ProgramActionsSheet` (My Invites / Create) on the "+" → `POST /programs` `createProgram` (ApiService + ProgramContext + `CreateProgramRequest/Response`), fixed-height tab region so the sheet doesn't resize between tabs (A-5). Account sheet's Profile/Change-Password/Appearance/Notifications rows now navigate to the real settings screens (registered in `SignedInGraph`); Health-Connect row removed (deferred, A-3). Edge-back from the 4 main tabs pops to the picker (A-6, `AppScaffold` `BackHandler`). App-wide background standardized to the solid theme background (auth-only orange gradient removed). Compile-checked green (`assembleDebug`). |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase C — first authenticated screen). `ProgramPickerScreen` + `AccountMenuSheet`; `ProgramContext` gains `programs`/`activeProgram` state + `loadPrograms`/`moveProgram`/`persistProgramOrder`/`deleteProgram`/`respondToInvite`/`selectProgram`; `ProgramDTO` + order/membership DTOs + 4 endpoints. Faithful to iOS/web incl. D-C1 error banner + D-N1 reorder/search; Android-idiom deviations A-1..A-4 (overflow-menu Edit/Delete, long-press-drag reorder, `ModalBottomSheet` account sheet, list-derived invite badge). Forward-nav deferred per D-SCOPE. `RootScreen` now routes token→picker→shell. Compile-checked green (`android-build`, `assembleDebug` BUILD SUCCESSFUL). Visual run = user. |
