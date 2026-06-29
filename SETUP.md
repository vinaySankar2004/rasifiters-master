# SETUP — bootstrap a fresh clone of rasifiters-master

Goal: a teammate clones this repo and gets a working Claude Code operator environment with a
**one-time browser login per service and nothing else**. There are **no API keys to paste** —
the MCP servers are OAuth-based.

> Stack reminder (`METHODOLOGY.md` R2–R4): the backend is **Node/Express + Sequelize** (not
> Python/FastAPI), the web app is **Next.js 14** on **Vercel**, the API runs on **Render** (Blueprint
> `apps/backend/render.yaml`), and data + auth live on **Supabase**. Supabase is provisioned; Render +
> Vercel are still `TODO(provision)`.

## 1. Clone

```bash
git clone git@github.com:<TODO(provision):org>/rasifiters-master.git
cd rasifiters-master
```

## 2. One-time MCP login (the only required setup)

Open Claude Code in this directory. It reads the committed `.mcp.json` and prompts you to
**approve the project MCP servers**. On first use of each, complete the browser OAuth:

| Server | What it is | Scope |
|--------|-----------|-------|
| `vercel` | `https://mcp.vercel.com` | account/team — sees all Vercel projects (the `web` frontend) |
| `render` | `https://mcp.render.com/mcp` | account/workspace — sees all Render services (the `backend` API) |
| `supabase-rasifiters` | `https://mcp.supabase.com/mcp?read_only=true&project_ref=<TODO(provision):RASIFITERS_PROJECT_REF>` | **read-only**, the RaSi Fiters Supabase project (DB + Auth) |

OAuth is genuinely **once per machine**: Vercel, Render, and Supabase are the *same accounts* —
the three MCP servers only differ by which project/service they scope to.

Equivalent CLI (the committed `.mcp.json` already defines all three, so you normally don't need
these):

```bash
claude mcp add vercel               --transport http https://mcp.vercel.com
claude mcp add render               --transport http https://mcp.render.com/mcp
claude mcp add supabase-rasifiters  --transport http "https://mcp.supabase.com/mcp?read_only=true&project_ref=<TODO(provision):RASIFITERS_PROJECT_REF>"
```

Verify: ask Claude to run `supabase-rasifiters` `list_tables` — once the project exists you should
see the legacy plain-named tables (`members`, `programs`, `workout_logs`, …; no prefixes — R5).

## 3. Filling the Supabase `project_ref` placeholder (one-time, after provisioning)

The Supabase project is **not created yet** (`METHODOLOGY.md` R4). The committed `.mcp.json` ships
with a placeholder `project_ref`. Once the "RaSi Fiters" Supabase project exists:

1. Get the ref from the Supabase dashboard → project → **Settings → General → Reference ID** (the
   `xxxxxxxxxxxxxxxxxxxx` slug, also visible in the project URL `https://<ref>.supabase.co`).
2. Replace `<TODO(provision):RASIFITERS_PROJECT_REF>` in `.mcp.json` with that ref (keep
   `read_only=true`).
3. Re-approve / restart the `supabase-rasifiters` MCP server and re-run the `list_tables` verify.

The ref is **not a secret** (it's in every Supabase URL), so it is committed in `.mcp.json`. The
service-role key and DB password are secrets and live on the platforms, never in this repo
(see `ENV_RUNBOOK.md`).

## 4. Per-app dev — DEFERRED (Vercel + Render dev later)

> **Current direction:** dev + preview will be wired to **Vercel** (the `web` frontend) and
> **Render** (the `backend` API, via Blueprint preview environments) when we get there. The commands
> below are kept as an optional local reference only — skip them for now.

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
project env — see `ENV_RUNBOOK.md`). All three apps are reference-faithful rebuilds of the legacy
apps: `question-asker` writes the SPEC (`specs/features/<feature>/SPEC.md` or
`specs/pages/{web,ios}/<page>/SPEC.md`), then the code is **implemented directly as a faithful 1:1
port** from the legacy reference app — there is no assemble/stitch step.

> The legacy backend runs on **port 5001** and the legacy web on **3000** — kept for parity. The iOS
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

The ICM operates entirely from this repo. The **legacy apps** (`../backend`, `../rasifiters-webapp`,
`../ios-mobile`) are the **reference implementations** for the faithful 1:1 rebuild (`METHODOLOGY.md`
R2) — they stay readable from a `rasifiters-master/`-rooted session via either:
- **`.claude/settings.local.json`** → `permissions.additionalDirectories: ["<abs path to RaSi-Fiters>"]`
  (machine-local, gitignored), or
- the flag: `claude --add-dir /Users/<you>/Desktop/RaSi-Fiters`.

Standalone clones (teammates) that don't have the legacy apps as siblings don't need this — the repo
config stays clean either way.
