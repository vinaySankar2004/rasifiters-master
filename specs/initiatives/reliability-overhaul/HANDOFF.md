# Reliability overhaul — rolling handoff

> **Volatile — current state only.** Overwrite "Now" + "Next action" at every milestone. When resuming after
> a compaction or in a new session, read `PROGRESS.md` → [`BRIEF.md`](BRIEF.md) → this file, then continue.
> Durable outcomes move to their canonical homes (SPEC §9 D-rules, `METHODOLOGY.md` R-entries); the session
> log below is one line per session.

## Now (2026-10-13)

- **Phase:** Phase 0 → board → **1b ✅** → **2 ✅** → **3 ✅** (backend live 2026-10-13; web client live; iOS 1.5.0 (58) on
  TestFlight Internal + Android 1.1.0 (5) on Play internal testing, closed testing in review — both device-tested ✅) →
  **Polish 1 ✅** (offline = real reachability, frontend-kit 0.3.0, `cf52772`; web live, phones in the next build) →
  **Phase 4 decided** ([`phase-4/DECISIONS.md`](phase-4/DECISIONS.md)) → **planning next.** Phase table: [`BRIEF.md`](BRIEF.md) §7.
- **What's live where:** phase plans under `plans/` (1b, 2a–d, 3-r1/r2/r3, 3-c1/c2/c3 + `phase-3-client-amendments.md`,
  `polish-1-offline-detection.md`); contracts + versions in the feature SPECs / `registry.json`; binaries in
  `RELEASES.md`; Supabase settings (refresh limit 1,500 · IP forwarding · 90-day inactivity · reuse window 60 s) in
  `ENV_RUNBOOK.md` §7c.
- **Release rule (user, 2026-10-13):** no store submission until ALL of Phase 4 is built and tested → one iOS + Android
  store release. Repo is pre-bumped: iOS **1.5.1 (59)**, Android versionCode **6**.
- **Known, accepted:** Sign out everywhere / password change end OTHER devices at their next refresh (≤ 1 h, stateless
  JWT — auth D-C14). Old iOS 1.4.x still shows the refresh storm (a TZ member) → nudge with `LATEST_IOS_VERSION` once
  1.5.x is public.
- **Open follow-ups:** daily watch (E8 `[refresh]` · `push_deliveries` · `app_events` `auth.*` / `sync.run`) · delete the
  legacy `RaSi_Fiters_API` ~2026-11-11 · Android Health Connect hand-entry test (user) · optional, not on the board:
  instant sign-out of other devices (session check cached ~1 min).
- **Boards:** design https://claude.ai/artifact/522hPHN9VSp6db6edCyZ3x · Phase 4
  https://claude.ai/artifact/FDpKpKeBSMcWA1W9zruryD (answers in `db` `board/phase4`). Both private.

## Next action

1. **Phase 4 planning and build (2026-10-13).** Three waves:
   - **Wave A — ✅ DONE (2026-10-13).** Plans: `plans/phase-4-q-quick-wins/` and `plans/phase-4-s0-privacy/`, plus
     the binding `plans/phase-4-wave-a-amendments.md`. The #47 CSV puts units in the headers.
     - **Privacy fix S0:** `5e76113`, live on Render 18:33Z.
       - Adds `utils/memberVisibility.js`.
       - Feature versions: members 0.4.0 · program-memberships 0.3.0 · member-analytics 0.5.0 · analytics 0.5.0 ·
         analytics-v2 0.2.1 · daily-health-logs 0.4.0 · workout-logs 0.7.0.
       - The user's prod check passed (all pass), after a testbed `--reset`: ava.rivera had been removed from all
         three test programs.
     - **Quick wins**, all reviewed with fix rounds:
       - web `095d864`, live on Vercel;
       - Android `82b7297`;
       - iOS `53f2e5d` (⌘B ✅).
       - Phones ship in the one store release.
     - Pending: the docs commit for the quick wins (frontend-kit 0.4.0 · member-analytics 0.6.0 · app-config 0.4.0
       · page SPEC patches).
   - **Wave B:** the Notifications server (migration 011) and the People server S1 (migration 012). Then web, iOS and
     Android client plans written against those two contracts, then a parity check.
   - **Wave C:** polish #9–#45 (#32 is People S5), planned per surface on top of the quick wins. Web owns every
     backend change any row needs.
   - **Waves B + C — APPROVED (2026-10-13), all recommendations (NP-U1–U6, polish U1–U3). BUILDING.**
     - **Plans:**
       - `plans/phase-4-{n-server,p-server (rev 3),c-web,c-ios,c-android,polish-web,polish-ios,polish-android}/`
       - binding `plans/phase-4-np-amendments.md` (incl. §6 S1 rev-3 fixes and §7 provisional versions/IDs)
       - `plans/phase-4-polish-amendments.md`
     - **Build order:**
       1. Notifications server (N-SRV) + web Pass A + iOS Track C + Android Track C, in parallel. Running now.
       2. People server S1 rev 3, after N-SRV passes review (same files: `server.js`).
       3. Web Pass B (People, behind `PEOPLE_LIVE`).
       4. Polish, per surface after that surface's Track C (shared files). Polish web owns the backend #38.
     - **Deploy:**
       1. The user runs migration 011 on staging, then on public.
       2. N-SRV deploys, with the user's yes.
       3. 012 runs, then S1 deploys.
       4. Web goes live per pass.
       5. The phones wait for the one store release.
     - **People** goes live with the store release on all clients (NP-U5).
   - *(Earlier pause, resolved:)* paused by the user (2026-10-13, leaving, would lose connectivity). When the B + C plans land, save them and
     STOP — no building until the user approves.
     - **Resume a run that was cut off** (same session):
       `Workflow({scriptPath, resumeFromRunId})`. Finished agents replay from cache.
       - Wave B: `wf_1a579fb4-116`, script
         `~/.claude/projects/-Users-vinayaksankaranarayanan-Developer-rasifiters-master/9597ef9d-…/workflows/scripts/phase-4-plan-b-wf_1a579fb4-116.js`
       - Wave C: `wf_bc12534e-92f`, script under the `…-rasifiters-master-specs-initiatives-reliability-overhaul-plans/9597ef9d-…/`
         project dir, `phase-4-plan-c-wf_bc12534e-92f.js`
     - **From a new session:** every finished agent's output is in
       `…/9597ef9d-…/subagents/workflows/<run id>/journal.jsonl`, one `"type":"result"` line per agent. Rebuild
       the plans from there.
     - **Save the plans to:**
       - Wave B: `plans/phase-4-n-server/`, `plans/phase-4-p-server/`, `plans/phase-4-c-{web,ios,android}/`
         (brief / plan / verdict)
       - Wave C: `plans/phase-4-polish-{web,ios,android}/`
       - The parity reports go in `plans/phase-4-{np,polish}-parity.md`. The amendments become the binding files,
         drafted the same way as `phase-3-client-amendments.md`.
     - Then present both waves to the user for approval.

   Orchestrator calls: five categories (program · activity · reminders · digest · announcements). With the switch off,
   program and announcements skip the push but still reach the inbox; activity, reminders and the digest are never
   created. Activity v1 = kudos received. Plans are saved under `plans/phase-4-*`; each wave goes to the user for
   approval, then builds.
2. Build → the user tests (iPhone ⌘R/TestFlight, Pixel internal) → ONE store release → raise `LATEST_*` then `MIN_*`.

## Workstream status

| # | Workstream | Discovery | Design | Build | Shipped |
|---|---|---|---|---|---|
| W1 | Sessions / auth | ✅ | ✅ | ✅ all four surfaces | 🟨 backend + web live; phones on test channels |
| W2 | Push + invites | ✅ | ✅ | ✅ all four surfaces | 🟨 backend + web live; phones on test channels |
| W3 | iOS health sync | ✅ | ✅ | ✅ backend + iOS 1.5.0 (58) | 🟨 TestFlight Internal |
| W4 | Android health sync | ✅ | ✅ | ✅ backend + Android 1.1.0 (5) | 🟨 Play internal testing |
| W5 | Android Google sign-in | ✅ | ✅ | ✅ console fix + button (1.1.0) | 🟨 Play internal testing |
| W6 | Observability + perf | ✅ | ✅ | ✅ backend + client senders (+ instant opens) | 🟨 backend + web live |
| W7 | Frontend state / error / design consistency | ✅ | ✅ | ✅ kit adopted + real offline detection (frontend-kit 0.3.0) | 🟨 web live; rest of the screens = Phase 4 polish |

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
- **2026-10-13 (cont.)** — Uploads: iOS 1.5.0 (58) → TestFlight Internal; Android 1.1.0 (5) built from the CLI →
  Play internal (first-ever internal track: opt-in took hours) + closed testing. Device tests pass on both. Polish 1
  (offline detection) built, reviewed, shipped (frontend-kit 0.3.0). Phase 4 discovery (9 agents) → decision board →
  the user picked all 45 polish fixes + two new (#46 iOS chart tooltip, #47 CSV export) and all recommendations except
  D-N1 (all four notification categories at once). Store release waits for all of Phase 4.

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
