# rasifiters-master

The **ICM repo** for RaSi Fiters — a faithful 1:1 rebuild of the original app (web + iOS + shared API) on
a new stack: **Supabase** (DB + Auth), **Render** (API), **Vercel** (web). The rebuild is complete and this
repo stands alone; the original app it was ported from is archived and not tracked here.

Markdown is the source of truth; Claude Code (with Vercel / Render / Supabase MCPs) is the operator.

## Start here
1. **`PROGRESS.md`** — current phase, what's done, the next concrete action. Read this first every session.
2. **`ICM.md`** — L1 map (apps → specs), build sequence, how to operate here.
3. **`METHODOLOGY.md`** — the "why", the decision log, the feature- and page-spec contracts.
4. **`SETUP.md`** — fresh-clone bootstrap (MCP OAuth, env). · **`CLAUDE.md`** — project rules.

## Layout
```
PROGRESS.md  PROGRESS_ARCHIVE.md  ICM.md  METHODOLOGY.md  CLAUDE.md  SETUP.md  ENV_RUNBOOK.md  COVERAGE.md
CONTEXT.md                                  (project: brand + infra + migration source)
.mcp.json  .claude/{settings.json, hooks/, skills/}
apps/{web,ios,backend}/CONTEXT.md
specs/features/{REGISTRY.md, registry.json, <feature>/SPEC.md}
specs/pages/{web,ios}/<page>/SPEC.md
```

## Skills (`.claude/skills/`)
`question-asker` · `git-version` · `deploy` · `audit` · `supabase` · `health-check`
