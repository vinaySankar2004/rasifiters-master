# Screen: `program-picker` (android) — the post-auth landing (My Programs hub)

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.2.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios program-picker`](../../ios/program-picker/SPEC.md)
> + [`web programs`](../../web/programs/SPEC.md) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/RootScreen.kt` `SignedInGraph` route `Routes.PROGRAM_PICKER` (`ProgramPickerScreen`) — the
> signed-in landing; picking a program navigates to `Routes.SHELL` (`AppScaffold`, the per-program tab shell).
> **Consumes:** [`programs`](../../../features/programs/SPEC.md) + [`invites`](../../../features/invites/SPEC.md)
> via `ProgramContext` — `GET /programs`, `PUT /programs/order`, `DELETE /programs/:id`, `PUT /program-memberships`.
> **Files:** `ui/programs/ProgramPickerScreen.kt` + `ui/programs/AccountMenuSheet.kt` + `ui/programs/ProgramActionsSheet.kt`.
> **Scope:** the picker + its forward-nav are now wired. The **"+"** opens the `ProgramActionsSheet`
> (My Invites / Create); the account sheet's **Profile / Change Password / Appearance / Notifications** rows
> navigate to the real settings screens (registered in `SignedInGraph`, reusing the Program-tab screens).
> **Health Connect** remains deferred (Phase H/J) and is now **omitted** from the sheet (not shown as a dead row).

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1):** header **"My Programs" / "Manage your fitness programs"** + a circular account
  avatar button (→ the account sheet); a scrollable list of program cards over the member's saved order
  (rendered as-is, no client sort); each `ProgramCard` = name + status pill (status-colored) + date range +
  (members summary OR "Invitation pending"/"Request pending approval") + a status-colored progress bar +
  inline **Accept/Decline** (invited) / **Cancel Request** (requested) pills; loading spinner; **"No programs
  yet"** empty state; client-side `canOpen`/`canManage` role gating (global_admin opens/manages any; program
  admin manages own; active members open only; invited/requested non-openable); tap an openable card →
  `selectProgram()` + navigate to the shell; a floating **"+"** with a pending-invite **badge**; the inline
  **account sheet** (Profile / Change Password / Appearance / Notifications / Health Connect / Privacy Policy /
  Support / Sign Out); native **Delete** + **Sign Out** confirm dialogs.
- **D-C1 (web-parity addition, kept):** a visible **error banner** (dismissible) shown on any
  load/delete/invite/reorder failure — the legacy iOS swallowed errors; Android surfaces them like web/iOS 0.2.x.
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
- **Deviation A-4 (invite badge source):** the "+" pending badge counts `my_status ∈ {invited, requested}` in
  the loaded list (iOS loads a separate `loadPendingInvites`; Android surfaces invites both inline on cards and
  in the actions sheet's My Invites tab, both driven by the same loaded list).
- **Deviation A-5 (the "+" actions sheet):** `ProgramActionsSheet` — a `ModalBottomSheet` with a **My Invites /
  Create** segmented toggle (iOS `ProgramActionsSheet` analog). Opens on **My Invites** when invites are pending,
  else **Create**. *Create* = name/status/start/end form → `POST /programs` → reload list (creator becomes admin).
  *My Invites* = pending-invite cards (Accept/Decline, reusing `respondToInvite`) + a "No pending invitations"
  empty state. The tab-content region is pinned to a fixed height so the sheet doesn't resize when toggling
  tabs. Unlike iOS, Android does **not** port the separate pending-invites subsystem (block-future / admin
  grouping / revoke) — invites reuse the loaded-list Accept/Decline path, consistent with the inline cards.
- **Deviation A-6 (edge-back to picker):** on any of the 4 main tabs, the system back / left-edge-swipe pops the
  whole shell straight back to the picker in one gesture (a `BackHandler` in `AppScaffold`), instead of the
  default tab→start-tab pop. On a detail/log screen it's disabled, so back there pops the detail as usual.
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
- **`PUT /program-memberships`** (`{ program_id, member_id, status }`) — `respondToInvite()`: Accept `"active"` /
  Decline·Cancel `"removed"`, then reloads the list.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-07-08 | Forward-nav wired (pre-Phase-H cleanup). New `ProgramActionsSheet` (My Invites / Create) on the "+" → `POST /programs` `createProgram` (ApiService + ProgramContext + `CreateProgramRequest/Response`), fixed-height tab region so the sheet doesn't resize between tabs (A-5). Account sheet's Profile/Change-Password/Appearance/Notifications rows now navigate to the real settings screens (registered in `SignedInGraph`); Health-Connect row removed (deferred, A-3). Edge-back from the 4 main tabs pops to the picker (A-6, `AppScaffold` `BackHandler`). App-wide background standardized to the solid theme background (auth-only orange gradient removed). Compile-checked green (`assembleDebug`). |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase C — first authenticated screen). `ProgramPickerScreen` + `AccountMenuSheet`; `ProgramContext` gains `programs`/`activeProgram` state + `loadPrograms`/`moveProgram`/`persistProgramOrder`/`deleteProgram`/`respondToInvite`/`selectProgram`; `ProgramDTO` + order/membership DTOs + 4 endpoints. Faithful to iOS/web incl. D-C1 error banner + D-N1 reorder/search; Android-idiom deviations A-1..A-4 (overflow-menu Edit/Delete, long-press-drag reorder, `ModalBottomSheet` account sheet, list-derived invite badge). Forward-nav deferred per D-SCOPE. `RootScreen` now routes token→picker→shell. Compile-checked green (`android-build`, `assembleDebug` BUILD SUCCESSFUL). Visual run = user. |
