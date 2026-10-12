# Reliability overhaul — rolling handoff

> **Volatile — current state only.** Overwrite "Now" + "Next action" at every milestone. When resuming after
> a compaction or in a new session, read `PROGRESS.md` → [`BRIEF.md`](BRIEF.md) → this file, then continue.
> Durable outcomes move to their canonical homes (SPEC §9 D-rules, `METHODOLOGY.md` R-entries); the session
> log below is one line per session.

## Now

- **Phase:** Session 1 (2026-10-11). Step 0 ✅ → Phase 0 ✅ → walkthrough ✅ → **design board ✅ APPROVED**
  ([`DESIGN_BOARD.md`](DESIGN_BOARD.md) — D-1…D-14 as recommended except D-10 → free staging; add-ons
  D-15…D-17 in its §11) → console tour ✅ → **Phase 1b: H1 + H3 DEPLOYED + verified 2026-10-12** (auth 0.10.0
  / D-C11; analytics 0.4.0 / D-C8 + analytics-v2 0.2.0 / D-C3) + **H2 done 2026-10-12T19:08:19Z** — 7-day log
  watch running. Phases + parallel tracks: [`BRIEF.md`](BRIEF.md) §7.
- **IN FLIGHT — Phase 2 PLANNING (started 2026-10-12, user: "start phase 2 in parallel").** Four background
  workflow runs (`phase2-track-plan` = saved `plan-pipeline` + a scribe), one per track; each writes
  `brief.md` / `plan.md` / `verdict.md` to `plans/phase-2a-observability/`, `phase-2b-staging/`,
  `phase-2c-version-gate/`, `phase-2d-frontend-kits/` and returns a short summary (fence per surface,
  migrations, console actions, user decisions, open BLOCKING items). **Next:** check the four fences for overlaps
  (A/B/C all touch the backend — likely `server.js`, `config/database.js`), resolve shared-file sequencing,
  present all four plans to the user → **user approves each** → implementers (backend tracks sequenced where
  files overlap; D's three surfaces in parallel) → impl-adversary → compile-check → git-version → user OK to push.
  If the summaries were lost in a compaction: read the `plans/phase-2*/` files (written once each run ends).
  ✅ **All 4 plans done + committed (`42c08aa`)** — A/B/D revised once; no BLOCKING left except D's banner
  line-clamp (fix below). A's `plan.md` was recovered from the workflow journal (scribe write was blocked).
  **Orchestrator cross-track decisions (2026-10-12):** (1) **Build order:** backend **C → A → B** in the main
  tree, one commit per track (all three edit `server.js`; `.env.example` / ENV_RUNBOOK / registry shared);
  **D**'s 3 surfaces in parallel worktrees alongside C/A; B's client files (iOS `APIConfig.swift` + Staging
  scheme, Android `build.gradle.kts`) after D compiles; D's `apps/*/CONTEXT.md` pointers after B.
  (2) **Header contract:** `X-App-Platform` / `X-App-Version` (+ `X-App-Build` if the user approves) +
  `X-Request-Id` — owned by the observability SPEC (A); app-config links to it. (3) **CORS:** one block — A adds
  `maxAge` + `exposedHeaders: [Retry-After, X-Request-Id]` (closes auth F16); B adds `CORS_EXTRA_ORIGINS`
  (unset in prod → unchanged). (4) **Numbering:** migrations A=007, B=008; auth A=0.11.0, B=0.12.0; D-rules
  A=D-C12, B=D-C13. (5) **B:** prod boot check logs (`console.error`), never throws. (6) **A:** add a per-client
  daily event cap; fix `errorHandler` logging `err.body` (can contain passwords — log-only fix). (7) **C:** F4 →
  fix the doc (render.yaml untouched); placeholder thresholds; D-C5 exempts `/api/client-events`. (8) **D:** no
  line clamp on iOS/Android banners + phone-width visual check; credential-endpoint 401s keep server text;
  iOS uses `ObservableObject`; Android maps coroutine timeouts to TIMEOUT.
  ✅ **User APPROVED all 4 plans (2026-10-12)** + `X-App-Build` header ✅ + `pg_cron` 90-day retention ✅ + copy
  `workouts_library` into staging ✅. **BUILD in flight:** orchestrator wrote `specs/features/frontend-kit/SPEC.md`
  (from D's plan + amendments: credential-endpoint 401 scope rule, Android `TimeoutCancellationException`,
  depends_on workout-logs + daily-health-logs; uncommitted — goes in D's git-version commit). 4 `implementer`
  agents in the MAIN tree, directory-disjoint, no commits: **C** (backend, 5-file fence) · **D-web** · **D-iOS**
  (iOS compile needs Xcode open → else UNVERIFIED) · **D-Android**. Next: impl-adversary per track → A after C
  → B after A (its client files after D) → git-version per track → **ask before each push**.
  **Progress:** ✅ D-web (6 files + temporary `/kit-preview` page — NEVER commit it; `npm run build` ✅) ·
  ✅ D-Android (7 new + manifest line; `assembleDebug` ✅) · D-iOS running · ✅ **C committed LOCALLY
  `a6bff90`** (tag `feature/app-config@v0.2.0`; boot smoke 16/16; registry/REGISTRY/COVERAGE updated) —
  **⚠️ main now has UNPUSHED backend code: do NOT push docs until the user OKs the backend push.**
  C `impl-adversary` running on `a6bff90`; **A implementer running** (main tree; no DB writes; 007 not run).
  **2026-10-12 later — C, A, D all reviewed + committed LOCALLY (NOT pushed):** C `a6bff90` + fixes `7dba385`
  (`feature/app-config@v0.2.0`) · A `051c073` (`feature/observability@v0.1.0`, `feature/auth@v0.11.0`;
  harnesses 107/0 + 30/0; review: 0 code blockers) · D `f831279` (`feature/frontend-kit@v0.1.0`; web +
  Android builds ✅, **iOS ⌘B ✅ by the user** after fixes; web fit checked by Claude at 375 + 1280 px;
  `/kit-preview` deleted) · chores `0224627` (lessons) + `afff2ca` (`.claude/launch.json`). **Stray, NOT ours:**
  Xcode rewrote `apps/ios/…/project.pbxproj` + `Info.plist` (HealthKit usage strings moved into build
  settings) — left uncommitted for the user. **Next:** (1) USER runs `apps/backend/sql/007_app_events.sql` in the
  Supabase SQL editor → Claude verifies read-only (11 columns, RLS on, FK cascade, cron job row); (2) **user OK
  to push** (deploys C + A to Render; web builds the unused kits) → `list_deploys` live → prod smoke (plan E5–E7
  incl. the new two-network limiter probe, ≥ 60 s after the smoke) → `curl /api/app-config` shows the 4 keys;
  (3) then **track B** (staging).
- ✅ **Phase 1b H1 + H3 — DONE 2026-10-12.** Plan/brief/verdict: [`plans/phase-1b/`](plans/phase-1b/).
  Implementer (harness 100+31+55+29) → `impl-adversary` PASS-WITH-FIXES (no blockers; code nit fixed; #3 → auth
  F15) → local smoke without credentials 28/28 → commits `6524a59` (H1, `feature/auth@v0.10.0`) + `502164f`
  (H3, `feature/analytics@v0.4.0`, `feature/analytics-v2@v0.2.0`) → **user OK'd push → live on Render**
  (`9f05973`, health 200) → **prod smoke 27/27 PASS** (user ran it; Render logs confirm) → **user verified
  iPhone + Pixel + web** (Summary/Lifestyle load, nobody signed out). Smoke script: Session 1 scratchpad
  `phase1b-smoke.sh` (= plan E2 script; prod default; prompts for the shared testbed password — the same one
  given to App Review). Note for E8: a garbage-token smoke adds `validation_failed`, not
  `refresh_token_not_found`.
- ✅ **D-15 password-reset email (Resend) — DONE 2026-10-12.** Supabase SMTP → Resend live; a real reset was
  Delivered, `/recover` 200 in 324 ms (auth F15: far under the 5 s cap), new password worked. First two keys
  were mis-pasted (535 in auth logs) — gotcha in ENV_RUNBOOK §7b; the user deleted the two unused keys
  (`-3` in use).
- **Done today (verified):** W5 Android Google sign-in fixed in the console (Play-key OAuth client) and
  verified on the Pixel by the user · legacy `RaSi_Fiters_API` suspended (D-16) · Vercel ignore step fixed
  (D-17; first push built READY) · TestFlight 1.4.3 (57) left to lapse (RELEASES.md) · console tour complete —
  findings in ENV_RUNBOOK §7/§7b, CONTEXT.md, CLAUDE.md §MCP Servers (consoles in the built-in browser).
- **Board artifact:** https://claude.ai/artifact/522hPHN9VSp6db6edCyZ3x (private; `db` store collection `board`,
  doc `answers`). HTML source only in Session 1's scratchpad — `Artifact read` before republishing.
- ✅ **H2 — DONE 2026-10-12T19:08:19Z** (user said "go"): one admin-token `PATCH /v1/projects/…/config/auth`
  `{"rate_limit_token_refresh":1500}` → HTTP 200; read-back 1,500 (was 150), SMTP untouched. Revert = same call
  with 150. **Not yet scheduled (from the board):** D-4 Supabase secret API key (user creates; Phase 3).
- **User decisions captured in the walkthrough (→ design board, then SPEC §9 D-rules):**
  - W1-D1 logout scope: "whatever is industry-appropriate" → **per-device sign-out by default; "sign out
    everywhere" only as an explicit action** (Supabase `signOut({scope:'local'})`; global stays for
    password change / account deletion).
  - W1-D2 inactivity limit: **yes** — value to propose on the board (Supabase `sessions_inactivity_timeout`,
    Pro; set via the admin token with the user's per-call approval).
  - W1-D3 multi-tab web use: **rare** → F8 (stale refresh token across tabs) is low priority.
  - W1-D4 auth-setting changes via the full-access token (e.g. forwarded-for, refresh rate limit,
    inactivity timeout): **approved in principle** once on the board — each call still prompts (token-guard).
  - W2 facts confirmed by the user: the reported invitee was member `77cb0e59` (Android) — Phase 3 invite
    09-21, never visible on Android, accepted 09-22 18:37 inside the admin batch; that batch was the user
    acting as global admin *because of* the bug.
  - **POLICY (user, 2026-10-11): no shims for broken behaviour in shipped binaries.** "The app is broken
    now — we expect everyone to update to get a better app." Fixes ship in new builds; old builds are not
    patched server-side (e.g. no `invited`-membership shim for Android 1.0.0). The live-binary rule still
    means *don't make old builds worse by accident*; when a backend change must break them, use the gate.
  - **NEW REQUIREMENT — version gate on iOS + Android** (extends `app-config`, today iOS-only:
    `GET /api/app-config` → `{"min_ios_version":"1.2.0"}`, env `MIN_IOS_VERSION`, non-dismissable modal):
    two levels per platform — **hard minimum** (blocking "Update required" screen) + **soft "latest"**
    (dismissable "Update available" nudge). Android 1.0.0 has no gate and sends no version (default
    `okhttp/4.12.0` UA): new builds send an app-version header; the backend can recognise header-less
    Android and refuse it with an "update from the Play Store" message — **switched on only when a backend
    change needs it** (user choice; not by default).
  - **PRINCIPLE (user, standing): don't over-engineer** — simplest industry-standard option everywhere; when
    the user says "u decide", the board decides with a one-line why (memory `dont-over-engineer`).
  - W3-D1 freshness: **"up to date when I open the app" is the requirement**; background delivery is
    best-effort only.
  - W3-D2 health connection across logout: **delegated → board decides** (simplest correct option).
  - W3-D3 duplicate workouts: **delegated → board decides**; storage is not a constraint (server-side dedup OK).
  - W3-D4 force-quit / Low Power Mode: handle "industry style" (best-effort background, catch up on open).
  - W3-D5 **cap workout duration per day: yes** (two ~58 h rows exist).
  - W3 facts: member `d57dad74` is the user's mother. Her second-app (Strava-like) testing is on a
    **different** RaSi account, so it does NOT explain this account's double-sums → cause stays open among
    F7's others (anchor held past the 45-day ledger, re-saved workouts); server-side dedup by Health sample
    id (W3-D3) covers every cause, so no further digging. "Resumes oddly" = a mix; the user sees the
    **review screen** come back sometimes (→ W3 F4 logout-reset / W4 F5 dismissed review).
  - W4-D1 **provenance flag: yes** — record each log row's source (manual / Apple Health / Health
    Connect) so "who actually syncs" and synced-vs-manual are answerable (old builds → unknown).
  - W4-D2 Android test device: the user has only an Apple Watch → will **enter test data manually** on the
    Pixel (Fitbit app manual logging or Google's Health Connect Toolbox) when Phase 3 testing starts.
  - W4 facts (re-queried): Srividya `255532ac` — no rows 09-17→09-20, next written 09-23 (inside the
    14-day reach → most likely no source data those days); no sync since 10-06. Sanjay `81230fec` — 09-25→
    09-29 have sleep but **no steps** (steps source/permission absent then). Neither is a proven sync bug;
    without provenance + sync-run logs (W6) they can't be told apart.
  - **W5 ROOT CAUSE PROVEN (live logcat, 2026-10-11 19:02):** Google's token server rejects the Play build —
    "This android application is not registered to use OAuth2.0 … package name and SHA-1". No Android OAuth
    client exists in Google Cloud for `com.app.rasifiters` + the Play App Signing SHA-1 (SHA-1s were only in
    Firebase). **Fix = console-only, no app release** (ENV_RUNBOOK §7 "Second cause"); user-side, user's call
    on timing. Code-side issues remain for the board: `GetGoogleIdOption` with no `GetSignInWithGoogleOption`
    fallback, raw Android error text shown. **User will do the console fix later** (pending, user-side).
  - W6-D1 observability budget: **free** — backend structured request logs + **SQL logging off**; no paid
    tools (no Render Pro, no Supabase drain). Client error / event reporting + >7-day trails must therefore
    be free too (board decides: own endpoint + DB tables vs a free tier).
  - W7-D1 **one brand palette = web's** (`#ff8b1f` accent + web's danger red) on all three surfaces.
  - W7-D2 **on refresh failure with prior data: keep the last good data + a slim floating "Couldn't
    refresh — Retry" banner** (stale-while-revalidate); never fake zeros, never blank the page.
  - Board-delegated (decide with a one-line why): on-device cache between launches, Android ViewModel
    migration scope, toasts cross-surface, invite-error feedback (keep privacy for 4xx, show 5xx/timeouts).
- Extra W1 fact verified by the orchestrator: on every refresh the shared backend client
  first loads its *last stored* session (another user's) and, if near expiry, rotates THAT user's token
  server-side (`GoTrueClient.js` `__loadSession` ~L2456-2486) — prod shows 59 such cross-user pairs in 30 d
  (W1 E6), a silent token-drift source for every platform.
- ~~**Two out-of-scope security fixes offered as task chips (user decides; not part of the board):**~~
  **DONE 2026-10-12** (H1 → auth D-C11; H3 → analytics D-C8):
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

1. **Phase 1b — finish:** (a) ~~**H2**~~ **DONE 2026-10-12T19:08:19Z** (429s after this time reflect the new
   1,500 limit — compare against H1's deploy at ~06:25Z separately). (b) **7-day watch from 2026-10-12 →
   ends 2026-10-19** (plan E8 queries): `refresh_token_already_used`/day (baseline ≈ 1.6/day), 429
   `over_request_rate_limit`/day (≈ 1.3/day), Render `[refresh] auth_unavailable|session_invalid` +
   `[auth] token verification unavailable` + `[auth] password reset request failed` counts, cross-user token
   pairs < 200 ms (baseline 59/30 d → expect ≈ 0). Gate to Phase 2 (board §12): reuse kills + 429s drop; no
   cross-user refresh. **Day 0 (2026-10-12 06:25–19:10Z):** refresh 296×200 · 1×400 `validation_failed`
   (smoke) · **0** `refresh_token_already_used` · **0** 429 · **0** cross-user pairs / 300 tokens issued.
2. ~~Finish **D-15**~~ **DONE 2026-10-12.**
3. Start **Phase 2** tracks A–D in parallel (BRIEF §7): observability, staging, version-gate backend, frontend
   kits — each via `multiplex` (plan-pipeline → user approves → implementers in parallel worktrees).

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
| W1 | Sessions / auth | ✅ | ✅ | 1b hotfix (H1) done | partial — H1 live 2026-10-12 |
| W2 | Push + invites | ✅ | ✅ | ⬜ | ⬜ |
| W3 | iOS health sync | ✅ | ✅ | ⬜ | ⬜ |
| W4 | Android health sync | ✅ | ✅ | ⬜ | ⬜ |
| W5 | Android Google sign-in | ✅ | ✅ | 🟨 console fix ✅; button code → Phase 3 | 🟨 sign-in works on Play build |
| W6 | Observability + perf | ✅ | ✅ | ⬜ | ⬜ |
| W7 | Frontend state / error / design consistency | ✅ | ✅ | ⬜ | ⬜ |

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
  user (decisions in "Now"). Design board published (artifact with a `db` answer store), adversary-reviewed,
  **approved**. Console tour in the built-in browser: W5 Google sign-in fixed + verified, legacy API suspended,
  Vercel ignore step fixed, password-reset email gap found → Resend set up (SMTP save pending). Phase 1b plan
  approved; implementer running.
- **2026-10-12** — Phase 1b: H1 (stateless auth proxy + classified refresh/JWT errors, auth 0.10.0) + H3
  (analytics membership gate, analytics 0.4.0 / analytics-v2 0.2.0) adversary-reviewed → deployed → prod smoke
  27/27 + user device check on all 3 surfaces. D-15 Resend SMTP live (real reset delivered). H2 done
  (refresh rate limit 150 → 1,500 at 19:08:19Z). 7-day watch running.

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
