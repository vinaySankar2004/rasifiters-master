# Reliability overhaul — rolling handoff

> **Volatile — current state only.** Overwrite "Now" + "Next action" at every milestone. When resuming after
> a compaction or in a new session, read `PROGRESS.md` → [`BRIEF.md`](BRIEF.md) → this file, then continue.
> Durable outcomes move to their canonical homes (SPEC §9 D-rules, `METHODOLOGY.md` R-entries); the session
> log below is one line per session.

## Now (2026-10-13, late night) — BOTH APPS SUBMITTED FOR STORE REVIEW

- **Phase:** 1b ✅ → 2 ✅ → 3 ✅ → polish 1 ✅ → Phase 4 ✅ built + device-tested → **release touch-ups ✅ → submitted.**
  - Phase table: [`BRIEF.md`](BRIEF.md) §7. Decisions: [`phase-4/DECISIONS.md`](phase-4/DECISIONS.md).
- **Store state (RELEASES.md):**
  - **iOS 1.5.2 (60): Waiting for Review**, manual release (goes public only on the user's Release click). Also on
    TestFlight Internal. App Privacy + Other Diagnostic Data. Repo pre-bumped to **1.5.3 (61)**.
  - **Android 1.2.0 (7): production + closed testing in review**, Data safety + Device IDs + Diagnostics. **Managed
    publishing ON** — every approved change waits for the user's Publish click (closed testing → Pixel first).
    Internal testing live. Repo pre-bumped to versionCode **8**.
- **Live:** backend (Render) + web (Vercel) carry everything, incl. tonight's touch-ups. People stays dark on web
  (`PEOPLE_LIVE = false`, `apps/web/src/lib/api/people.ts`) until the store apps are public.
- **Tonight's touch-ups** (plans `plans/phase-4-touchup-{inbox,profile}/`, amendments
  `plans/phase-4-touchup-amendments.md`; each surface reviewed + fix-rounded):
  - (a) Inbox remove one + Clear all — backend `97492d9` (notifications 0.7.0, D-C32), web `fa57ad9`, Android
    `5ca5309`, iOS `1d813c4`. Option (A): every notification row removable; Invitations never touched.
  - (b) Exact reminders `9a57bd0` — user-verified.
  - (c) Profile circle → My Profile, Back returns (D-PC1) — in the same client commits.
  - (d) iOS edge swipe needs a committed drag `728afad` (D-REL2). Follow-the-finger root swipe **dropped by the
    user — don't re-pitch.**
  - (e) iOS People rows `1e74a54`.
  - (f) SEO `cc46131` (landing 0.1.5, D-LAND-12): WebSite `alternateName` = real spellings only, brand-first
    description, hero eyebrow, per-page titles. Live + verified. Owner steps pending (below).
- **Known, accepted:** sign out everywhere ends other devices at their next refresh (≤ 1 h); old iOS 1.4.x refresh
  storm (nudge once 1.5.x is public); iOS Members placeholders on return; CONTEXT-file debt; iOS inbox device
  check: open a card, close it, open another — the list must not jump (if it does: `ScrollPosition` swap, see
  the iOS fix-round review).
- **Open follow-ups:** daily watch (E8 `[refresh]` · `push_deliveries` · `app_events` · scheduler sends); delete
  legacy `RaSi_Fiters_API` ~2026-11-11; Android Health Connect hand-entry test; stale-page-SPEC chip.
- **Boards:** design https://claude.ai/artifact/522hPHN9VSp6db6edCyZ3x · Phase 4
  https://claude.ai/artifact/FDpKpKeBSMcWA1W9zruryD. Both private.

## Next action

1. **The user:** quick TestFlight 60 check ([`phase-4/TEST-CHECKLIST.md`](phase-4/TEST-CHECKLIST.md) §4). A problem →
   pull the App Store submission, fix, upload **1.5.3 (61)**.
2. **Play:** Publishing overview → when closed testing is approved, **Publish** (Pixel gets 7) → Pixel quick check →
   when production is approved, **Publish**.
3. **App Store approved → Release.** Then, once BOTH are public:
   1. Flip `PEOPLE_LIVE = true` → deploy web (a yes to push).
   2. Raise app-config `LATEST_*` (later `MIN_*`).
   3. Update RELEASES.md.
4. **SEO owner steps** ([`plans/phase-4-seo.md`](plans/phase-4-seo.md)): Search Console → resubmit the sitemap →
   Rich Results Test → URL Inspection → Request indexing. Days–weeks to show "RaSi Fiters".
5. Close Phase 4 in BRIEF §7, PROGRESS.md and the skills' Converged lessons (multiplex: three-wave plan, shared-file
   commit split, migrations before code, per-surface fix rounds, managed publishing for the store hold).

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

- **2026-10-13 (night)** — Phase 4 planned in three waves (A: quick wins + privacy; B: Notifications + People
  server → clients → parity; C: polish #9–#45), each user-approved with amendments, then built by per-surface
  implementers with an adversary review and fix rounds each. Migrations 011/012 run by the user. Backend + web live;
  phones on TestFlight 59 / Play internal + closed (in review). Docs and tags for all three waves. User testing next.

- **2026-10-13 (late night)** — Release touch-ups: two parallel plan-pipelines (inbox, profile circle) + a
  back-swipe investigation + an SEO audit; 4 per-surface implementers, adversary reviews + fix rounds; backend +
  web + SEO live. Builds iOS 1.5.2 (60) / Android 1.2.0 (7); **both submitted** (App Store manual release; Play
  managed publishing), App Privacy + Data safety updated. Repo pre-bumped to 1.5.3 (61) / versionCode 8.

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
