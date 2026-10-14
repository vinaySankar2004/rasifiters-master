# Screen: `manage-roles` (android) — program role assignment

> **Status:** 🏗️ built · **Version:** 0.2.0 · **App:** `android` (Compose) · **Thin port-note.**
> Full behavior = iOS `Features/Home/ProgramManagement/RoleManagementSection.swift` (`ManageRolesView`)
> + web `/program/roles`.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.PROGRAM_ROLES` (`ManageRolesScreen`).
> **Files:** `ui/program/ManageRolesScreen.kt`. Reached from the admin Role Management section (canEdit only).

## Parity (iOS 1:1)

- One row per membership: avatar + name + current role label, then three segmented capsule buttons
  **Admin** (orange) / **Logger** (blue) / **Member** (grey). The current role is filled + checked ~~and
  disabled~~ *(0.2.0, D-REL1: announced as selected and still tappable — a re-pick is a no-op)*; the others switch on tap.
- **Last-active-admin guard:** all three buttons are disabled for the sole remaining active admin.
- **Per-member spinner lock** (`isUpdating` gates only the changing row) + **refresh-after-mutation** — the
  iOS-native UX kept over web's optimistic-write/rollback (run-62 D-REF). Tapping a role →
  `PUT /program-memberships` (`updateMemberRole` → `editMembership`), which reloads the roster. Errors
  surface as an inline red footnote.

## Phase 4 polish (0.2.0)

- **D-REL1 (#33, #36 — program-memberships D-C7, frontend-kit D-KIT-21 / D-KIT-22):** #33 the roster loads through
  `rememberLoad` (keyed by program) inside `KitLoad`: a spinner, a failed load → `ErrorView` + Retry (offline → the
  offline copy) instead of an empty card, an honest empty line `No members in this program yet.`, **pull to refresh**,
  the `Couldn't refresh · Retry` stale banner, and a reload on reconnect. #36 each role pill is a ≥ 48 dp
  `selectableTarget` (`Role.RadioButton`, selected state announced) — `enabled = !disabled`, so only the
  last-active-admin guard disables it; the back button is the shared labelled 48 dp `Back`.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-10-13 | **D-REL1 — Phase 4 polish (`0b0a0a3`).** #33 roster on `KitLoad` (ErrorView + Retry, `No members in this program yet.`, pull to refresh, stale banner, reconnect reload); #36 role pills as 48 dp radio choices (current role selected, not disabled), 48 dp back. |
| 0.1.1 | 2026-10-13 | Phase 4 quick wins: role-update errors go through `toAppError()` (server text kept for 400/422 and row errors — frontend-kit D-KIT-19, #8). |
