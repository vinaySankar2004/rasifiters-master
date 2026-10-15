# Screen: `edit-program` (android) — admin program editor

> **Status:** 🏗️ built · **Version:** 0.1.3 · **App:** `android` (Compose) · **Thin port-note.**
> Full behavior = iOS `Features/Home/ProgramActions/EditProgramInfoView.swift` + web `/program/edit`.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.PROGRAM_EDIT` (`EditProgramScreen`); since 0.1.2 also
> `ui/RootScreen.kt` `SignedInGraph` (the picker card's Edit — D-REL1).
> **Files:** `ui/program/EditProgramScreen.kt`. Reached from the admin Program Info section and the picker card's ⋮ **Edit**.

## Parity (iOS 1:1)

- **Program name** (`AppTextField`) · **Status** (`AppDropdownField` Active/Planned/Completed, stored
  lowercase) · **Start date** / **End date** (`DatePillField` → Material `DatePicker`) · **Admin-only data
  entry** toggle card (`Switch`, orange track) + its description.
- Client **date-range validation** (end must be after start) → inline red error; **Save changes**
  (orange button) disabled until name non-empty + dates valid.
- **No-op skip:** an unchanged save pops back without a `PUT` (web/iOS parity). Save →
  `PUT /programs/:id` (`ProgramContext.updateProgram`, updates the active program + picker card locally — without the
  server's day fields, D-PS1 — then re-reads the program list in the background) → pops back.

## Phase 4 polish (0.1.2)

- **D-REL1 (#36, #40 — invites D-C11, programs D-C4, frontend-kit D-KIT-22):** #40 a second entry point — the
  [program-picker](../program-picker/SPEC.md) card's ⋮ **Edit** selects that program and pushes this screen on the root
  graph (`SignedInGraph`; a root form route, so a notification tap there only marks read); Back / Save return to the
  picker. #36 the back button is the shared labelled 48 dp `Back` target (`DetailChrome`). The date check stays on the
  client for edits (`End date must be after the start date.`; the server checks CREATE only — programs D-C4).
  `EditProgramScreen.kt` itself is unchanged in `0b0a0a3` (the change is the route + the shared back target).

## Parity sweep (0.1.3)

- **D-PS1 (2026-10-14 — METHODOLOGY R9; sweep D1 / X-2, [programs](../../../features/programs/SPEC.md) D-C6):** a
  successful save writes the local copy with `totalDays = null, elapsedDays = null` — the server's day counts belong to
  the old dates, and keeping them left the Summary ring stale after a date edit (X-2) — so the Summary ring and the
  Program tab fall back to the device-date math on the new dates; then `scope.launch { loadPrograms().onSuccess {
  reconcileActiveProgram() } }` re-reads the list, and the new row brings the server's numbers. The re-read is launched,
  so the save result is not delayed. (`core/ProgramContext.kt` `updateProgram`; `EditProgramScreen.kt` unchanged.)

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.3 | 2026-10-14 | **D-PS1 — parity sweep D1 / X-2 (Android `8144345`).** A save drops the stale `totalDays` / `elapsedDays` from the local copy (the ring falls back to date math on the new dates) and re-reads `/programs` in the background, so the ring then matches the picker bar. |
| 0.1.2 | 2026-10-13 | **D-REL1 — Phase 4 polish (`0b0a0a3`).** #40 also opened from the picker card's Edit (root-graph route, a notification-safe form); #36 shared labelled 48 dp back. Screen file unchanged. |
| 0.1.1 | 2026-10-13 | Phase 4 quick wins: save errors go through `toAppError()` (server text kept for 400/422 and row errors — frontend-kit D-KIT-19, #8). |
