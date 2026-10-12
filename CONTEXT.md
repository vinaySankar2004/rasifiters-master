# RaSi Fiters — Project Context (L2)

RaSi Fiters — a fitness-program tracker. Members join Programs; per-program roles (admin / logger /
member) gate what they can do. Members log workouts and daily health metrics; the app surfaces analytics,
streaks, leaderboards, and sends push notifications. Three clients (`web`, `ios`, `android`) share one `backend` API.

This is the **ICM rebuild** of the original app — a faithful 1:1 recreation on a new stack, now complete
and standalone (the original app it was ported from is archived, not tracked here). Per-app detail lives in
`apps/{web,ios,android,backend}/CONTEXT.md`.

## Brand
- Name: **RaSi Fiters**
- Domain: **rasifiters.com** (served by the new Vercel project since cutover 2026-06-29).
- Accent: carried from the original app (web uses Tailwind `rf-*` CSS vars; iOS uses `AppTheme`).
  Exact values recorded in `apps/*/CONTEXT.md`.
- Support / legal: `rasifiters.com/{support,privacy-policy,delete-account}` (public pages; the last two are
  linked from both store listings).
- Store listings: [App Store](https://apps.apple.com/ca/app/rasi-fiters/id6758078961) ·
  [Google Play](https://play.google.com/store/apps/details?id=com.app.rasifiters). The web app links both
  from the landing badges (`apps/web/src/components/landing/content.ts` holds the URLs once).

## Infrastructure (all four surfaces provisioned, LIVE + public — Supabase + Render 2026-06-28, Vercel web 2026-06-29, App Store 2026-07-15, Play Store 2026-08-06)
- **Supabase** — one project (DB + Auth + object storage). Org **RaSi Fiters** (`lxehyprifvuozciizlem`),
  project **rasifiters**, `project_ref` **`kpadxjekpiwfkqcxtrio`**, region `us-east-1`, status
  ACTIVE_HEALTHY. `SUPABASE_URL` = `https://kpadxjekpiwfkqcxtrio.supabase.co`. Filled into `.mcp.json`
  (`supabase-rasifiters`) + the `ICM.md` table. Secrets (DB password, keys, DATABASE_URL forms) live in the
  user's password manager — **never committed** (see `ENV_RUNBOOK.md`).
  - **Schema** migrated faithfully from the legacy Render Postgres — **same table names, NO prefix** (R5).
    Migrations live in `apps/backend/sql/`, reviewed/run by the user (never direct SQL from Claude).
  - **Auth** = Supabase Auth; the Express backend proxies it + verifies its JWTs (R1).
  - **Object storage** = Supabase Storage (only if/when needed; the legacy app has no blobs today).
- **API (`backend`) → Render** — web service `rasifiters-api`, **LIVE** at
  `https://rasifiters-api.onrender.com` via Blueprint (`apps/backend/render.yaml`, GitHub auto-deploy).
  A **new** service; the legacy backend also ran on Render (its service `RaSi_Fiters_API` was **suspended
  2026-10-11** — 1 request in 30 days; reversible, delete after a quiet month). `/api/auth` deployed + verified
  end-to-end 2026-06-28. (Service ID + deploy detail: canonical home `apps/backend/CONTEXT.md`.)
- **Staging** (reliability-overhaul Phase 2 B, DESIGN_BOARD §8) — Render **free** service `rasifiters-api-staging`
  (`https://rasifiters-api-staging.onrender.com`, branch `staging`; wake before use) → the `staging` Postgres schema in
  the same Supabase project (role `rasifiters_staging`; **shared `auth.users`**, guarded — auth SPEC D-C13) + the
  Vercel branch alias `https://rasifiters-git-staging-personal-vinayak.vercel.app`. Opt-in, for risky changes only:
  the iOS `RaSi-Fiters-App-Staging` scheme + the Android `staging` build type point at it; every other build (incl.
  Android `debug`) + `rasifiters.com` stay on prod. Detail: `apps/backend/CONTEXT.md` §Staging, `ENV_RUNBOOK.md`
  §Staging.
- **Auth email → Resend** (LIVE 2026-10-12; domain `auth.rasifiters.com` verified, DNS in Vercel; sender
  `RaSi Fiters <no-reply@auth.rasifiters.com>`) — Supabase Auth sends password-reset mail through custom SMTP.
  Setup, values + status: `ENV_RUNBOOK.md` §7b.
- **Web → Vercel** — project `rasifiters`, **LIVE** at `https://rasifiters.com` (canonical host = apex;
  `www`→apex 308 — see `apps/web/CONTEXT.md` §SEO), git
  auto-deploy on `main`. Deployed + domain cutover 2026-06-29 (the old legacy project was retired off the
  domain). (Project/team IDs + deploy detail: canonical home `apps/web/CONTEXT.md`.)
- **iOS** — **LIVE on the App Store** (+ TestFlight); bundle id `com.app.rasifiters` (build target + APNs topic).
- **Android** — **LIVE on the public Google Play Store** (production since 2026-08-06); applicationId
  `com.app.rasifiters`. Play App Signing + a Firebase project (`rasi-fiters`) for FCM. Per-channel binary
  versions: `RELEASES.md` (the SoT).
- **Push** — **APNs** (iOS) + **FCM** (Android), both fired by the backend's `sendPushToMembers`. APNs
  provisioned 2026-06-30 (token-based `.p8` Auth Key, Key ID `RA353TA52W`, Team `VSTTF2AM22`, `APNS_*` on
  Render); FCM provisioned 2026-07-08 (`FIREBASE_SERVICE_ACCOUNT` base64 secret on Render). Both live.

## Migration source (historical)
- The original data lived in Postgres on **Render** (`rasi_fiters_db`) and was migrated once into the
  Supabase project at cutover (2026-06-28). The one-time migrator has since been removed.

## Apps
See `apps/{web,ios,android,backend}/CONTEXT.md` and the build order in `PROGRESS.md`. `web`, `ios`, and
`android` all consume `backend`.
