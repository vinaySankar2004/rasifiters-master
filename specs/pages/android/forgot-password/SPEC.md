# Screen: `forgot-password` (android) — request a password reset (auth-recovery, step 1)

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`web forgot-password`](../../web/forgot-password/SPEC.md)
> (the primary reference — web-first recovery) + the iOS realization in [`ios login`](../../ios/login/SPEC.md) D-C2
> / `ForgotPasswordView`. This file records only the Android realization.
> **Location:** `ui/RootScreen.kt` `AuthGraph` route `Routes.FORGOT_PASSWORD` (`ForgotPasswordScreen`), pushed
> from login. **Consumes:** [`auth`](../../../features/auth/SPEC.md) — `ProgramContext.forgotPassword()`
> (`POST /auth/forgot-password`).
> **File:** `apps/android/app/src/main/java/com/app/rasifiters/ui/auth/ForgotPasswordScreen.kt`.

## Parity + Android-idiom deviations

- **Faithful:** email-only field with **inline format validation** (muted "Enter a valid email address." hint);
  **"Send reset link"** CTA disabled until valid, spinner while loading; on submit the form is **replaced** by the
  always-generic green banner "If an account with that email exists, we've sent a password reset link. Check your
  inbox (and your spam folder)." — **no account enumeration**; a genuine send failure shows a neutral red
  message and keeps the form; **always-visible "Contact us" `mailto:` fallback** (for migrated no-email accounts);
  **"Back to login"**; real `BrandMark(90)`. The set-new-password step still completes on the web
  `reset-password` page (the emailed link) — not duplicated natively (iOS D-C2 parity).
- **Deviation A-1 (idiom):** the `mailto:` fallback + Privacy links are `TextButton`s opened via `LocalUriHandler`;
  `SUPPORT_EMAIL` + the pre-filled subject live in `core/AppLinks.kt` (the Android analog of iOS `APIConfig`
  `supportMailtoURL` / web `SUPPORT_EMAIL`). Success/error banners are `Text` in tinted `RoundedCornerShape`
  containers (Compose) vs the SwiftUI rounded rects.
- **F1 (kept):** the always-200 privacy-safe backend + generic confirmation are unchanged (no enumeration).

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-08 | Initial Android port (Phase B). `ForgotPasswordScreen` composable → `ProgramContext.forgotPassword()` (`POST /auth/forgot-password`), generic confirmation + neutral error + always-visible contact fallback, replacing the Phase-A stub. Added `core/AppLinks.kt` (privacy + support-mailto constants). Compile-checked green (`android-build`). Visual run = user. |
