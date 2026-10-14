# Screen: `change-password` (android) — account password change

> **Status:** 🏗️ built · **Version:** 0.3.0 · **App:** `android` (Compose) · **Thin port-note.**
> Full behavior = iOS `Features/Home/Settings/ChangePasswordView.swift` + web `/program/password`.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.PROGRAM_PASSWORD` (`ChangePasswordScreen`).
> **Files:** `ui/program/ChangePasswordScreen.kt`.

## Parity (iOS 1:1)

- Title + subtitle, **New password** (`AppPasswordField` with show/hide) + **Confirm password**
  ~~(masked, no toggle — matches iOS)~~ *(superseded at 0.3.0 by D-REL1 — an `AppPasswordField` with its own Show/Hide)*.
- The web-parity live **policy checklist** (appears on first keystroke, greens per rule): ≥8 chars,
  uppercase, lowercase, number (`PolicyRow`). "Passwords do not match" inline when confirm ≠ new.
- **Update Password** (`PillButton`, disabled until valid) → `PUT /auth/change-password`
  (`ProgramContext.changePassword`). Success → a confirmation dialog whose OK pops back.

## Reliability Phase 3 decisions (C3, 0.2.0)

- **D-REL3-1 (auth §3.1 rule 6, A1, A9):** `PUT /auth/change-password` is **never retried automatically** — the body
  is one-shot, so OkHttp can't replay it after a dropped connection; a 401 means the write never ran, so after the
  authenticator's refresh it is re-sent **once**. After a timeout / dropped connection / 408 / 5xx the screen says
  **"We couldn't confirm your password change. It may have gone through, so try signing in with your new password."**;
  a manual retry answered `400 "must be different"` counts as done (the success dialog shows). Success dialog copy:
  **"Password updated. Your other devices will be signed out."** (this device stays signed in). Other errors: the
  server's text for 400 / 409 / 422, the kit copy otherwise (never "Invalid token.").

## Phase 4 polish (0.3.0)

- **D-REL1 (#35, #36 — auth D-C22, frontend-kit D-KIT-22):** #35 **Confirm password** is a real password field
  (`AppPasswordField`, its own `confirmVisible` Show/Hide) instead of a masked plain text field; both fields are
  `ContentType.NewPassword` with autocorrect off (Compose BOM 2025.04.01 autofill). #36 both eyes are 48 dp targets
  labelled `Show password` / `Hide password`; the back button is the shared labelled 48 dp `Back` target.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.3.0 | 2026-10-13 | **D-REL1 — Phase 4 polish (`0b0a0a3`).** #35 Confirm password becomes a password field with its own Show/Hide; both `NewPassword` autofill, no autocorrect; #36 labelled 48 dp eyes + back. |
| 0.2.0 | 2026-10-13 | **Reliability Phase 3 C3 — D-REL3-1** rule 6 (one-shot, 401 re-send, "couldn't confirm", "must be different" = done) + the shared success copy. Compile-checked green (`assembleDebug`). |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase G). |
