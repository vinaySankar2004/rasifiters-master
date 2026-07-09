# Screen: `change-password` (android) — account password change

> **Status:** 🏗️ built · **Version:** 0.1.0 · **App:** `android` (Compose) · **Thin port-note.**
> Full behavior = iOS `Features/Home/Settings/ChangePasswordView.swift` + web `/program/password`.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.PROGRAM_PASSWORD` (`ChangePasswordScreen`).
> **Files:** `ui/program/ChangePasswordScreen.kt`.

## Parity (iOS 1:1)

- Title + subtitle, **New password** (`AppPasswordField` with show/hide) + **Confirm password**
  (masked, no toggle — matches iOS).
- The web-parity live **policy checklist** (appears on first keystroke, greens per rule): ≥8 chars,
  uppercase, lowercase, number (`PolicyRow`). "Passwords do not match" inline when confirm ≠ new.
- **Update Password** (`PillButton`, disabled until valid) → `PUT /auth/change-password`
  (`ProgramContext.changePassword`). Success → a confirmation dialog whose OK pops back.
