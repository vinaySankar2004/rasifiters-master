# Reliability overhaul — rolling handoff

> **Volatile — current state only.** Overwrite "Now" + "Next action" at every milestone. When resuming after
> a compaction or in a new session, read `PROGRESS.md` → [`BRIEF.md`](BRIEF.md) → this file, then continue.
> Durable outcomes move to their canonical homes (SPEC §9 D-rules, `METHODOLOGY.md` R-entries); the session
> log below is one line per session.

## Now (2026-10-12)

- **Phase:** Step 0 → Phase 0 → design board ([`DESIGN_BOARD.md`](DESIGN_BOARD.md), approved 2026-10-11) →
  **Phase 1b ✅** → **Phase 2 ✅ COMPLETE** (both 2026-10-12, all live). **Phase 3 is gated** on the Phase 1b log
  watch ending clean on **2026-10-19** (board §12). Phase table: [`BRIEF.md`](BRIEF.md) §7.
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
  **0** cross-user pairs / 300 tokens. **Through ~23:00Z:** 323 × 200 · same single smoke 400 · **0** reuse · **0** × 429 ·
  **0** cross-user pairs / 365 tokens.
- **Pending:**
  - **D-4** — the user creates a Supabase **secret API key** (dashboard); Phase 3 R1 (per-user rate limits) needs it.
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
2. **Meanwhile (user):** D-4 — create the Supabase secret API key; Claude wires it as a Render env var (per-call OK).
3. **On a clean watch:** mark Phase 1b closed (BRIEF §7 + here) → **Phase 3 planning** via `multiplex`
   (`plan-pipeline` per backend track R1 / R2 / R3 in parallel, BRIEF §7) → user approves → backend first, then one
   bundled client release per surface. Staging only for the risky parts (R1 sessions/auth, R2 migrations).

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
