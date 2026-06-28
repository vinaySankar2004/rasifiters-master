# rasifiters — Manifest

The product list + the stitch/build milestone log for the RaSi Fiters rebuild.

## Products

| Product | Stack | Host | Status | Notes |
|---------|-------|------|--------|-------|
| `backend` | Node/Express + Sequelize | Railway | 📄 not built | The shared API. Supabase Postgres + Supabase Auth (proxied). Reference: `../backend`. |
| `web` | Next.js 14 (App Router) + TS | Vercel | 📄 not built | ~33 routes. Reference: `../rasifiters-webapp`. |
| `ios` | SwiftUI (iOS 18.6) | App Store | 📄 not built | Pure SwiftUI, MVVM, widgets + APNs. Reference: `../ios-mobile`. |

Status legend: 📄 documented/planned → 🏗️ rebuilt → 🚀 deployed → ⊘ retired.

## Stitch / build milestone log

_Append one entry per milestone (a feature ported, a product first deployed, the cutover). Newest first._

- **2026-06-28** — ICM repo scaffolded (L1–L5 + 7 skills + hooks). No features documented or built yet.

## Build order (per `ICM.md` / `METHODOLOGY.md`)

1. Migrator (`tools/migrator/`) — DB + auth data into Supabase.
2. `backend` — Supabase wiring + Supabase-JWT auth middleware → Railway.
3. `web` — feature-by-feature (proves auth end-to-end) → Vercel temp domain.
4. `ios` — feature-by-feature.
5. Cutover — `rasifiters.com` + iOS release.
