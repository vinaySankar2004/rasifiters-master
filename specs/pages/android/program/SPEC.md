# Screen: `program` (android) — the Program tab (4th bottom tab)

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.3.0 · **App:** `android` (Compose)
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
**Health Connect** (0.3.0: `Sync workouts, sleep, and steps` → [`health-connect`](../health-connect/SPEC.md)) ·
**Privacy Policy** / **Support** (external links via `AppLinks`) · **Sign Out** (confirm dialog →
`ProgramContext.signOut()`).

## Android-idiom deviations

- ~~**A-1 — Apple Health row omitted.** iOS lists an "Apple Health" account row; Android's Health Connect
  settings land in **Phase H/J**, so the row is intentionally absent here (user-confirmed 2026-07-08).~~ *(Stale since
  Phase H: the account section has a **Health Connect** row, the Android analog of iOS "Apple Health".)*
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
  the signed-in gender seed) and `loadAllProgramWorkouts` (Workout Types count) — since 0.3.0 as three `rememberLoad`
  handles keyed by program (`ensureMembersLoaded(force = true)`), D-REL1.
- Leave = `PUT /program-memberships/leave` (`ProgramContext.leaveProgram`); Sign Out = the shared
  `signOut()`; program/account mutations live on the sub-route screens.

## Phase 4 (0.2.0)

- **D-NP1 (NP-U1, R7, R8):** the Members section's first row reads `People` · `<n> enrolled` (`ProgramSections.kt`) and
  opens the People list (`MEMBER_ROSTER` → `PeopleListScreen`); the My Account section gains the `Inbox` row right after
  the profile row (`ProgramAccountSection.kt`, the unread `badge` as `<n> new`) → `Routes.INBOX` (the shell copy of the
  Inbox screen — tapping the open program's row just goes back).

## Phase 4 polish (0.3.0)

- **D-REL1 (#33, #45 — program-memberships D-C7, program-workouts D-C3, frontend-kit D-KIT-21; polish amendments
  PA11, PA1):** #33 the admin variant's three reads run on the kit load states (`rememberLoad`, keyed by program, reload
  on reconnect; data already on screen refreshes underneath). **People** and **Workout Types** read `Loading...` while
  loading and `—` only after a failure, with `InlineLoadError` (`Couldn't load this` + Retry) under the row — never a
  fake `0 enrolled` / `0 types available`; **Role Management** shows a spinner, then the Admins / Loggers lists, `No
  admins or loggers assigned` only for a loaded roster that has none, or the inline error. Admins get **pull to
  refresh** (re-reads all three) and the floating `Couldn't refresh · Retry` banner (with list clearance) when a load is
  stale. #45 the Health Connect row's subtitle reads `Sync workouts, sleep, and steps` (`ProgramAccountSection.kt`).

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.3.0 | 2026-10-13 | **D-REL1 — Phase 4 polish (`0b0a0a3`).** #33 admin sections on the kit states — `Loading...` / `—` + `Couldn't load this · Retry` (People, Workout Types), spinner / inline error / honest empty (Role Management), pull to refresh, stale banner, reconnect reload; #45 Health Connect subtitle `Sync workouts, sleep, and steps`. Stale A-1 (Health Connect row omitted) struck. |
| 0.2.0 | 2026-10-13 | **D-NP1 — Phase 4 (`d528f75`).** "View Members" → `People` · `<n> enrolled` (the People list); the My Account `Inbox` row (`<n> new`). |
| 0.1.1 | 2026-10-13 | Phase 4 quick wins: the Leave error goes through `toAppError()` (frontend-kit D-KIT-19, #8). |
