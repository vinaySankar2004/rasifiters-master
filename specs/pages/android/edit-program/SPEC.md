# Screen: `edit-program` (android) — admin program editor

> **Status:** 🏗️ built · **Version:** 0.1.0 · **App:** `android` (Compose) · **Thin port-note.**
> Full behavior = iOS `Features/Home/ProgramActions/EditProgramInfoView.swift` + web `/program/edit`.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.PROGRAM_EDIT` (`EditProgramScreen`).
> **Files:** `ui/program/EditProgramScreen.kt`. Reached from the admin Program Info section.

## Parity (iOS 1:1)

- **Program name** (`AppTextField`) · **Status** (`AppDropdownField` Active/Planned/Completed, stored
  lowercase) · **Start date** / **End date** (`DatePillField` → Material `DatePicker`) · **Admin-only data
  entry** toggle card (`Switch`, orange track) + its description.
- Client **date-range validation** (end must be after start) → inline red error; **Save changes**
  (orange button) disabled until name non-empty + dates valid.
- **No-op skip:** an unchanged save pops back without a `PUT` (web/iOS parity). Save →
  `PUT /programs/:id` (`ProgramContext.updateProgram`, updates the active program + picker card locally) →
  pops back.
