# Screen: `login` (android) — the public sign-in screen + entry to auth-recovery

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.7.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios login`](../../ios/login/SPEC.md) +
> [`web login`](../../web/login/SPEC.md) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/RootScreen.kt` `AuthGraph` route `Routes.LOGIN` (`LoginScreen`), pushed from splash.
> **Consumes:** [`auth`](../../../features/auth/SPEC.md) — `ProgramContext.login()` → `POST /auth/login/app`.
> **File:** `apps/android/app/src/main/java/com/app/rasifiters/ui/auth/LoginScreen.kt`.

## Parity + Android-idiom deviations

- **Faithful:** single **"Username or Email"** identifier + password with Show/Hide; **"Login"** CTA disabled
  while `identifier.isEmpty() || password.isEmpty()` and shows a spinner while loading; heading "Welcome Back" /
  "Login to access your fitness dashboard"; **"Forgot your password?"** → native `ForgotPasswordScreen`;
  **"New here? Create an account"** → `CreateAccountScreen`; footer "Training hard? …" + **Privacy Policy** link;
  real `BrandMark(90)`. Auth error → a native dialog titled **"Login"** (iOS `Alert` analog).
- **Deviation A-1 (endpoint):** login goes through **`POST /auth/login/app`** (the mobile variant carrying
  `member_id` + accepting `push_token`/`device_id`), not iOS/web's `/auth/login/global`. Chosen for the mobile
  surface (Phase A `ProgramContext.login`). Same session outcome; identity self-heals via `GET /auth/me`.
- **Deviation A-2 (idiom):** no explicit navigate-on-success — a successful `login()` flips
  `programContext.authToken`, so the root gate swaps to the app shell (structural mirror of iOS F4's root swap;
  the redundant `navigateToProgramPicker` push is simply not ported).
- **Deviation A-3 (idiom):** error surfaced via Material3 `AlertDialog`; recovery/create-account/privacy are
  `TextButton`s (`onSurface`/`AppOrange`); Privacy Policy opens in the browser via `LocalUriHandler`.
- **Deviation A-4 (social sign-in, v0.7.0):** below the Login CTA an **"or" divider** + **Continue with Google**
  button (`GoogleSignInButton`, a bordered pill in `GoogleCredential.kt`). On tap it runs **Credential Manager**
  (`GetGoogleIdOption(serverClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID, filterByAuthorizedAccounts=false)`),
  extracts the Google `id_token`, and calls `ProgramContext.socialSignIn(idToken)` → `POST /auth/oauth`. An
  **existing member** logs straight in (the root gate flips, no navigate — A-2). A **brand-new social user**
  returns `needs_profile`; `socialSignIn` stashes the pending session in `pendingSocial` and the screen navigates
  to `create-account`, which renders its 2-step social branch (see create-account A-7). A user-cancelled
  account-picker sheet is silent; any real failure surfaces in the existing "Login" error dialog.
- **F1–F5 (kept, from iOS/web):** role from response body not a JWT decode; no client rate-limit; no inline
  field validation (identifier is dual-purpose); recovery *request* is native, set-new-password stays on web.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.7.0 | 2026-07-10 | **Continue with Google.** Added an "or" divider + `GoogleSignInButton` (Credential Manager → Google `id_token` → `ProgramContext.socialSignIn` → `POST /auth/oauth`); existing member logs in via the root-gate flip, a `needs_profile` result routes to the create-account social wizard (A-4). Compile-checked green (`:app:assembleDebug`). USER fills `GOOGLE_WEB_CLIENT_ID` in `build.gradle.kts`. |
| 0.1.1 | 2026-07-08 | UI polish (user visual review): shared compact field kit (`AppTextField`, 50dp/14dp), slimmer `PillButton` (48dp), centered `AuthScaffold`, tightened spacing. Verified live against the Render backend. |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase B). `LoginScreen` composable → `ProgramContext.login()` (`POST /auth/login/app`), forgot-password + create-account nav, Privacy link, error dialog. Replaced the Phase-A stub. Compile-checked green (`android-build`). Visual run = user. |
