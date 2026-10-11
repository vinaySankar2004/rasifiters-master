# Reliability overhaul — rolling handoff

> **Volatile — current state only.** Overwrite "Now" + "Next action" at every milestone. When resuming after
> a compaction or in a new session, read `PROGRESS.md` → [`BRIEF.md`](BRIEF.md) → this file, then continue.
> Durable outcomes move to their canonical homes (SPEC §9 D-rules, `METHODOLOGY.md` R-entries); the session
> log below is one line per session.

## Now

- **Phase:** Session 1 (2026-10-11). **Step 0 ✅** → **Phase 0 discovery ✅** (all 7 briefs in + verified;
  index + corrections: [`discovery/README.md`](discovery/README.md)) → **walkthrough with the user, one
  workstream at a time** (W1 → W7; W5 includes the live logcat capture). Then Phase 1 board.
- **In flight:** nothing. **Walkthrough position:** not started (begin at W1).
- **Two out-of-scope security fixes offered as task chips (user decides; not part of the board):**
  (1) cross-user refresh-token leak — backend refreshes on the shared Supabase client, auth-js 2.108.2
  dedups concurrent refreshes across callers (`authService.js:158`); fix = per-request client.
  (2) `/api/analytics*` lacks program-membership checks.
- **Briefs in + orchestrator-verified (key claims re-read in code):** W1–W7 (`discovery/`). W1 headline:
  logouts = iOS refresh-token reuse kills (138 reuse events / 90 d; one user 21 killed sessions) driven by
  iOS refresh storms (~90 % of 8.8k refresh tokens in 30 d issued < 60 s after the previous) + backend maps
  every refresh error (incl. Supabase 429s on Render's single IP) to 401 + Android signs out on any refresh
  failure; logout is `global` scope (kills all the user's devices).
  W6: refresh proxy maps **every** Supabase refresh error to 401 (`authService.js:159`) — incl. the
  `refresh_token_already_used` (S1) + 429 rate-limit errors seen in auth logs 10-06; 401 = 20.0% of requests
  10-04→10-10; SQL-only logs carry PII (`config/database.js:13`), 7-day retention.
  **Out-of-scope security finding (verified):** `/api/analytics*` routes check sign-in only, not program
  membership, and return member names (`routes/analytics.js:13`, `analyticsService.js:151`) — flagged to
  the user as a separate task chip; not part of this initiative.
  W5: "No credentials available" is Android's own Credential Manager text (Play services returned zero
  accounts) — shipped client ID + signing SHA-1 are correct; button uses `GetGoogleIdOption` with no
  `GetSignInWithGoogleOption` fallback (`GoogleCredential.kt:73`). **Root cause unproven** — the failing tap
  rotated out of logcat; the live-capture recipe is in the brief §9 (run it WITH the user: they tap, we read).
  W3 correction from the re-run query: member `d57dad74` had **111** (not 69) old `workout_logs` rows
  rewritten in one minute on 2026-09-23 — the only bulk workout-update path is the `on_duplicate:"sum"`
  branch (`logService.js:196`), so **workout double-counting in prod is confirmed** (iOS).
  Headline so far: **Android cannot see or accept invites at all** — `POST /invite` writes only
  `program_invites` (`inviteService.js:64`); web/iOS read `/my-invites`; Android filters `GET /programs` for
  `myStatus == "invited"` (`ProgramActionsSheet.kt:83`, `ProgramPickerScreen.kt:115`) and accepts via
  `PUT /program-memberships` (`ProgramContext.kt:385`) → 404 "Membership not found"
  (`membershipService.js:201`). W4: no Android background sync (S3 ✅); 14-day look-back loses data after
  2 weeks unopened; 409s are by-design POST→409→PUT for sleep/steps. W7: errors render as empty data on all
  surfaces; no retry/offline/cache anywhere.
- **Blocked on the user:** nothing. **Restart the session once** so `.mcp.json`'s new Supabase header takes
  effect (the MCP showed "needs auth" in Session 1).
- **Step 0 outcome (proven with read-only calls 2026-10-11):**
  - **Render** — MCP header auth works; single workspace `tea-cv3u7a3tq21c73ald2ig` (pass `workspaceId`).
    `list_logs` returns app logs (Sequelize SQL only) — **zero request logs in 7 days** (plan limit).
  - **Supabase** — the hosted MCP **accepts the read-only PAT as a Bearer header** (13 tools incl. new
    `query_logs`); `.mcp.json` now sends it. Management API: auth config ✅; logs ✅ via the new model — one
    ClickHouse table `logs`, `where source = 'auth_logs'` (also `auth_audit_logs`, `edge_logs`,
    `postgres_logs`, `supavisor_logs`, `postgrest_logs`); explicit ≤24 h window required. → `tools/supabase-logs.sh`.
  - **Vercel** — MCP is OAuth-only (503 on the PAT; OAuth stale → 403); CLI refuses a project-scoped token.
    REST works → `tools/ops-get.sh vercel`. Historical request logs: forbidden for this token. Latest
    production deployment object shows `CANCELED` (known auto-deploy flake).
  - **Guardrail** — `.claude/hooks/token-guard.sh` (ask on admin token / `settings.local.json` / env dumps /
    write-shaped management-API curls / `render-env.sh set|deploy`); verified live in-session.

## Next action

Collect the 7 discovery briefs → orchestrator spot-checks each brief's key claims against code/prod →
walk the user through the findings **one workstream at a time** (no solutions until they understand the
current state) → **Phase 1** design board artifact. If resuming in a new session, the briefs in
`discovery/` are the input; re-launch only the ones that are missing.

**Before Session 1 (user):** put these in `.claude/settings.local.json` under `env` (gitignored — never in
chat, never committed):

| Key | Where to create it | Status |
|---|---|---|
| `RENDER_API_KEY` | dashboard.render.com → Account Settings → API Keys | ✅ present, worked 2026-10-10 |
| `VERCEL_TOKEN` | vercel.com/account/settings/tokens → Create | ✅ present, verified 2026-10-10 — scoped to the `rasifiters` project only (reads project `prj_Eqd5…` via team `personal-vinayak`; sees no teams) |
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens → Generate new token — **Project** scope `rasifiters`, **read-only** preset. The default for all reads (metrics, logs, settings, advisors), no prompts | ✅ present, verified 2026-10-10 — reads the project + Auth config |
| `SUPABASE_ADMIN_TOKEN` | same page — **Project** scope `rasifiters`, **Full access**. Deliberate changes only; every use prompts the user (hook built in Step 0) | ✅ present, valid (one read-only GET 2026-10-10); unused until the guardrail hook exists |

**Real Android device — ✅ ready (2026-10-11):** Pixel 7, Android 17, serial `2C151FDH20037A`, USB debugging
authorized for this Mac ("always allow"). Installed: RaSi Fiters **1.0.0 (4)** from the Play Store (installer
`com.android.vending`) — the production build. `adb` is **not on PATH**: use
`~/Library/Android/sdk/platform-tools/adb`. Read-only diagnostics (`logcat`, `dumpsys`) let W5 read the real
Google sign-in error and W2/W4 watch FCM + Health Connect behaviour instead of guessing; visual checks stay the
user's.

Verify any token without printing it: read it from the file inside the command and pipe the header to curl
(`printf 'Authorization: Bearer %s' "$T" | curl -s -H @- <url>`), and print only non-secret fields.

## Workstream status

| # | Workstream | Discovery | Design | Build | Shipped |
|---|---|---|---|---|---|
| W1 | Sessions / auth | ✅ | ⬜ | ⬜ | ⬜ |
| W2 | Push + invites | ✅ | ⬜ | ⬜ | ⬜ |
| W3 | iOS health sync | ✅ | ⬜ | ⬜ | ⬜ |
| W4 | Android health sync | ✅ | ⬜ | ⬜ | ⬜ |
| W5 | Android Google sign-in | ✅ | ⬜ | ⬜ | ⬜ |
| W6 | Observability + perf | ✅ | ⬜ | ⬜ | ⬜ |
| W7 | Frontend state / error / design consistency | ✅ | ⬜ | ⬜ | ⬜ |

## Session log

- **2026-10-10** — Scoping. Evaluated an AWS move → shelved, stack stays (R8). Reviewed 30 days of Render
  metrics + Supabase usage (healthy core; 401 ≈ 22%, 409 noise, no request logs). Found first suspects S1–S9
  in code. User decisions: Supabase Pro, staging via the same project (staging tables), Step 0 = token-based
  access for all three services. Created `BRIEF.md` + this file. Same day: user created all tokens (Vercel
  project-scoped; Supabase read-only default + full-access admin) — all verified; read Supabase Auth session
  settings (BRIEF S8); Android Google sign-in failure confirmed on the Play build; Pixel 7 authorized for adb
  (2026-10-11).
- **2026-10-11** — Session 1. Step 0: token-only access to Render/Vercel/Supabase + `token-guard` hook +
  `tools/ops-get.sh` / `tools/supabase-logs.sh` (commit 5758965). Phase 0: 7 parallel discovery agents →
  `discovery/` briefs, all key claims verified by the orchestrator; two out-of-scope security findings
  offered as task chips.

## Kickoff prompt — Session 1

```text
Session 1 of the RaSi Fiters reliability overhaul. You are the orchestrator.

Read first: PROGRESS.md, then specs/initiatives/reliability-overhaul/BRIEF.md and HANDOFF.md.

Role: orchestrate. Spin up agents (Explore, scout, planner, the adversaries) and workflows in parallel,
keep your own context lean, and verify agent claims against the code before they reach me or the board.
No app code changes this session until I approve the design board.

1. Step 0 — credentials, no OAuth. My tokens are in .claude/settings.local.json (RENDER_API_KEY,
   VERCEL_TOKEN, SUPABASE_ACCESS_TOKEN = read-only, SUPABASE_ADMIN_TOKEN = full access). Wire
   token-based access for Render, Vercel and Supabase: test whether each hosted MCP accepts a Bearer
   header, otherwise use the CLI/REST with the token. Prove each with a read-only call (Render logs,
   Vercel logs, Supabase Auth settings + logs via the Management API). Build the guardrail: any command
   using SUPABASE_ADMIN_TOKEN must ask me first (BRIEF §6). Update CLAUDE.md, .mcp.json,
   .env.mcp.example and the hooks. Commit + push.
2. Phase 0 — discovery. Launch parallel read-only agents for W1–W7 (BRIEF §7). Each returns an evidence
   brief: how it works today (file:line), failure modes, which suspects S1–S9 are confirmed or refuted,
   and what the industry-standard version looks like. Pull production evidence now that we have access.
3. Walk me through the findings one workstream at a time and let me ask questions. Don't jump to
   solutions before I understand the current state.
4. Phase 1 — build the design board as an artifact: per workstream current vs target, the one contract
   all three frontends follow, the shared loading/error/design standard, the staging mechanism (same
   Supabase project, staging tables), and the decisions I need to make. Add the notification redesign
   and the social layer at concept level.
5. Once I approve, split the build into parallel phases and record them in BRIEF.md and HANDOFF.md.

My Pixel 7 is plugged in with USB debugging authorized (adb at ~/Library/Android/sdk/platform-tools/adb,
running the Play build 1.0.0 (4)) — use logcat/dumpsys for evidence, read-only.

Rules: update HANDOFF.md after every milestone so I can /compact at any time; commit + push docs via
git-version at milestones; backend changes stay compatible with every live binary in RELEASES.md;
no direct DB writes. I test on my iPhone, my Pixel and the web.
```
