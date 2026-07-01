# SETUP — bootstrap a fresh clone of rasifiters-master

Goal: a teammate clones this repo and gets a working Claude Code operator environment with a
**one-time browser login per service and nothing else**. There are **no API keys to paste** —
the MCP servers are OAuth-based.

> Stack reminder (`METHODOLOGY.md` R2–R4): the backend is **Node/Express + Sequelize** (not
> Python/FastAPI), the web app is **Next.js 14** on **Vercel**, the API runs on **Render** (Blueprint
> `apps/backend/render.yaml`), and data + auth live on **Supabase**. **All three are provisioned + LIVE
> (2026-06-28/29):** Supabase (`kpadxjekpiwfkqcxtrio`), Render `rasifiters-api`
> (`https://rasifiters-api.onrender.com`), Vercel `rasifiters` (`https://rasifiters.com`).

## 1. Clone

```bash
git clone git@github.com:<your-account>/rasifiters-master.git   # or the HTTPS URL of your fork/clone
cd rasifiters-master
```

## 2. One-time MCP login (the only required setup)

Open Claude Code in this directory. It reads the committed `.mcp.json` and prompts you to
**approve the project MCP servers**. On first use of each, complete the browser OAuth:

| Server | What it is | Scope |
|--------|-----------|-------|
| `vercel` | `https://mcp.vercel.com` | account/team — sees all Vercel projects (the `web` frontend) |
| `render` | `https://mcp.render.com/mcp` | account/workspace — sees all Render services (the `backend` API) |
| `supabase-rasifiters` | `https://mcp.supabase.com/mcp?read_only=true&project_ref=kpadxjekpiwfkqcxtrio` | **read-only**, the RaSi Fiters Supabase project (DB + Auth) |

OAuth is genuinely **once per machine**: Vercel, Render, and Supabase are the *same accounts* —
the three MCP servers only differ by which project/service they scope to.

Equivalent CLI (the committed `.mcp.json` already defines all three, so you normally don't need
these):

```bash
claude mcp add vercel               --transport http https://mcp.vercel.com
claude mcp add render               --transport http https://mcp.render.com/mcp
claude mcp add supabase-rasifiters  --transport http "https://mcp.supabase.com/mcp?read_only=true&project_ref=kpadxjekpiwfkqcxtrio"
```

Verify: ask Claude to run `supabase-rasifiters` `list_tables` — you should see the plain-named
tables (`members`, `programs`, `workout_logs`, …; no prefixes — R5).

## 3. The Supabase `project_ref` (already filled)

The Supabase project is **provisioned + live**; the committed `.mcp.json` already carries the real
`project_ref` **`kpadxjekpiwfkqcxtrio`** (canonical home: `CONTEXT.md` §Infrastructure). Nothing to
fill — it's ready on clone. The ref is **not a secret** (it's in every Supabase URL), so it is committed
in `.mcp.json`. The service-role key and DB password are secrets and live on the platforms, never in
this repo (see `ENV_RUNBOOK.md`).

## 4. Per-app local dev (optional)

> The apps are **provisioned + live** (Vercel `web`, Render `backend`, Supabase DB/Auth). Deploys run
> through Vercel + Render git auto-deploy on `main`; the commands below are for local development only.

Each app has its own env template. Copy and fill, then run:

```bash
# backend — Node/Express + Sequelize (Supabase Postgres + Supabase Auth proxy)
cd apps/backend && cp .env.example .env.local && npm install && npm run dev   # :5001

# web — Next.js 14 App Router
cd apps/web && cp .env.example .env.local && npm install && npm run dev       # :3000

# ios — SwiftUI (open in Xcode; point API base URL at the backend)
open apps/ios/RaSi-Fiters-App.xcodeproj
```

Real `DATABASE_URL` / Supabase keys / APNs creds come from the team (or the Vercel/Render/Supabase
project env — see `ENV_RUNBOOK.md`). All three apps were faithful 1:1 rebuilds of the original app,
documented as SPECs (`specs/features/<feature>/SPEC.md`, `specs/pages/{web,ios}/<page>/SPEC.md`) then
ported directly — there was no assemble/stitch step.

> The backend runs on **port 5001** and web on **3000** — kept for parity with the original. The iOS
> app targets the deployed backend via its configured API base URL; there is no local-only iOS path.

## 5. MCP secrets (future)

If a future server needs an API key, follow `.env.mcp.example`: reference `${KEY}` in
`.mcp.json`, document it in `.env.mcp.example`, and put the real value in `.env.mcp` (gitignored).
Today there are none — `vercel`, `render`, and `supabase-rasifiters` are all OAuth-based.

## 6. Running a working session (where to root it)

**Always launch Claude Code rooted at `rasifiters-master/`** — never the parent `RaSi-Fiters/`.
MCP servers + permission rules resolve from the project root + its ancestors only (never from
subdirectories), so:
- rooted at `rasifiters-master/` → you get the scoped `vercel` / `render` / `supabase-rasifiters`
  servers **and** any deny rules. ✅
- rooted at `RaSi-Fiters/` → you'd get the parent's settings, none of the scoped servers. ❌

The ICM operates entirely from this repo — it is **standalone**. The original app it was rebuilt from is
archived and no longer referenced, so no external directories need to be added to a session; the repo
config stays clean.
