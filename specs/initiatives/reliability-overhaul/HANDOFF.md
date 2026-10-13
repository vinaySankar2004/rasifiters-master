# Reliability overhaul — rolling handoff

> **Volatile — current state only.** Overwrite "Now" + "Next action" at every milestone. When resuming after
> a compaction or in a new session, read `PROGRESS.md` → [`BRIEF.md`](BRIEF.md) → this file, then continue.
> Durable outcomes move to their canonical homes (SPEC §9 D-rules, `METHODOLOGY.md` R-entries); the session
> log below is one line per session.

## Now (2026-10-13)

- **Phase:** Step 0 → Phase 0 → design board ([`DESIGN_BOARD.md`](DESIGN_BOARD.md), approved 2026-10-11) →
  **Phase 1b ✅** → **Phase 2 ✅** (both live 2026-10-12) → **Phase 3 backend ✅ LIVE 2026-10-13T02:24Z** (the user
  waived the 10-19 gate: "get this out asap"). **Next: Phase 3 client half** — one bundled release per surface.
  Phase table: [`BRIEF.md`](BRIEF.md) §7.
- **Live — Phase 1b** ([`plans/phase-1b/`](plans/phase-1b/)): H1 stateless auth proxy (auth 0.10.0) · H3 analytics
  membership gate (analytics 0.4.0 / analytics-v2 0.2.0) · H2 `rate_limit_token_refresh` 1,500 (2026-10-12T19:08:19Z)
  · D-15 reset email via Resend SMTP (`ENV_RUNBOOK.md` §7b).
- **Live — Phase 2** (`plans/phase-2{a,b,c,d}-*/`): C version gate (app-config 0.2.0) · A observability (request log,
  `app_events` + `POST /api/client-events`, `trust proxy` 2) · D frontend kits (frontend-kit 0.1.0, **unadopted**) ·
  B staging (`staging` schema, `rasifiters-api-staging`, Vercel `staging` preview; setup `ENV_RUNBOOK.md` §Staging).
- **Live — Phase 3 backend** (`plans/phase-3-r{1-sessions,2-sync,3-push}/`; commits `2f19e01` R1 · `f7863b5` R2 ·
  `79a3067` R3; migrations 009 + 010 run on staging + public, verified):
  - **R1** auth 0.13.0 + observability 0.2.0: per-user Supabase rate limits (`SUPABASE_SECRET_KEY` + `Sb-Forwarded-For`),
    logout = this device, password change ends OTHER devices, `POST /auth/logout-all`, classified 503s, body-parser
    400s, `utils/logError.js`. Supabase **IP forwarding ON 02:32:21Z** (G3; client IPs now reach Supabase — verified)
    and **90-day inactivity 02:32:28Z** (G4).
  - **R2** health-sync 0.1.0 (new) + daily-health-logs 0.3.0 + workout-logs 0.6.0 + observability 0.2.1:
    `POST /api/health-sync/batch` + `GET|PUT /state`, permanent sample ledger, provenance, bounds. No client calls it
    yet.
  - **R3** notifications 0.4.0 + invites 0.2.0: device registry (`last_seen_at`, install id), `push_deliveries`,
    `POST /device/unregister` (no login), APNs/FCM 7-day TTL + `rasi_invites` channel, SSE plain close on SIGTERM,
    invite transaction.
  - **Verified:** staging smokes (R1 43/43 · R2 all S-lines + DB rows · R3 24/26 — see follow-up 1) and prod smokes
    (R1 25/25 before and after G3 · R2 all P-lines · R3 26/26); the user's iPhone + Pixel: sign-out on one keeps the
    other; a real invite push arrived on both (`push_deliveries`: ios `sent` + android `sent`).
- **Follow-ups (small, not blocking):**
  1. Staging has **3** proxy hops (`xff_n` 3) vs prod's 2, so on staging `req.ip` is a proxy and per-client limits /
     `Sb-Forwarded-For` are wrong there. Fix: `trust proxy` from an env var (`TRUST_PROXY_HOPS`, default 2; staging 3).
  2. Doc handoffs: R1 H2 (`DESIGN_BOARD.md:55-57`), H3 (`specs/pages/REGISTRY.md:142` → PUT; key in
     `apps/backend/CONTEXT.md:43`), the `versionGate.js:8` comment; R3 #5 docs outside its fence (web members/invite
     page SPEC, auth SPEC :167, app-config SPEC :145-146 + F1); R3 #6 no-bump notes for `server.js`'s features.
  3. R2/R3 code adopts `utils/logError.js` (observability §4).
  4. Watch: keep the E8 queries daily (filter Render on the `[refresh]` tag) + R3's 24 h `push_deliveries` check
     (revert trigger: Android 0 `sent` with ≥ 1 `messaging/invalid-argument`) + G3's distinct-`remote_addr` count.
  5. Legacy `RaSi_Fiters_API` (suspended 2026-10-11, D-16): delete ~2026-11-11.
- **Standing preferences (memory):** `staging-use-sparingly` · `keep-disk-lean` · `dont-over-engineer` ·
  `ios-user-verifies-builds-visually` (the user presses ⌘B — never the `xcode` MCP build) · no shims for old binaries.
  Walkthrough decisions on the board (✅); factual answers in [`discovery/README.md`](discovery/README.md).
- **Board artifact:** https://claude.ai/artifact/522hPHN9VSp6db6edCyZ3x (private; `db` store `board`/`answers`).

## Next action

1. **Phase 3 client half — plan via `multiplex`:** one bundled release per surface (web, iOS, Android), parallel
   implementers, built against the contracts now in the SPECs: auth §3.1 (sessions: one token store, refresh only when
   needed, sign out only on `401 session_invalid`, never auto-retry password writes) · health-sync §8 (catch-up 30 d,
   upgrade run, review once) · notifications §3.1–3.3 + invites §3.1 (install id, unregister on sign-out, Android
   invite inbox, SSE re-fetch) · observability §8 (`auth.*` + `sync.run` events) · Android Google button (W5) · kit
   adoption on touched screens · version-gate UI + soft nudge (app-config). The user ships the iOS / Android binaries;
   Android health tests = Health Connect data entered by hand on the Pixel (W4-D2).
2. Follow-ups 1–3 above (one small backend + docs commit; follow-up 1 needs a staging env var → user OK).
3. Daily watch (follow-up 4).

## Workstream status

| # | Workstream | Discovery | Design | Build | Shipped |
|---|---|---|---|---|---|
| W1 | Sessions / auth | ✅ | ✅ | 🟨 backend ✅ (1b H1 + Phase 3 R1); clients → Phase 3 client half | 🟨 backend live 2026-10-13 |
| W2 | Push + invites | ✅ | ✅ | 🟨 backend ✅ (R3); clients (Android inbox) → client half | 🟨 backend live 2026-10-13 |
| W3 | iOS health sync | ✅ | ✅ | 🟨 backend ✅ (R2); iOS client → client half | 🟨 backend live 2026-10-13 |
| W4 | Android health sync | ✅ | ✅ | 🟨 backend ✅ (R2); Android client → client half | 🟨 backend live 2026-10-13 |
| W5 | Android Google sign-in | ✅ | ✅ | 🟨 console fix ✅; button code → client half | 🟨 sign-in works on Play build |
| W6 | Observability + perf | ✅ | ✅ | 🟨 Phase 2 A + R1/R2 events ✅; client senders → client half | 🟨 backend live |
| W7 | Frontend state / error / design consistency | ✅ | ✅ | 🟨 kits built (frontend-kit 0.1.0); adoption → client half | ⬜ kits unadopted |

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
- **2026-10-12/13** — Watch day 0 clean. Phase 3 backend planned (3 parallel `plan-pipeline` tracks), user-approved
  with amendments + gate waived ("asap"), built in 3 worktrees, impl-adversary'd (0 blocking; fix rounds folded in),
  merged R1 → R2 → R3, migrations 009 + 010 run by the user on staging then public, one staging deploy + smokes, one
  prod push (02:24Z), prod smokes + phones verified, G3 IP forwarding + G4 90-day inactivity applied. Phase 4 scope
  note: start from the full page / feature / widget inventory (BRIEF §7).

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
