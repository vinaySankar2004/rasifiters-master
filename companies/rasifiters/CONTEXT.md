# Company: rasifiters (L2)

RaSi Fiters — a fitness-program tracker. Members join Programs; per-program roles (admin / logger /
member) gate what they can do. Members log workouts and daily health metrics; the app surfaces analytics,
streaks, leaderboards, and sends push notifications. Two clients (`web`, `ios`) share one `backend` API.

This is the **ICM rebuild** of the existing app — a faithful 1:1 recreation on a new stack. The reference
implementation is the legacy app at `../{rasifiters-webapp, ios-mobile, backend}`.

## Brand
- Name: **RaSi Fiters**
- Domain: **rasifiters.com** (currently served by the legacy stack; switched to the new Vercel project at
  cutover).
- Accent color: carry from the legacy app during the page-by-page rebuild (web uses Tailwind `rf-*` CSS
  vars; iOS uses `AppTheme`). _Record exact values in the product CONTEXT.md as they're confirmed._
- Support / legal: `rasifiters.com/support`, `rasifiters.com/privacy-policy` (public pages).

## Infrastructure (all `TODO(provision)` — not created yet)
- **Supabase** — one project (DB + Auth + object storage). `project_ref` `TODO(provision)`; fill it into
  `.mcp.json` (`supabase-rasifiters`) + the `ICM.md` routing table once created.
  - **Schema** migrated faithfully from the legacy Render Postgres — **same table names, NO prefix** (R5).
    Migrations live in `products/backend/sql/`, reviewed/run by the user (never direct SQL from Claude).
  - **Auth** = Supabase Auth; the Express backend proxies it + verifies its JWTs (R1).
  - **Object storage** = Supabase Storage (only if/when the app needs blobs; legacy app has none today).
- **API (backend) → Railway** — service `rasifiters-api` (`TODO(provision)`). Replaces the legacy
  Render-hosted Express service.
- **Web → Vercel** — project `rasifiters-web` (`TODO(provision)`), team/scope `TODO(provision)`. Replaces
  the legacy Vercel/Netlify deploy. Runs on a temp domain until the `rasifiters.com` cutover.
- **iOS** — App Store / TestFlight; bundle id `com.vinayaksankaranarayanan.RaSi-Fiters-App` (from legacy).
- **Push** — Apple Push Notification service (APNs), keys carried from the legacy backend (`APNS_*`).

## Migration source
- Legacy DB: Postgres on **Render** (`rasi_fiters_db`). The temporary `tools/migrator/` reads from it and
  writes the new Supabase project once (then re-runnable sync until cutover). See `tools/migrator/README.md`.

## Products
See `manifest.md`. Runs `backend` (Express API), `web` (Next.js), `ios` (SwiftUI) — `web` and `ios` both
consume `backend`.
