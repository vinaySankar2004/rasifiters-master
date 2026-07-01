# Screen: `splash` (ios) — the public entry / welcome screen

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.2.0 · **App:** `ios` (SwiftUI)
> **Location:** `AppRootView`'s unauthenticated branch — `NavigationStack { SplashView() }` when
> `programContext.authToken == nil` (`apps/ios/.../App/AppRootView.swift:16-20`).
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Onboarding/SplashView.swift`.
> **Web parity reference:** [`web splash`](../../web/splash/SPEC.md) — same copy + typewriter intent.
> **Consumes (features):** [`auth`](../../../features/auth/SPEC.md) only — implicitly, via the root's
> `programContext.authToken` bifurcation. **No API call.**
> **Cross-app:** web `splash/page.tsx` — same headline/subheadline + typewriter; web uses 42 ms/char + a
> real `BrandMark`, iOS 55 ms/char (F3). **Legacy iOS used a PLACEHOLDER icon — now replaced (D-C1).**
> **Stance:** faithful 1:1 port of the legacy iOS `SplashView` **+ TWO deliberate deviations** — the real
> brand icon (D-C1) and tap-to-skip the intro (D-SKIP, mirrors web). Oddities flagged §10. **First iOS screen spec.**

---

## 1. What it is + who uses it

The **public welcome screen** — the first thing an unauthenticated visitor sees when the app launches
without a stored session. It plays a short typewriter intro (headline then subheadline), shows the RaSi
Fiters brand logo, and reveals a single **"Sign in"** CTA that pushes `LoginView`. Used by **everyone
pre-auth**; a returning signed-in user never sees it — `AppRootView` bifurcates on `authToken` at the
root and shows `ProgramPickerView` instead (the iOS analogue of web's authenticated→`/programs` redirect).

## 2. Why it exists

A branded landing/transition surface that greets new/returning visitors and funnels them into the auth
path (`SplashView → LoginView → CreateAccountView`). It is the entry point of the iOS public/auth flow,
mirroring the web `splash → login → create-account` path proven live on `rasifiters.com`.

## 3. Route / location

- **App:** `ios`. **Shown by:** `AppRootView` when `programContext.authToken == nil`
  (`AppRootView.swift:11-21`), inside a `NavigationStack`.
- **Leaves to:** `LoginView` (the "Sign in" CTA — a `NavigationLink` push).
- **No deep-link / URL route** — it is the unauthenticated root, not a navigable path.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Headline (typewriter) | "Hi, welcome to RaSi Fiters" typed char-by-char (55 ms/char); dims to `secondaryLabel` once complete. | `SplashView.swift:62-69` (legacy); ported `apps/ios/.../Features/Onboarding/SplashView.swift` |
| Subheadline (typewriter) | "Track your fitness journey by logging workouts and monitoring your progress!" typed after a 400 ms beat. | `SplashView.swift:71-74` (legacy) |
| Brand logo | **`BrandMark(size: 120)`** — the real `BrandIcon` asset in a rounded circle (D-C1). **Was** the legacy placeholder (orange circle + `chart.bar.fill`). | legacy placeholder `SplashView.swift:113-128`; new `BrandMark.swift` |
| Sign-in CTA | A `NavigationLink → LoginView()`, capsule-styled, with a `.move(.bottom)+.opacity` transition; appears only after the full intro (~300 ms after the subheadline). | `SplashView.swift:85-102` (legacy) |
| Tap-to-skip (D-SKIP) | `.contentShape(Rectangle())` + `.onTapGesture` on the `ZStack` → `viewModel.skip()` snaps both sentences to full + reveals the CTA (`isSkipped` flag + `skip()`); no-op once the CTA is visible, so the Sign-in `NavigationLink` still pushes normally. **Not in legacy** — deliberate addition. | `apps/ios/.../Features/Onboarding/SplashView.swift` |

**Animation sequence** (`SplashViewModel.start()`, `SplashView.swift:16-39` legacy): type headline →
`isHeadlineComplete` (dims) → 400 ms → type subheadline → 300 ms → reveal CTA. Driven by `.task { await
viewModel.start() }`; the `hasStarted` guard makes it run once. An `isSkipped` flag (checked around each
`Task.sleep` in `type()` and after each `type()` in `start()`) lets a tap short-circuit to the final state
(D-SKIP) with no stray character appended.

## 5. Components + features consumed

- **Components:** **`BrandMark`** (new — `Shared/Components/BrandMark.swift`, the iOS analogue of web's
  `BrandMark.tsx`), `AppGradient.background(for:)`, `adaptiveShadow`, `Color(.label)`/`Color(.secondaryLabel)`.
  All foundation chrome already ported (run 50) **except `BrandMark` + the `BrandIcon` asset (D-DEPS)**.
- **Features:** [`auth`](../../../features/auth/SPEC.md) only — implicitly via the root's `authToken`
  check. **No backend API call** is made by this screen.

## 6. Data / API

**None.** No fetch, no endpoint. The only external state is `programContext.authToken` (read by
`AppRootView`, not by `SplashView` itself). Nothing is written.

## 7. Role-based view rules

**N/A — public, pre-auth.** There is no authenticated user (hence no role) when the splash renders.

| Viewer | Sees | Can do |
|--------|------|--------|
| Unauthenticated (any visitor) | Full splash: intro + logo + Sign-in CTA. | Tap **Sign in** → `LoginView`. |
| Any authenticated role (global_admin · program admin · logger · member) | Nothing — `AppRootView` shows `ProgramPickerView` at the root instead (never reaches `SplashView`). | (root bifurcation only) |

`admin_only_data_entry` is irrelevant here (no data entry; program-scoped lock applied only after a
program is selected).

## 8. States & edge cases

- **Launch / bootstrapping:** the typewriter starts on `.task`; the `hasStarted` guard prevents a re-run.
- **Authenticated:** never shown — `AppRootView`'s `authToken != nil` branch renders `ProgramPickerView`.
  Unlike web (which renders the splash then `router.replace`s, briefly flashing it — web F2), iOS gates at
  the root, so there is **no splash flash** for signed-in users (a platform-routing win, F1).
- **No empty/error states** — the screen makes no request and cannot fail.
- **Tap during intro (D-SKIP):** tapping anywhere while the text is still typing sets `isSkipped`, fills both
  sentences to full, and reveals the CTA in one `withAnimation`. Taps after the CTA is visible are no-ops
  (`skip()` guards on `isCTAVisible`) — the Sign-in `NavigationLink` handles its own tap (child gesture wins).
- **Forward dependency:** the CTA pushes `LoginView` (built this run); `ProgramPickerView` (the authed
  root) remains a deferred stub.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `ios-mobile/.../Features/Onboarding/SplashView.swift`; web parity = [`web splash`](../../web/splash/SPEC.md). `consumed_by = [ios]`** (this is the iOS screen spec). | legacy `SplashView.swift:1-133`; web splash SPEC. |
| **D-S1** | **Stance = faithful 1:1 port of the legacy iOS `SplashView`** — `SplashViewModel` typewriter (55 ms/char, the 400/300 ms beats), the headline-dims-on-complete, the capsule CTA + transition, the `AppGradient` background. Oddities → §10, not changed. | legacy `SplashView.swift`; user answer (match web; faithful iOS layout). |
| **D-C1** | **ONE web-parity deviation — replace the placeholder icon with the real brand mark.** The legacy `iconPlaceholder` (orange `Circle` + `chart.bar.fill`, a11y-labeled "Brand icon placeholder") is replaced by **`BrandMark(size: 120)`** rendering the new `BrandIcon` asset (the same `app-icon` the web `BrandMark` uses). Closes the web-flagged iOS placeholder bug (web splash F3). | web splash F3 (placeholder = defect to fix on iOS port); user answer ("real brand icon"); [[ios-matches-web-not-just-legacy]]. |
| **D-SKIP** | **ONE deliberate addition (not in legacy) — tap fast-forwards the intro.** An `isSkipped` flag + `skip()` on `SplashViewModel` snap both sentences to full and reveal the CTA on any tap of the `ZStack` (`.contentShape(Rectangle())` + `.onTapGesture`), so an impatient user reaches Sign-in without waiting out the ~6.6 s typewriter. `type()` checks `isSkipped` around each `Task.sleep` so no stray character lands; guarded to no-op once `isCTAVisible`. Added identically on web (D-SKIP there) so the two surfaces stay 1:1. | `apps/ios/.../Features/Onboarding/SplashView.swift`; user request (2026-06-30). |
| **D-DEPS** | **One new dependency — `BrandMark.swift` + the `BrandIcon.imageset`.** Built from the existing `AppIcon` PNGs (light `appIcon.png` + dark `appIconDark.png`). Every other chrome leaf was ported in the foundation (run 50). The legacy `Combine`-based `SplashViewModel` ports inline with the screen. | foundation inventory (run 50); `Assets.xcassets/BrandIcon.imageset`. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Authed users never see the splash — root bifurcation, not a redirect.** iOS gates at `AppRootView` (`authToken != nil` → `ProgramPickerView`), so (unlike web's render-then-`router.replace`) there is **no splash flash** for signed-in users. | `AppRootView.swift:11-21` | Kept — a platform-routing win over web F2; no change. |
| **F2** | **Icon size kept at the iOS layout value (120), not web's 150.** The real brand asset matches web; the size stays tuned to the iOS layout (legacy was 120). | `SplashView.swift` `BrandMark(size: 120)`; web `BrandMark size={150}` | Kept (faithful iOS layout) — harmonize only under a unified motion/size spec. |
| **F3** | **Type-speed divergence (cosmetic).** iOS types at 55 ms/char; web at 42 ms/char. Same copy, same sequence shape. | `SplashView.swift:41` (legacy); web `splash/page.tsx:44` | Kept (faithful) — cosmetic. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-06-30 | **Tap-to-skip the intro (D-SKIP).** Tapping anywhere on the splash now instantly fast-forwards the typewriter to its final state (both sentences + Sign-in CTA) via an `isSkipped` flag + `skip()` on `SplashViewModel`, wired to `.contentShape(Rectangle())` + `.onTapGesture` on the `ZStack`; `type()` checks the flag around each `Task.sleep` so no stray character lands, and it no-ops once the CTA shows so the Sign-in link still pushes. A deliberate cross-app addition (not in the legacy reference), mirrored on web. Compile-checked clean via `ios-build` (0 errors). `apps/ios/.../Features/Onboarding/SplashView.swift`. |
| 0.1.0 | 2026-06-30 | Initial SPEC authored via `question-asker` — the **first iOS screen spec**. Documents the public `SplashView` (the unauthenticated `AppRootView` branch): `SplashViewModel` typewriter intro, brand logo, Sign-in CTA → `LoginView`. Consumes only `auth` (root `authToken` bifurcation); no API. Decisions: **D-REF** (`consumed_by=[ios]`; legacy iOS + web parity) · **D-S1** (faithful 1:1 port of the legacy iOS screen) · **D-C1** (ONE web-parity deviation — real `BrandMark` replacing the placeholder, closing web splash F3) · **D-DEPS** (new `BrandMark.swift` + `BrandIcon.imageset`). Flagged F1–F3 (no splash flash — root bifurcation; iOS icon size kept; type-speed divergence). Role rules N/A (public/pre-auth). Ported `apps/ios/.../Features/Onboarding/SplashView.swift` + `Shared/Components/BrandMark.swift` + the `BrandIcon` asset; removed the `SplashView` deferred stub. Build green-check owned by the user (Xcode). |
