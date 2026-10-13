# Screen: `program` (android) — the Program tab (4th bottom tab)

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.2.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the iOS Program tab
> (`Features/Home/Tabs/{Admin,Standard}ProgramTab.swift` + `ProgramCards.swift`) + the web `/program`
> surfaces — this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.PROGRAM` (`ProgramScreen`) — Tab 4 of the shell.
> **Files:** `ui/program/{ProgramScreen,ProgramSections,ProgramCards,ProgramAccountSection}.kt`.

## Parity + role bifurcation (`isProgramAdmin`)

Header (both variants): **"Program"** + active-program name + the signed-in user's gradient initials avatar
(web-parity avatar, same as the Summary tab).

- **Standard (non-admin):** read-only **Program Info** card (Name / Status pill / Duration / Progress bar +
  elapsed·remaining days / Active Members — client date math, iOS `ProgramContext` computeds) + a standalone
  **Switch Program** card + a **Leave Program** card + the **My Account** section.
- **Admin/global-admin:** a **Program Info** action section (**Select Program** always · **Edit Program
  Details** if `canEditProgramData` · **Leave Program** if not global-admin) · a **Members** section
  (**View Members** → roster — **0.2.0: `People` · `<n> enrolled` → the People list**; **Invite Member** if `canEditProgramData`) · a **Role Management** section
  (only if `canEditProgramData`) — Admins/Loggers preview lists + **Manage Roles** · a **Workout Types**
  section (→ the shared manager) · the **My Account** section.

## My Account section (shared, iOS `ProgramMyAccountSection`)

Profile row (initials avatar → [`my-profile`](../my-profile/SPEC.md)) · **Inbox** (0.2.0: `<n> new`, else `Invites and
notifications` → the [`inbox`](../inbox/SPEC.md) screen) · **Change Password**
([`change-password`](../change-password/SPEC.md)) · **Appearance** (icon + current mode →
[`appearance`](../appearance/SPEC.md)) · **Notifications** ([`notifications`](../notifications/SPEC.md)) ·
**Privacy Policy** / **Support** (external links via `AppLinks`) · **Sign Out** (confirm dialog →
`ProgramContext.signOut()`).

## Android-idiom deviations

- **A-1 — Apple Health row omitted.** iOS lists an "Apple Health" account row; Android's Health Connect
  settings land in **Phase H/J**, so the row is intentionally absent here (user-confirmed 2026-07-08).
- **A-2 — Switch/Select/Leave → picker via a pop.** "Switch/Select Program" and a successful "Leave" call
  `onSwitchProgram` = `nav.popBackStack(PROGRAM_PICKER)` (the picker is the signed-in start destination),
  rather than iOS's `navigationDestination` push. Local state (leave drops the card + clears the active
  program) keeps the returned picker fresh.
- **A-3 — Members / Workout Types reuse existing routes.** "View Members" (0.2.0: "People") → `MEMBER_ROSTER` (now the [`people`](../people/SPEC.md) list), "Invite
  Member" → `MEMBER_INVITE` (Phase E), "Workout Types" → `LIFESTYLE_WORKOUT_TYPES` (Phase F). No new screens.
- **A-4 — neutral M3 surfaces.** Section/row cards use the neutral surface ramp; brand tints appear only on
  the icon badges we set explicitly (memory `android-neutral-m3-surface-roles`).
- **A-5 — dialogs, not alerts.** Leave + Sign Out use Material `AlertDialog` (iOS `.alert`); the destructive
  action is tinted `error`.

## Data / API

- Admin entry loads `ensureMembersLoaded` (View-Members count), `loadMembershipDetails` (Role Management +
  the signed-in gender seed) and `loadAllProgramWorkouts` (Workout Types count).
- Leave = `PUT /program-memberships/leave` (`ProgramContext.leaveProgram`); Sign Out = the shared
  `signOut()`; program/account mutations live on the sub-route screens.

## Phase 4 (0.2.0)

- **D-NP1 (NP-U1, R7, R8):** the Members section's first row reads `People` · `<n> enrolled` (`ProgramSections.kt`) and
  opens the People list (`MEMBER_ROSTER` → `PeopleListScreen`); the My Account section gains the `Inbox` row right after
  the profile row (`ProgramAccountSection.kt`, the unread `badge` as `<n> new`) → `Routes.INBOX` (the shell copy of the
  Inbox screen — tapping the open program's row just goes back).

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-10-13 | **D-NP1 — Phase 4 (`d528f75`).** "View Members" → `People` · `<n> enrolled` (the People list); the My Account `Inbox` row (`<n> new`). |
| 0.1.1 | 2026-10-13 | Phase 4 quick wins: the Leave error goes through `toAppError()` (frontend-kit D-KIT-19, #8). |
