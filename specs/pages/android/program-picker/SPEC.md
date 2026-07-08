# Screen: `program-picker` (android) — the post-auth landing (My Programs hub)

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios program-picker`](../../ios/program-picker/SPEC.md)
> + [`web programs`](../../web/programs/SPEC.md) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/RootScreen.kt` `SignedInGraph` route `Routes.PROGRAM_PICKER` (`ProgramPickerScreen`) — the
> signed-in landing; picking a program navigates to `Routes.SHELL` (`AppScaffold`, the per-program tab shell).
> **Consumes:** [`programs`](../../../features/programs/SPEC.md) + [`invites`](../../../features/invites/SPEC.md)
> via `ProgramContext` — `GET /programs`, `PUT /programs/order`, `DELETE /programs/:id`, `PUT /program-memberships`.
> **Files:** `ui/programs/ProgramPickerScreen.kt` + `ui/programs/AccountMenuSheet.kt`.
> **Scope (mirrors iOS D-SCOPE):** the PICKER ONLY. Forward-nav (create-program/invites "+" sheet, the account
> destinations Profile/Change-Password/Appearance/Notifications/Health-Connect) is DEFERRED and stubbed until
> later phases (create/edit → later; account rows → Phase G; Health Connect → Phase H).

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
  `AppLinks`, since Android has no separate support URL); Profile/Change-Password/Appearance/Notifications/
  **Health Connect** rows are present but currently **dismiss** (deferred destinations). The iOS "Apple Health"
  row is realized as **"Health Connect"** (the Samsung-Health-via-Health-Connect analog, Phase H).
- **Deviation A-4 (invite badge source):** the "+" pending badge counts `my_status ∈ {invited, requested}` in
  the loaded list (iOS loads a separate `loadPendingInvites`; the picker-only scope has no invites sheet yet).
- **F-kept (from iOS/web):** client-side role gating is UI-only (the backend re-authorizes every call); the pick
  currently hydrates only the active `ProgramDTO` into `ProgramContext` (membership/lookup hydration lands with
  the downstream screens); the "+" create/invites sheet is a deferred no-op.

## Data / API (all via `ProgramContext`, Bearer-authed by the OkHttp layer)

- **`GET /programs`** → `List<ProgramDTO>` (`id, name, status, start/end_date, active/total_members,
  progress_percent, my_role, my_status, admin_only_data_entry`) — `loadPrograms()` on entry.
- **`PUT /programs/order`** (`{ program_ids }`) — `persistProgramOrder(previousOrder)` after a drop; returns
  `{ message }`; optimistic with revert-on-failure.
- **`DELETE /programs/:id`** — `deleteProgram()`; drops the card locally on success.
- **`PUT /program-memberships`** (`{ program_id, member_id, status }`) — `respondToInvite()`: Accept `"active"` /
  Decline·Cancel `"removed"`, then reloads the list.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-08 | Initial Android port (Phase C — first authenticated screen). `ProgramPickerScreen` + `AccountMenuSheet`; `ProgramContext` gains `programs`/`activeProgram` state + `loadPrograms`/`moveProgram`/`persistProgramOrder`/`deleteProgram`/`respondToInvite`/`selectProgram`; `ProgramDTO` + order/membership DTOs + 4 endpoints. Faithful to iOS/web incl. D-C1 error banner + D-N1 reorder/search; Android-idiom deviations A-1..A-4 (overflow-menu Edit/Delete, long-press-drag reorder, `ModalBottomSheet` account sheet, list-derived invite badge). Forward-nav deferred per D-SCOPE. `RootScreen` now routes token→picker→shell. Compile-checked green (`android-build`, `assembleDebug` BUILD SUCCESSFUL). Visual run = user. |
