# Reliability overhaul — rolling handoff

> **Volatile — current state only.** Overwrite "Now" + "Next action" at every milestone. When resuming after
> a compaction or in a new session, read `PROGRESS.md` → [`BRIEF.md`](BRIEF.md) → this file, then continue.
> Durable outcomes move to their canonical homes (SPEC §9 D-rules, `METHODOLOGY.md` R-entries); the session
> log below is one line per session.

## Now (2026-10-13)

- **Phase:** Step 0 → Phase 0 → design board ([`DESIGN_BOARD.md`](DESIGN_BOARD.md), approved 2026-10-11) →
  **Phase 1b ✅** → **Phase 2 ✅** (both live 2026-10-12) → **Phase 3 backend ✅ LIVE 2026-10-13T02:24Z** (the user
  waived the 10-19 gate: "get this out asap") → **Phase 3 client half: web ✅ LIVE 2026-10-13; iOS 1.5.0 (58) +
  Android 1.1.0 (5) built + reviewed + compile-clean, awaiting the user's uploads + device tests.** Phase table:
  [`BRIEF.md`](BRIEF.md) §7.
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
- **Phase 3 client release** (`plans/phase-3-c{1-web,2-ios,3-android}/` + the binding
  [`plans/phase-3-client-amendments.md`](plans/phase-3-client-amendments.md); commits `211d0a9` web · `157578f`
  Android · iOS + the docs commit): sessions contract + Sign out everywhere (My Profile) · health sync v2 on both
  phones · device registry + invite inbox (invite tap opens it) · Android Google button · version gate + nudge ·
  kit adoption + instant opens. Feature versions: auth 0.14.0 · notifications 0.5.0 · invites 0.2.1 · observability
  0.3.0 · frontend-kit 0.2.0 (adopted) · app-config 0.3.0 · health-sync 0.2.0 · apple-health 0.8.0 · health-connect
  0.3.0. Supabase refresh-token **reuse window 10 → 60 s** (2026-10-13T06:16:03Z, `ENV_RUNBOOK.md` §7c).
- **Follow-ups:** ✅ done 2026-10-13 — `TRUST_PROXY_HOPS` (staging 3; observability 0.2.2), R2/R3 log through
  `utils/logError.js`, the doc handoffs (board §2–§4 marked backend-live, pages REGISTRY PUT, invite page SPEC, auth +
  app-config SPECs). Still open:
  1. Watch: the E8 queries daily (filter Render on the `[refresh]` tag) + R3's 24 h `push_deliveries` check (revert
     trigger: Android 0 `sent` with ≥ 1 `messaging/invalid-argument`) + G3's distinct-`remote_addr` count.
  2. Legacy `RaSi_Fiters_API` (suspended 2026-10-11, D-16): delete ~2026-11-11.
  3. Phase 4 polish candidates (user picks): **instant sign-out of other devices** — the API checks the session still
     exists (cached ~1 min) instead of trusting the JWT until expiry; small backend change, benefit = sign-out-everywhere
     feels immediate. Old iOS 1.4.x refresh storm still visible (one TZ member: 401 → refresh ~1/s during health sync)
     → turn on the 1.5.0 soft nudge (`LATEST_IOS_VERSION`) as soon as 1.5.0 is public.
- **Standing preferences (memory):** `staging-use-sparingly` · `keep-disk-lean` · `dont-over-engineer` ·
  `ios-user-verifies-builds-visually` (the user presses ⌘B — never the `xcode` MCP build) · no shims for old binaries.
  Walkthrough decisions on the board (✅); factual answers in [`discovery/README.md`](discovery/README.md).
- **Board artifact:** https://claude.ai/artifact/522hPHN9VSp6db6edCyZ3x (private; `db` store `board`/`answers`).

## Next action

1. **The user ships + tests the phones:** iOS **1.5.0 (58)** → TestFlight (then pre-bump the repo to 1.5.1 (59) —
   one-train-ahead) · Android **1.1.0 (5)** → Play internal testing (then pre-bump versionCode 6). Update `RELEASES.md`
   as each lands. Test on iPhone + Pixel with the checklists at the end of each track's `plan.md` (sessions, Sign out
   everywhere, health sync incl. the upgrade from the store build, invite tap → inbox, offline banner, update banner).
   Then App Store / Play production.
   **Device tests 2026-10-13 (iPhone 1.5.0 (58) + web):** ✅ upgrade keeps the session + no doubled totals · health
   sync · invite tap → inbox · offline banner · instant opens · Pixel Google button (on 1.0.0's console fix). By design,
   not a bug: Sign out everywhere / password change end the OTHER devices only at their next refresh (≤ 1 h — stateless
   JWT check, auth D-C14); the user accepted it ("no p"). Re-check: in airplane mode iOS showed "Couldn't refresh"
   instead of "You're offline" (wiring verified correct — likely the seconds before iOS reports the path change).
   **Android 1.1.0 (5) on the user's Pixel (internal track, 2026-10-13):** ✅ upgrade · sign out everywhere · invite
   inbox + tap · offline banner · instant opens · Google button · quick-add widget; Health Connect hand-entry test
   pending. **No store submission until all of Phase 4 ships (user, 2026-10-13)** — then one big release.
2. **Phase 4 (all of it ships before the store release — user, 2026-10-13):** discovery done →
   [`phase-4/DISCOVERY.md`](phase-4/DISCOVERY.md) (45 polish fixes from 89 findings · 15+2 notification decisions incl.
   the user's send-anytime + personalized direction · 11 People decisions · a privacy gap: any signed-in member can
   read every member's email). **Decision board:** https://claude.ai/artifact/FDpKpKeBSMcWA1W9zruryD (private; answers
   in `db` doc `board/phase4` — read with ArtifactData). Next: the user fills it → plans. Polish #1 (offline detection,
   `plans/polish-1-offline-detection.md`) is built on all three, in a review fix round, uncommitted.
3. **After adoption:** raise `LATEST_*` then `MIN_*` app-config versions on Render (user-approved env change) to nudge,
   then require, the new builds.
4. Daily watch (follow-up 1) — now also `app_events` `auth.*` / `sync.run` from the new clients.

## Workstream status

| # | Workstream | Discovery | Design | Build | Shipped |
|---|---|---|---|---|---|
| W1 | Sessions / auth | ✅ | ✅ | ✅ backend + web + iOS + Android | 🟨 backend + web live; phones await upload |
| W2 | Push + invites | ✅ | ✅ | ✅ backend + all three clients | 🟨 backend + web live; phones await upload |
| W3 | iOS health sync | ✅ | ✅ | ✅ backend + iOS 1.5.0 (58) | 🟨 awaits TestFlight |
| W4 | Android health sync | ✅ | ✅ | ✅ backend + Android 1.1.0 (5) | 🟨 awaits Play upload |
| W5 | Android Google sign-in | ✅ | ✅ | ✅ console fix + button (1.1.0) | 🟨 awaits Play upload |
| W6 | Observability + perf | ✅ | ✅ | ✅ backend + client senders (+ instant opens) | 🟨 backend + web live |
| W7 | Frontend state / error / design consistency | ✅ | ✅ | ✅ kits adopted on touched screens (frontend-kit 0.2.0) | 🟨 web live |

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
- **2026-10-13** — Phase 3 client release: scope confirmed with the user (instant opens added; Phase 4 = notifications
  + People + a polish pass judged on benefit vs effort). 3 parallel plans + a parity check (8 blocking cross-surface
  mismatches) → one shared amendments file, user-approved (U1–U3). Built by 3 implementers in the main tree,
  reviewed + fix rounds (web 7 · Android 11 · iOS 10); web live; iOS ⌘B clean twice (new `tools/ios-typecheck.sh`
  pre-check); Android compile clean. Supabase reuse window 10 → 60 s. Shared docs + tags in one commit.

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
