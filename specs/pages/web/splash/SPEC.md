# Page: `splash` (web) — the public entry / welcome screen

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.2.1 · **App:** `web` (Next.js App Router)
> **Route:** `/splash`. As of v0.2.1 the root `/` serves the **marketing landing page**
> (`src/components/landing/`), not this screen; `/splash` is **retained but unlinked** (reachable by
> direct URL only), so its typewriter intro is preserved, just no longer the default entry.
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/splash/page.tsx` (+ `components/BrandMark.tsx`).
> **Consumes (features):** [`auth`](../../../features/auth/SPEC.md) (the foundation `useAuth` context —
> `session` + `isBootstrapping`; no API call).
> **Cross-app:** iOS `SplashView.swift` (`Features/Onboarding/`) — same copy + typewriter intent, but a
> **placeholder** brand icon and **no** authenticated→programs redirect (D-REF; F1, F3, F4).
> **Stance:** faithful 1:1 (D-S1) **+ ONE deliberate cross-app addition** — tap/click anywhere fast-forwards
> the intro to its final state (D-SKIP; mirrors iOS). Oddities flagged §10. **First web page spec.**

---

## 1. What it is + who uses it

The **public welcome screen**. Historically the first thing an unauthenticated visitor saw (the root `/`
redirected here); as of v0.2.1 the root `/` serves the marketing landing page instead and this screen is
kept but unlinked (direct-URL only). It plays a short typewriter intro, shows the RaSi Fiters brand logo, and reveals a single **"Sign
in"** call-to-action that routes to `/login`. Used by **everyone pre-auth**; an already-authenticated visitor
is immediately redirected away to `/programs` and never sees it.

## 2. Why it exists

A branded landing/transition surface that (a) greets new/returning visitors, (b) funnels them into the auth
path (`/login`), and (c) short-circuits signed-in users straight to their programs hub. It is the entry point
of the public/auth path (splash → login → create-account) that proves auth end-to-end on the new stack.

## 3. Route / location

- **App:** `web`. **Route:** `/splash`. **Public** (no auth required; not in the `middleware.ts` matcher).
- **Reached via:** direct URL only (as of v0.2.1). The root route `/` no longer redirects here — it
  renders the marketing landing page (`src/app/page.tsx` → `Landing`). Previously `/` → `redirect("/splash")`.
- **Leaves to:** `/login` (the Sign-in CTA) · `/programs` (auto-redirect when a session already exists).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Headline (typewriter) | "Hi, welcome to RaSi Fiters" typed char-by-char (42 ms/char); dims to muted once complete. | splash/page.tsx:70-79 |
| Subheadline (typewriter) | "Track your fitness journey by logging workouts and monitoring your progress!" typed after a 350 ms beat. | splash/page.tsx:80-82 |
| Brand logo | `BrandMark` (size 150) — `app-icon.png` in a rounded circle, centered. | splash/page.tsx:86-88; `BrandMark.tsx` |
| Sign-in CTA | A `next/link` → `/login`, framer-motion fade-in, appears only after the full intro (~3.5 s). | splash/page.tsx:90-104 |
| Tap-to-skip (D-SKIP) | `onClick` on the root container instantly snaps both sentences to full + reveals the CTA (`skipRef` + `skip()`); no-op once the CTA is visible, so the Sign-in link still navigates normally. **Not in legacy** — deliberate addition. | `apps/web/src/app/splash/page.tsx` |

**Animation sequence** (splash/page.tsx:48-57):
type headline → mark complete → 350 ms → type subheadline → 280 ms → reveal CTA. Driven by an on-mount
`useEffect` (deps `[]`), cleaned up via an `isMounted` flag. A `skipRef` short-circuits the typewriter loop
and the inter-phase beats when the user taps (D-SKIP), and is reset on each mount so a remount replays it.

## 5. Components + features consumed

- **Components:** `BrandMark` (`src/components/BrandMark.tsx` — `next/image` of `/brand/app-icon.png`),
  `framer-motion` (`motion.h1`, `motion.div` fades), `next/link`, `next/navigation` `useRouter`.
- **Features:** [`auth`](../../../features/auth/SPEC.md) only — via the foundation `useAuth()` hook
  (`session`, `isBootstrapping`). **No backend API call** is made by this page.

## 6. Data / API

**None.** No fetch, no endpoint. The only external state is the in-memory auth `session` from the
`AuthProvider` (hydrated from `localStorage` during bootstrap). The redirect decision reads `session` +
`isBootstrapping`; nothing is written.

## 7. Role-based view rules

**N/A — public, pre-auth.** There is no authenticated user (hence no role) when the splash renders. The only
role-adjacent behavior is uniform across **every** role:

| Viewer | Sees | Can do |
|--------|------|--------|
| Unauthenticated (any visitor) | Full splash: intro + logo + Sign-in CTA. | Tap **Sign in** → `/login`. |
| Any authenticated role (global_admin · program admin · logger · member) | Nothing meaningful — redirected to `/programs` after bootstrap (may briefly glimpse the intro starting, see F2). | (auto-redirect only) |

`admin_only_data_entry` is irrelevant here (no data entry on this page).

## 8. States & edge cases

- **Bootstrapping:** the typewriter starts immediately on mount; the redirect effect waits for
  `!isBootstrapping`. There is **no loading gate** — a returning authenticated user can briefly see the intro
  begin before the redirect fires (F2).
- **Authenticated:** `router.replace("/programs")` (replace, not push — splash leaves no history entry).
- **Unauthenticated:** the normal path; CTA appears after the full sequence.
- **Re-mount / fast nav-away:** the `isMounted` cleanup flag stops the async typewriter from setting state
  after unmount; the on-mount effect also resets `skipRef` so the intro replays fresh.
- **Tap during intro (D-SKIP):** clicking anywhere while the text is still typing sets `skipRef`, fills both
  sentences to full, and reveals the CTA at once. Taps after the CTA is visible are no-ops (`skip()` early-
  returns) — the Sign-in link handles its own click.
- **No empty/error states** — the page makes no request and cannot fail.
- **Forward dependency:** the `/programs` redirect target and the `/login` CTA target are **not built yet**
  (this is the first page of the auth path); they land in subsequent page ports.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `rasifiters-webapp/src/app/splash/page.tsx` (+ `BrandMark.tsx`). `consumed_by = [web]`** (this is the web page spec). **Cross-app divergence:** iOS `SplashView.swift` renders a placeholder icon (orange circle + `chart.bar.fill`) and has no authenticated→programs redirect; web wins on the brand mark (keeps the real logo) — the iOS placeholder is flagged as a defect to reconcile at the iOS splash port (F3). | `splash/page.tsx`; iOS `SplashView.swift:113-128, 86-93`; user answers (faithful; flag iOS placeholder as a bug). |
| **D-S1** | **Stance = faithful 1:1, no code changes.** Port `splash/page.tsx` + `BrandMark.tsx` verbatim (typewriter timings, BrandMark size 150, redirect-when-authenticated, CTA→`/login`). Oddities recorded as §10 flagged characteristics rather than changed. | `splash/page.tsx`; user answer (faithful as-is). |
| **D-SKIP** | **ONE deliberate addition (not in legacy) — tap/click fast-forwards the intro.** A `skipRef` + `skip()` snap both sentences to full and reveal the CTA on any click of the splash, so an impatient visitor reaches Sign-in without waiting out the ~3.5 s typewriter. Guarded to no-op once the CTA is visible (the Sign-in link keeps its own navigation). Added identically on iOS (D-SKIP there) so the two surfaces stay 1:1. | `apps/web/src/app/splash/page.tsx`; user request (2026-06-30). |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Authenticated→`/programs` redirect is web-only.** The web splash redirects a signed-in visitor to `/programs`; the iOS `SplashView` has no such redirect (iOS routes signed-in users at the app root, not from the splash view). | splash/page.tsx:24-28; iOS `SplashView.swift` (no redirect) | Kept (faithful) — a platform-routing difference, not a bug; no reconciliation needed. |
| **F2** | **No loading gate — brief splash flash for authenticated users.** The typewriter `useEffect` runs on mount unconditionally; the redirect only fires after `!isBootstrapping`, so a returning signed-in user can glimpse the intro start before being redirected. | splash/page.tsx:24-64 | Kept (faithful) — cosmetic flash. A rebuild could gate render on `isBootstrapping`/`session`. |
| **F3** | **iOS splash uses a PLACEHOLDER brand icon (defect to fix on the iOS port).** iOS `SplashView` draws an orange circle + `chart.bar.fill` SF Symbol explicitly accessibility-labeled "Brand icon placeholder" instead of the real `app-icon` asset the web uses. Per the user, this is a **bug to reconcile** when the iOS splash screen is ported — iOS should adopt the real brand asset. | iOS `SplashView.swift:113-128` | **Yes — iOS defect.** Tracked as an open item for the iOS splash port (not a web change). |
| **F4** | **Type-speed divergence (cosmetic).** Web types at 42 ms/char (`sleep(42)`); iOS at 55 ms/char. Same copy, same sequence shape. | splash/page.tsx:44; iOS `SplashView.swift:41` | Kept (faithful) — cosmetic; harmonize only if a unified motion spec is ever defined. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.1 | 2026-07-09 | **Root route repointed off splash.** `/` now serves the new web **marketing landing page** (`src/components/landing/`, rendered by `src/app/page.tsx`); the splash screen is **retained but unlinked** (direct-URL only), so its behavior is unchanged but it is no longer the default entry. Doc-accuracy patch — no change to `splash/page.tsx` itself. `src/app/page.tsx`; `src/app/shell.tsx` (bare passthrough for `/`). |
| 0.2.0 | 2026-06-30 | **Tap-to-skip the intro (D-SKIP).** Clicking anywhere on the splash now instantly fast-forwards the typewriter to its final state (both sentences + Sign-in CTA) via a `skipRef` guard + `skip()` handler on the root container; no-op once the CTA shows so the Sign-in link still navigates. A deliberate cross-app addition (not in the legacy reference), mirrored on iOS. `apps/web/src/app/splash/page.tsx`. |
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` — the **first web page spec**. Documents the public `splash` welcome screen (root `/` → `/splash`): typewriter intro, `BrandMark` logo, Sign-in CTA → `/login`, authenticated→`/programs` redirect. Consumes only `auth` (foundation `useAuth`); no API. Decisions: **D-REF** (`consumed_by = [web]`; iOS `SplashView` divergence — placeholder icon + no redirect; web keeps the real logo, iOS placeholder flagged as a defect) · **D-S1** (faithful 1:1, no code changes). Flagged F1–F4 (web-only auth redirect; no loading gate / splash flash; **iOS placeholder = defect to fix on the iOS port**; type-speed divergence). Role rules N/A (public/pre-auth). Ported `src/app/splash/page.tsx` + `src/components/BrandMark.tsx`. |
