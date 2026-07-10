# Page: `landing` (web) — the public marketing landing page (root `/`)

> **Status:** 🏗️ built + 🚀 deployed to `rasifiters.com` · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/` (the root). **Public** — not in the `middleware.ts` matcher.
> **Provenance:** **NET-NEW** — not ported from the legacy app. The legacy root `/` only `redirect()`ed to
> `/splash`; this is the ICM's **first net-new web page** (no legacy reference to be faithful to). Replaces
> the splash animation as the default entry; splash is **retained but unlinked** (see
> [splash SPEC](../splash/SPEC.md) v0.2.1).
> **Consumes (features):** [`auth`](../../../features/auth/SPEC.md) — foundation `useAuth` (`session` +
> `isBootstrapping`) for the auth-aware CTA only; **no API call**. No other feature/data dependency.
> **Cross-app:** **web-only** (`consumed_by = [web]`). There is no iOS/Android equivalent — it is a marketing
> web surface. Native apps ship their own splash/onboarding.
> **Stance:** **net-new deliberate design** (D-LAND-1). Theme-aware (inherits `rf-*`), mobile-first, ~90%
> generated in-theme UI (no screenshots). Copy avoids AI-slop patterns (no em dashes; plain + specific).

---

## 1. What it is + who uses it

The **public marketing landing page** — the first thing a logged-out visitor sees at the root of
`rasifiters.com`. It presents what RaSi Fiters is (a group fitness-program tracker), shows the app UI, and
funnels visitors to the store badges or `/login`. Used by **everyone** — it shows to logged-out and
logged-in visitors alike; a logged-in visitor is **not** auto-redirected (unlike the old splash), but their
CTA becomes "Open app" → `/programs` (D-LAND-4).

## 2. Why it exists

To give the app a real, professional marketing front door (replacing the placeholder splash animation at
`/`), covering the product story, feature set, cross-platform availability, and download paths, while staying
1:1 with the app's brand system so it reads as the same product.

## 3. Route / location

- **App:** `web`. **Route:** `/`. **Public** (not in the `middleware.ts` matcher; freely reachable).
- **Renders via:** `src/app/page.tsx` → `<Landing />` (`src/components/landing/Landing.tsx`).
- **Chrome:** bypasses the app shell. `src/app/shell.tsx` early-returns bare children when `pathname === "/"`,
  so the landing owns its own full-bleed background and there is no bottom nav / `NotificationsGate`.
- **Leaves to:** the App Store listing (badge), `/login` (logged-out CTA) / `/programs` (logged-in CTA),
  `#download` (in-page anchor), `/privacy-policy`, `/support`.

## 4. Contents / sections

All section components live under `src/components/landing/`. Copy + constants are centralized in
`content.ts`; there are **two client islands** (`AuthCta`, `Reveal`); everything else is a server component.

| Section | What | Component |
|---------|------|-----------|
| Header (sticky, glass) | BrandMark + wordmark; `Features`/`Analytics` anchors; auth-aware CTA; "Get the app" → `#download`. | `LandingHeader.tsx` |
| Hero | Eyebrow "For your whole group", H1 "Fitness programs, tracked together.", subtitle, `StoreBadges`, hero `AuthCta`, trust line, and a generated Summary dashboard inside a realistic iPhone frame. | `Hero.tsx` · `panels.tsx` (`HeroDashboard`) · `devices.tsx` (`IPhoneFrame`) |
| Feature rows (×3, alternating) | Programs & roles · Workouts & daily health · Auto-sync (Apple Health / Health Connect) + notifications. Each = copy + bullets + a generated phone screen. | `FeatureRows.tsx` · `screens.tsx` (`ProgramsScreen`/`LogScreen`/`SyncScreen`) |
| Analytics highlight | The full Summary dashboard recreated in a browser frame + a 68.2% participation stat callout. | `AnalyticsHighlight.tsx` · `panels.tsx` (`DashboardPreview`) · `frames.tsx` (`BrowserFrame`) |
| Feature grid | Six capability cards (Leaderboards, Streaks & milestones, Participation, Workout-type mix, Invites, Activity timeline). | `FeatureGrid.tsx` |
| Cross-platform | An iPhone (health rings "Today" screen) + a Pixel-style Android (Members/leaderboard) side by side, **equal height**, labelled with the Apple + Android logos. | `CrossPlatform.tsx` · `devices.tsx` (`IPhoneFrame`/`AndroidFrame`) · `screens.tsx` (`HealthRingsScreen`/`StreakScreen`) |
| Final CTA (`#download`) | "Start tracking today." + `StoreBadges` + final `AuthCta`, on an orange-glow band. | `FinalCta.tsx` |
| Footer | BrandMark + wordmark; `Privacy` + `Support` links; © 2026. (No email — the Support page covers contact.) | `LandingFooter.tsx` |

**Generated-UI approach.** ~90% of the imagery is **generated in-theme markup** (not screenshots) that
recreates real app surfaces — the progress radial, stat tiles, activity/distribution bars, the color-coded
workout-types list, health activity rings, program cards, sync toggles, leaderboard. Because it is real
markup on `rf-*` tokens, every panel is crisp and flips light/dark automatically. The **only raster asset**
is the social share image `public/marketing/og-image.png` (1200×630).

**Motion.** `Reveal.tsx` wraps sections in a Framer Motion `whileInView` fade-up (`viewport once`), and
falls back to static render under `prefers-reduced-motion`. Section content is server-rendered (in the SSR
HTML) for SEO; only the entrance transition is client-side.

## 5. Role-based view rules

This is a **public / pre-auth** page, so program roles (global_admin / admin / logger / member) do **not**
apply — it renders outside any program context. The only state gate is **auth state**:

| Viewer | What they see |
|--------|----------------|
| Logged-out (and SSR / first paint) | CTAs read **"Log in"** → `/login`. Store badges + all content shown. |
| Logged-in (`!isBootstrapping && session`) | CTAs read **"Open app"** → `/programs`. **No auto-redirect** — the marketing page still shows. The swap happens only after client bootstrap (mounted guard) to avoid a hydration flash. |

## 6. SEO / metadata

Set in `src/app/layout.tsx` (the landing is the site default since `/` is home): title
`"RaSi Fiters: Fitness programs, tracked together"` (with `%s · RaSi Fiters` template), a real marketing
`description`, and OpenGraph + Twitter cards pointing at `/marketing/og-image.png` (1200×630). `metadataBase`
= `NEXT_PUBLIC_APP_URL ?? https://rasifiters.com`; `robots: index, follow`.

## 7. Decisions (D-rules)

| # | Decision | Where |
|---|----------|-------|
| **D-LAND-1** | **Net-new page; `/` serves the landing, splash retained but unlinked.** `page.tsx` renders `<Landing/>` instead of `redirect("/splash")`; `shell.tsx` bare-passthrough for `/`. Splash kept (direct-URL only), not deleted. | `page.tsx`; `shell.tsx`; splash SPEC v0.2.1 |
| **D-LAND-2** | **~90% generated in-theme UI panels, not screenshots** — theme-aware + crisp. Only raster asset is the OG image. | `panels.tsx`; `screens.tsx`; `devices.tsx` |
| **D-LAND-3** | **Store badges:** App Store links live (`.../app/rasi-fiters/id6758078961`); Google Play is a non-interactive "Coming soon" pill (Android unreleased). Only the badge signals "coming"; Android is otherwise presented as a full platform. | `StoreBadges.tsx`; user (2026-07-09) |
| **D-LAND-4** | **Auth-aware CTA, no auto-redirect.** Logged-out → Log in (`/login`); logged-in → Open app (`/programs`). Mounted guard prevents hydration mismatch. | `AuthCta.tsx` |
| **D-LAND-5** | **Theme-aware, dark-first.** Inherits `rf-*` / `data-theme`; follows the visitor's system/theme preference like the app. | all landing components |
| **D-LAND-6** | **Realistic device frames.** iPhone = Dynamic Island + side buttons; Pixel = center punch-hole + right buttons; the two cross-platform phones are held to **equal height** via a flex-stretch chain; labelled with the Apple + Android glyphs. | `devices.tsx`; `CrossPlatform.tsx`; user (2026-07-09) |
| **D-LAND-7** | **Program status colors mirror the app's `StatusBadge`:** active → accent (orange), completed → success (green), planned → info (blue); progress bars color-matched. | `screens.tsx`; `components/ui/StatusBadge.tsx` |
| **D-LAND-8** | **Copy hygiene.** No em dashes; plain, specific, benefit-led wording (AI-slop patterns avoided). Platform mentions kept to the cross-platform section + store badges, not repeated across every section. | `content.ts`; user (2026-07-09) |

## 8. Open items / flags

- **F-LAND-1** — The generated dashboards use **illustrative sample numbers** (e.g. 31% progress, 68.2%
  participation, a sample leaderboard), by design — the landing makes no API call.
- **F-LAND-2** — `Reveal` sets `opacity:0` via Framer on hydration; content is present in the SSR HTML so
  crawlers (which execute JS) see it, and `prefers-reduced-motion` renders it statically. Standard pattern,
  noted for awareness.
- **F-LAND-3** — When Android ships to Google Play, flip the Play badge from "Coming soon" to a live link
  (`StoreBadges.tsx`, `playStoreComingSoon`).

## 9. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-09 | Initial SPEC + build + deploy — **first net-new web page** (no legacy reference). Public marketing landing at `/` replacing the splash redirect (splash retained, unlinked). Sections: sticky header, hero (Summary dashboard in an iPhone frame), 3 feature rows, analytics highlight (browser frame), feature grid, cross-platform (equal-height iPhone + Pixel), final CTA, footer. ~90% generated in-theme UI (no screenshots) that adapts to light/dark; realistic iPhone (Dynamic Island) + Pixel (punch-hole) device frames; App Store badge live + Google Play "Coming soon"; auth-aware CTA (Log in / Open app, no forced redirect); upgraded SEO metadata + 1200×630 OG image. Decisions D-LAND-1…8. Consumes only `auth` foundation (`useAuth`); no API. `src/app/page.tsx`, `src/app/shell.tsx`, `src/app/layout.tsx`, `src/components/landing/**`, `public/marketing/og-image.png`. |
