# Reliability overhaul — rolling handoff

> **Volatile — current state only.** Overwrite "Now" + "Next action" at every milestone. When resuming after
> a compaction or in a new session, read `PROGRESS.md` → [`BRIEF.md`](BRIEF.md) → this file, then continue.
> Durable outcomes move to their canonical homes (SPEC §9 D-rules, `METHODOLOGY.md` R-entries); the session
> log below is one line per session.

## Now (2026-10-12)

- **Phase:** Step 0 → Phase 0 → design board ([`DESIGN_BOARD.md`](DESIGN_BOARD.md), approved 2026-10-11) →
  **Phase 1b ✅** → **Phase 2 ✅ COMPLETE** (both 2026-10-12, all live) → **Phase 3 planning** (backend R1–R3, started
  2026-10-12). The Phase 3 **build** is gated on the Phase 1b log watch ending clean on **2026-10-19** (board §12).
  Phase table: [`BRIEF.md`](BRIEF.md) §7.
- **Live — Phase 1b** ([`plans/phase-1b/`](plans/phase-1b/)):
  - H1 stateless auth proxy + classified refresh 401 / 503 — auth 0.10.0 / D-C11.
  - H3 analytics membership gate — analytics 0.4.0 / D-C8 · analytics-v2 0.2.0 / D-C3.
  - H2 Supabase `rate_limit_token_refresh` 150 → 1,500 at 2026-10-12T19:08:19Z (revert = the same admin-token
    call with 150).
  - D-15 password-reset email via Resend SMTP (`ENV_RUNBOOK.md` §7b).
- **Live — Phase 2** (all four plans user-approved; `plans/phase-2{a,b,c,d}-*/`):
  - C version gate — app-config 0.2.0 (gate fields; `BLOCK_UNVERSIONED_ANDROID` off).
  - A observability — observability 0.1.1 🚀: request log, `app_events` (migration 007) + `POST /api/client-events`,
    SQL logging off, `errorHandler` password-logging fix, `trust proxy` 2; prod smoke 28/28, per-client limiter verified.
  - D frontend kits — frontend-kit 0.1.0, built on web / iOS / Android, **unadopted** (adoption = Phase 3).
  - B staging — auth 0.12.0 / D-C13: `staging` schema + `rasifiters_staging` role (migration 008), Render
    `rasifiters-api-staging` (free), Vercel `staging` branch preview, 7 `+stg` testbed accounts; the user verified
    web + iOS simulator. Setup: `ENV_RUNBOOK.md` §Staging.
- **Staging is opt-in (user, 2026-10-12):** only for risky changes (migrations, auth/session); default testing stays
  on prod + the user's own devices. Clients: iOS `RaSi-Fiters-App-Staging` scheme · Android `staging` build type
  (`./gradlew :app:assembleStaging` — compiles; `debug` → prod since `9ca67ca`; not yet run on a device) · web = the
  `staging` branch preview.
- **Watch to 2026-10-19** (plan-1b E8 queries, once a day): `refresh_token_already_used`/day (baseline ≈ 1.6),
  429 `over_request_rate_limit`/day (≈ 1.3; counts after 19:08:19Z reflect the new limit), Render
  `[refresh] auth_unavailable|session_invalid` + `[auth] token verification unavailable` + `[auth] password reset
  request failed`, cross-user token pairs < 200 ms (baseline 59 / 30 d). **Day 0** (10-12 06:25–19:10Z): 296 × 200
  refreshes · 1 × 400 `validation_failed` (the smoke's garbage token) · **0** reuse kills · **0** × 429 ·
  **0** cross-user pairs / 300 tokens. **Day 0 final** (UTC 10-12, checked 23:36Z): 425 × 200 · 2 × 400
  `validation_failed` (both smoke runs, 07:18 + 19:04Z) · **0** reuse · **0** × 429 (any auth path) · **0** cross-user pairs
  / 365 post-H1 tokens (the 7-day query's 17 are all pre-H1 — run it from 06:25Z 10-12) · Render: 0 `auth_unavailable`, 0
  token-verify-unavailable, 1 password-reset failure at 06:57Z (pre-D-15 SMTP).
- **Pending:**
  - ✅ **D-4 done 2026-10-12** — `SUPABASE_SECRET_KEY` (`sb_secret_…`) on prod + staging Render (ENV_RUNBOOK); unused until Phase 3 R1.
  - Follow-ups → Phase 3: auth F12–F15 · observability F2 + F8 · kit adoption on the screens Phase 3 touches.
  - Phase 3 Android sync testing: the user enters Health Connect test data by hand on the Pixel (no Android
    wearable — walkthrough W4-D2).
  - Legacy `RaSi_Fiters_API` (suspended 2026-10-11, D-16): delete after a quiet month (~2026-11-11).
- **Standing preferences (memory):** `staging-use-sparingly` · `keep-disk-lean` · `dont-over-engineer` ·
  `ios-user-verifies-builds-visually` (iOS: the user presses ⌘B — never call the `xcode` MCP build) · no shims for
  old binaries (board §0). Walkthrough decisions live on the board (✅ marks); factual answers in
  [`discovery/README.md`](discovery/README.md).
- **Board artifact:** https://claude.ai/artifact/522hPHN9VSp6db6edCyZ3x (private; `db` store collection `board`,
  doc `answers`). HTML source only in Session 1's scratchpad — `Artifact read` before republishing.

## Next action

1. **Until 2026-10-19:** run the E8 watch queries once a day and add that day's counts to the watch line above.
   Any reuse kill, 429 burst or cross-user pair → investigate before Phase 3.
2. **Phase 3 backend plans — written, awaiting user approval (2026-10-12).** `plans/phase-3-r1-sessions/` (no
   migration; auth 0.13.0, observability 0.2.0) · `phase-3-r2-sync/` (migration 009; new health-sync 0.1.0,
   daily-health-logs 0.3.0, workout-logs 0.6.0, observability 0.2.1) · `phase-3-r3-push/` (migration 010; notifications
   0.4.0, invites 0.2.0). Each has `brief.md` / `plan.md` / `verdict.md`, revised once. **One blocking objection per plan
   remains, fixed at approval:**
   - **R1:** a bad prod secret key would sign out every Android 1.0.0 user. Before prod, confirm the key matches on
     prod and staging, add a STOP rule, and pre-write the rollback (unset `SUPABASE_SECRET_KEY`).
   - **R2:** the upgrade run reads from today − 30 d and never uses the connect-date rule (otherwise old minutes are
     counted twice).
   - **R3:** the worktree compile check needs a literal path, symlinked `node_modules` and a placeholder `DATABASE_URL`.
   Orchestrator choices: build in parallel worktrees, then land and deploy one track at a time, R1 → R2 → R3
   (staging holds one track at a time). Verified: `security_sb_forwarded_for_enabled` (false) and
   `sessions_inactivity_timeout` (0) exist in config/auth; Android 1.0.0 falls back to `rasi_default` for the new
   channel. After the backend: plan + build one bundled client release per surface against the approved contracts.
3. **On a clean watch (10-19):** mark Phase 1b closed (BRIEF §7 + here) and start the backend build.

## Workstream status

| # | Workstream | Discovery | Design | Build | Shipped |
|---|---|---|---|---|---|
| W1 | Sessions / auth | ✅ | ✅ | 🟨 1b H1 ✅ (+ H2); R1 + sessions contract → Phase 3 | 🟨 partial — H1 live 2026-10-12 |
| W2 | Push + invites | ✅ | ✅ | ⬜ Phase 3 R3 | ⬜ |
| W3 | iOS health sync | ✅ | ✅ | ⬜ Phase 3 R2 | ⬜ |
| W4 | Android health sync | ✅ | ✅ | ⬜ Phase 3 R2 | ⬜ |
| W5 | Android Google sign-in | ✅ | ✅ | 🟨 console fix ✅; button code → Phase 3 | 🟨 sign-in works on Play build |
| W6 | Observability + perf | ✅ | ✅ | 🟨 Phase 2 A ✅; client senders + query pack → Phase 3 (observability D-C9) | 🟨 partial — observability 0.1.1 live 2026-10-12 |
| W7 | Frontend state / error / design consistency | ✅ | ✅ | 🟨 Phase 2 D ✅ kits built (frontend-kit 0.1.0); adoption → Phase 3 | ⬜ kits unadopted |

## Session log

- **2026-10-10** — Scoping. Evaluated an AWS move → shelved, stack stays (R8). Reviewed 30 days of Render
  metrics + Supabase usage (healthy core; 401 ≈ 22%, 409 noise, no request logs). Found first suspects S1–S9
  in code. User decisions: Supabase Pro, staging via the same project (staging tables), Step 0 = token-based
  access for all three services. Created `BRIEF.md` + this file. Same day: user created all tokens (Vercel
  project-scoped; Supabase read-only default + full-access admin) — all verified; read Supabase Auth session
  settings (BRIEF S8); Android Google sign-in failure confirmed on the Play build; Pixel 7 authorized for adb
  (2026-10-11).
- **2026-10-11** — Session 1. Step 0: token-only access + `token-guard` hook + `tools/ops-get.sh` /
  `tools/supabase-logs.sh`. Phase 0: 7 parallel discovery agents → verified briefs. Walkthrough W1–W7 with the
  user (decisions → the design board). Design board published (artifact with a `db` answer store), adversary-reviewed,
  **approved**. Console tour in the built-in browser: W5 Google sign-in fixed + verified, legacy API suspended,
  Vercel ignore step fixed, password-reset email gap found → Resend set up (SMTP save pending). Phase 1b plan
  approved; implementer running.
- **2026-10-12** — Phase 1b shipped: H1 (auth 0.10.0) + H3 (analytics 0.4.0 / analytics-v2 0.2.0) reviewed →
  deployed → prod smoke 27/27 + user check on all 3 surfaces; D-15 Resend SMTP live; H2 rate limit → 1,500;
  7-day watch started (day 0 clean). Phase 2 planned as 4 parallel tracks, user-approved, built + deployed the same
  day: C app-config 0.2.0 · A observability 0.1.1 (migration 007, smoke 28/28) · D frontend-kit 0.1.0 (unadopted) ·
  B staging (auth 0.12.0, migration 008, `rasifiters-api-staging`, Vercel `staging` preview; web + iOS verified).
  User preferences: staging opt-in for risky changes only (Android `debug` → prod, opt-in `staging` build type),
  keep disk lean, iOS builds = the user's ⌘B.

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
