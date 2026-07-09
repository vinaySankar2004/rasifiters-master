# Screen: `program` (android) — the Program tab (4th bottom tab)

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
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
  (**View Members** → roster; **Invite Member** if `canEditProgramData`) · a **Role Management** section
  (only if `canEditProgramData`) — Admins/Loggers preview lists + **Manage Roles** · a **Workout Types**
  section (→ the shared manager) · the **My Account** section.

## My Account section (shared, iOS `ProgramMyAccountSection`)

Profile row (initials avatar → [`my-profile`](../my-profile/SPEC.md)) · **Change Password**
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
- **A-3 — Members / Workout Types reuse existing routes.** "View Members" → `MEMBER_ROSTER`, "Invite
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
