# Screen: `manage-roles` (android) — program role assignment

> **Status:** 🏗️ built · **Version:** 0.1.1 · **App:** `android` (Compose) · **Thin port-note.**
> Full behavior = iOS `Features/Home/ProgramManagement/RoleManagementSection.swift` (`ManageRolesView`)
> + web `/program/roles`.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.PROGRAM_ROLES` (`ManageRolesScreen`).
> **Files:** `ui/program/ManageRolesScreen.kt`. Reached from the admin Role Management section (canEdit only).

## Parity (iOS 1:1)

- One row per membership: avatar + name + current role label, then three segmented capsule buttons
  **Admin** (orange) / **Logger** (blue) / **Member** (grey). The current role is filled + checked and
  disabled; the others switch on tap.
- **Last-active-admin guard:** all three buttons are disabled for the sole remaining active admin.
- **Per-member spinner lock** (`isUpdating` gates only the changing row) + **refresh-after-mutation** — the
  iOS-native UX kept over web's optimistic-write/rollback (run-62 D-REF). Tapping a role →
  `PUT /program-memberships` (`updateMemberRole` → `editMembership`), which reloads the roster. Errors
  surface as an inline red footnote.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.1 | 2026-10-13 | Phase 4 quick wins: role-update errors go through `toAppError()` (server text kept for 400/422 and row errors — frontend-kit D-KIT-19, #8). |
