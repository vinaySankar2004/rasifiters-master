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
- Support / legal: `rasifiters.com/support`, `rasifiters.com/privacy-policy` (public pages).

## Infrastructure (all provisioned + LIVE: Supabase + Render backend 2026-06-28; Vercel web on `rasifiters.com` 2026-06-29)
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
  A **new** service; the legacy backend also ran on Render. `/api/auth` deployed + verified end-to-end
  2026-06-28. (Service ID + deploy detail: canonical home `apps/backend/CONTEXT.md`.)
- **Web → Vercel** — project `rasifiters`, **LIVE** at `https://rasifiters.com` (apex 308→`www`), git
  auto-deploy on `main`. Deployed + domain cutover 2026-06-29 (the old legacy project was retired off the
  domain). (Project/team IDs + deploy detail: canonical home `apps/web/CONTEXT.md`.)
- **iOS** — App Store / TestFlight; bundle id `com.app.rasifiters` (the build target + APNs topic).
- **Push** — Apple Push Notification service (APNs). **Provisioned 2026-06-30** — fresh token-based Auth
  Key (`.p8`, Key ID `RA353TA52W`, Team `VSTTF2AM22`); `APNS_*` in Render (`sync:false`). iOS push live.

## Migration source (historical)
- The original data lived in Postgres on **Render** (`rasi_fiters_db`) and was migrated once into the
  Supabase project at cutover (2026-06-28). The one-time migrator has since been removed.

## Apps
See `apps/{web,ios,android,backend}/CONTEXT.md` and the build order in `PROGRESS.md`. `web`, `ios`, and
`android` all consume `backend`.
