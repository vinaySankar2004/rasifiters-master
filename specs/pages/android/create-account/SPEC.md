# Screen: `create-account` (android) — the public sign-up screen

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios create-account`](../../ios/create-account/SPEC.md)
> + [`web create-account`](../../web/create-account/SPEC.md) — this file records only the Android realization.
> **Location:** `ui/RootScreen.kt` `AuthGraph` route `Routes.CREATE_ACCOUNT` (`CreateAccountScreen`), pushed from login.
> **Consumes:** [`auth`](../../../features/auth/SPEC.md) — `ProgramContext.register()` (`POST /auth/register`)
> then `login()` (`POST /auth/login/app`).
> **File:** `apps/android/app/src/main/java/com/app/rasifiters/ui/auth/CreateAccountScreen.kt`.

## Parity + Android-idiom deviations

- **Faithful:** first/last name + username + email + optional gender + password + confirm; **register→auto-login**
  (`register` returns no token, so `login(username, password)` follows for the session); heading "Create Account" /
  "Start tracking your fitness journey"; **inline email-format validation** + muted "Enter a valid email address."
  hint (D-C2); **live password checklist** (≥8 · uppercase · lowercase · number, greens per rule, D-C3); **muted
  "Passwords don't match."** hint (D-C4); Privacy Policy + "Already have an account? Sign in" links; real
  `BrandMark(90)`. `canSubmit` = names non-blank + valid email + policy-met + passwords equal. Error → native
  dialog titled **"Create Account"**.
- **Deviation A-1 (idiom):** gender uses the shared **`AppDropdownField`** — a field-styled trigger opening a
  plain **opaque** `Popup` menu **width-matched** to the field (selected option in `AppOrange` with a check;
  tap-outside/back to dismiss). Options = `["Female","Male","Non-binary","Prefer not to say"]`. (Liquid-Glass/blur
  was prototyped via Haze then **dropped** — too complex for the payoff; a normal solid surface is the standard.)
- **Deviation A-2 (gender send):** blank gender is sent as `null` (`gender.ifBlank { null }`) rather than iOS's
  empty-string (iOS F5); the backend treats both as absent, so this harmonizes toward web without behavior change.
- **Deviation A-3 (idiom):** on success `login()` flips `authToken` → the root gate swaps to the shell (no explicit
  navigate); sign-in link `popBackStack()` (iOS `dismiss()` analog). **autoFocus (iOS/web D-C5) not ported** —
  deferred as a minor idiom polish (no functional impact).
- **Deviation A-5 (shared UI kit):** all inputs use the shared **`AppTextField`/`AppPasswordField`** primitive
  (a `BasicTextField` in a fixed **50dp** height, **14dp**-rounded, bordered row with a placeholder — not
  Material's `OutlinedTextField`) so every field on every auth form has identical height + curve. The form is
  hosted by `AuthScaffold` which **vertically centers** it (scroll/top-anchor fallback when long). Tuned via
  single constants in `AuthComponents.kt` (`FieldHeight`, `FieldShape`).
- **F1–F5 (kept):** role from body; register-then-login with no rollback on the login leg; no client rate-limit;
  no client username-format rules (server is authority).

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-07-08 | UI polish pass (user visual review). Shared compact field kit (`AppTextField`/`AppPasswordField`, 50dp/14dp — A-5), standardized **`AppDropdownField`** (opaque, width-matched — A-1; Haze/Liquid-Glass prototyped then dropped), centered `AuthScaffold`. `BrandMark(84)`. |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase B). `CreateAccountScreen` composable — full field set + email hint + live password checklist + mismatch hint + gender dropdown, register→auto-login, replacing the Phase-A stub. Compile-checked green (`android-build`). Visual run = user. Noted: autoFocus deferred (A-3). |
