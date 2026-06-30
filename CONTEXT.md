# RaSi Fiters — Project Context (L2)

RaSi Fiters — a fitness-program tracker. Members join Programs; per-program roles (admin / logger /
member) gate what they can do. Members log workouts and daily health metrics; the app surfaces analytics,
streaks, leaderboards, and sends push notifications. Two clients (`web`, `ios`) share one `backend` API.

This is the **ICM rebuild** of the existing app — a faithful 1:1 recreation on a new stack. The reference
implementation is the legacy app at `../{rasifiters-webapp, ios-mobile, backend}`. Per-app detail lives in
`apps/{web,ios,backend}/CONTEXT.md`.

## Brand
- Name: **RaSi Fiters**
- Domain: **rasifiters.com** (currently served by the legacy stack; switched to the new Vercel project at
  cutover).
- Accent: carry from the legacy app during the page-by-page rebuild (web uses Tailwind `rf-*` CSS vars;
  iOS uses `AppTheme`). _Record exact values in `apps/*/CONTEXT.md` as confirmed._
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
- **API (`backend`) → Render** — web service `rasifiters-api` (`srv-d90tgmv7f7vs73cudptg`),
  **LIVE** at `https://rasifiters-api.onrender.com` via Blueprint (`apps/backend/render.yaml`, GitHub
  auto-deploy). A **new** service; the legacy backend also ran on Render. `/api/auth` deployed + verified
  end-to-end 2026-06-28.
- **Web → Vercel** — project `rasifiters` (`prj_Eqd5XmbgXDkRRhKJPASBOcIqKF6u`), team `personal-vinayak`.
  **LIVE** at `https://rasifiters.com` (apex 308→`www`), git auto-deploy on `main`. Deployed + domain
  cutover 2026-06-29. (The old legacy webapp project `rasi-fiters` was retired off the domain.)
- **iOS** — App Store / TestFlight; bundle id `com.vinayaksankaranarayanan.RaSi-Fiters-App` (legacy).
- **Push** — Apple Push Notification service (APNs), keys carried from the legacy backend (`APNS_*`).

## Migration source
- Legacy DB: Postgres on **Render** (`rasi_fiters_db`). The temporary `tools/migrator/` reads from it and
  writes the new Supabase project once (then re-runnable sync until cutover). See `tools/migrator/README.md`.

## Apps
See `apps/{web,ios,backend}/CONTEXT.md` and the build order in `PROGRESS.md`. `web` and `ios` both consume
`backend`.
