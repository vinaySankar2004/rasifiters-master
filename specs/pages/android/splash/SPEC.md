# Screen: `splash` (android) — the public entry / welcome screen

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior is the shared contract in [`ios splash`](../../ios/splash/SPEC.md) +
> [`web splash`](../../web/splash/SPEC.md) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/RootScreen.kt` `AuthGraph` `startDestination` (`SplashScreen`), shown when
> `programContext.authToken == null`. **Consumes:** [`auth`](../../../features/auth/SPEC.md) implicitly
> (root gate) — **no API call.**
> **File:** `apps/android/app/src/main/java/com/app/rasifiters/ui/auth/SplashScreen.kt`.

## Parity + Android-idiom deviations

- **Faithful:** the typewriter intro — headline "Hi, welcome to RaSi Fiters" then subheadline
  "Track your fitness journey by logging workouts and monitoring your progress!" at **55 ms/char** (matches
  iOS), headline dims on complete, then the single **"Sign in"** CTA reveals (400 ms / 300 ms beats). Real
  brand mark (`BrandMark(120)`, `brand_icon(_dark).png`) — the placeholder is not carried over (iOS D-C1).
  **Tap-to-skip (D-SKIP)** fast-forwards to the final state; a `skipped` flag re-read each tick guarantees no
  stray character (matches iOS/web).
- **Deviation A-1 (idiom):** the typewriter runs in a `LaunchedEffect(Unit)` with `kotlinx.coroutines.delay`
  (the Compose analog of the iOS `SplashViewModel` `Task.sleep` loop); tap-to-skip via `detectTapGestures`.
- **Deviation A-2 (idiom):** CTA reveal uses `AnimatedVisibility(slideInVertically + fadeIn)` (Compose) vs the
  SwiftUI `.move(.bottom)+.opacity` transition. Capsule CTA = `PillButton` (onBackground-filled `CircleShape`).
- **F1 (parity win, kept):** authed users never see the splash — the root gate (`RootScreen`) swaps to the app
  shell on a non-null token, so there's no splash flash (same as iOS F1; better than web F2).

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-08 | Initial Android port (Phase B). `SplashScreen` composable — typewriter intro + brand mark + Sign-in CTA + tap-to-skip, wired into `AuthGraph`, replacing the Phase-A stub. Compile-checked green (`android-build`, `:app:assembleDebug`). Visual run = user (Pixel 8 emulator). |
