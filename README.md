# rasifiters-master

The **ICM repo** for RaSi Fiters — a faithful 1:1 rebuild of the original app (web + iOS + shared API) on
a new stack: **Supabase** (DB + Auth), **Render** (API), **Vercel** (web). The rebuild is complete and this
repo stands alone; the original app it was ported from is archived and not tracked here.

Markdown is the source of truth; Claude Code (with Vercel / Render / Supabase MCPs) is the operator.

## Start here
1. **`PROGRESS.md`** — current phase, what's done, the next concrete action. Read this first every session.
2. **`ICM.md`** — L1 map (apps → specs), build sequence, how to operate here.
3. **`METHODOLOGY.md`** — the "why", the decision log, the feature- and page-spec contracts.
4. **`CLAUDE.md`** — project rules. · **`ENV_RUNBOOK.md`** — env var inventory + how to inspect/change.

## Layout
```
PROGRESS.md  PROGRESS_ARCHIVE.md  ICM.md  METHODOLOGY.md  CLAUDE.md  ENV_RUNBOOK.md  COVERAGE.md
CONTEXT.md                                  (project: brand + infra + migration source)
.mcp.json  .claude/{settings.json, hooks/, skills/}
apps/{web,ios,backend}/CONTEXT.md
specs/features/{REGISTRY.md, registry.json, <feature>/SPEC.md}
specs/pages/{web,ios}/<page>/SPEC.md
```

## Skills (`.claude/skills/`)
`question-asker` · `git-version` · `deploy` · `audit` · `supabase` · `health-check` · `ios-build`
