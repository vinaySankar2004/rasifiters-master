# rasifiters-master

The **ICM repo** for the RaSi Fiters rebuild — a faithful 1:1 recreation of the existing app (web + iOS +
shared API) on a new stack: **Supabase** (DB + Auth), **Railway** (API), **Vercel** (web).

Markdown is the source of truth; Claude Code (with Vercel / Railway / Supabase MCPs) is the operator.

## Start here
1. **`ICM.md`** — L1 routing + current state + the build sequence. Read this first.
2. **`METHODOLOGY.md`** — the "why", the decision log, the feature-SPEC contract.
3. **`SETUP.md`** — fresh-clone bootstrap (MCP OAuth, env).
4. **`CLAUDE.md`** — project rules (DB write policy, auth model, standards, skills index).

## Layout
```
ICM.md  METHODOLOGY.md  CLAUDE.md  SETUP.md  ENV_RUNBOOK.md  COVERAGE.md
.mcp.json  .claude/{settings.json, hooks/, skills/}
companies/rasifiters/{CONTEXT.md, manifest.md, products/{web,ios,backend}/CONTEXT.md}
features/{REGISTRY.md, registry.json, <feature>/<version>/SPEC.md}
tools/migrator/   (temporary Render-PG → Supabase migrator)
```

The legacy app being rebuilt lives in the parent folder: `../{rasifiters-webapp, ios-mobile, backend}`.

## Skills (`.claude/skills/`)
`question-asker` · `git-version` · `stitch` · `deploy` · `audit` · `supabase` · `health-check`
