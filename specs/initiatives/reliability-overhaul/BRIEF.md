# Reliability overhaul — initiative brief

> **Status:** scoped 2026-10-10 · Step 0 + Phase 0 + **design board approved 2026-10-11** · **Phase 1b + Phase 2
> done 2026-10-12** · **Phase 3 done 2026-10-13** · **Phase 4 built 2026-10-13** (backend + web live; phones on
> test channels; the user is testing) · **Next:** touch-ups, then ONE store release (`HANDOFF.md`). The approved
> board is the decision record: [`DESIGN_BOARD.md`](DESIGN_BOARD.md).
> Rolling state lives in [`HANDOFF.md`](HANDOFF.md) (read it first when resuming). Decision record: R8 in
> `METHODOLOGY.md`. Durable outcomes graduate into feature SPEC §9 D-rules as each workstream lands.

## 1. Why

The CRUD core of RaSi Fiters works. Everything that runs **while the app isn't open** — session refresh,
push, background health sync, federated sign-in, realtime — is flaky, behaves differently per surface, and
fails **silently**: users can't describe what broke ("I just got logged out"), and nothing records it. The
user wants these made industry-standard, identical in contract across web / iOS / Android, observable, and
fast to iterate on — before any new features land on top. The stack stays (R8).

## 2. Goals

1. **Bulletproof logic** for sessions, push + invites, iOS + Android health sync, Android Google sign-in —
   one written contract per subsystem, implemented the same way on every surface.
2. **Observability** — be able to see what happened for any user: requests, errors, sync runs, pushes.
3. **Consistent frontends** — one loading / empty / error / offline model and shared component idioms per
   surface, so UI iteration is fast and the effort goes into logic.
4. **Worldwide users** (India, Tanzania, USA, …) — cut round trips + cache on device; raise the real
   limiting factors (round trips and visibility, not server capacity).
5. **Safe experimentation** — a staging path (same Supabase project; see §6).
6. **Then features** — notification redesign (more types, preferences, inbox, scheduled/engagement pushes)
   and a light social layer (followers or a program "people" list; privacy model first; tight layouts mean
   page redesigns on all three frontends).

## 3. Evidence baseline (2026-10-10)

**Reported symptoms**

| Symptom | Surface | Notes |
|---|---|---|
| Random logouts | unconfirmed (happens to the user too) | Users can't say when; don't rely on user reports — instrument instead |
| Health sync "disconnects" when the app isn't opened for a while | iOS + Android | Resumes oddly after reopening |
| Invitee got **neither** a push **nor** the in-app invitation → couldn't accept | Android | So it's not only push — check invite creation + the invitee's pending-invites fetch |
| Google sign-in → **"No credentials available"** dialog | Android, Pixel 7 (Android 17) | Screenshot 2026-10-10. **Play Store production build 1.0.0 (4)**, signed in with the user's own Google account |
| Slow, sometimes "doesn't load" | all, worst far from us-east | |

**Production metrics** (Render 30 days + Supabase read-only, to 2026-10-10)
- Healthy core: 2 × HTTP 500 in 30 days, no crashes/restarts/failed deploys; CPU ~0.1% of 0.5 vCPU, RAM
  ~120/512 MB. ~4.5–6k requests/day; 59 accounts, 14–17 members logging weekly; DB 25 MB; **Supabase Pro**.
- **401 ≈ 22% of all requests** — expired tokens: web + Android refresh only *after* a 401 (iOS also
  refreshes on every foreground — corrected by Phase 0 W1). Each app open after >1 h costs 3 sequential round trips first.
- **409: 500–1,200/day** — most likely health-sync re-sending rows the backend already has (rejected as
  duplicates by design, `apps/backend/services/logService.js`).
- **499 (client gave up): 2–12/day** — the closest log signal to "it didn't load".
- Geography: Render `virginia` + Supabase `us-east-1`; API ≈125 ms from Vancouver, est. 250–350 ms per call
  from India (more on mobile data). Screens issue 10–15 calls, some chained.

**Observability gaps:** Render's plan keeps no request logs / latency metric (app logs only); the backend
logs every SQL query (Sequelize) instead of requests; Vercel Hobby keeps ~1 h of logs; Supabase auth logs
+ auth audit log are populated and readable (`tools/supabase-logs.sh`; the "empty" reading was the retired
logs API); no client crash/error reporting on any surface. (Infra facts: `apps/backend/CONTEXT.md`,
`apps/web/CONTEXT.md`.)

## 4. First suspects (unverified — Phase 0 must confirm or refute each with evidence)

| # | Area | Suspect |
|---|---|---|
| S1 | Logouts (iOS) | Two refresh paths not coalesced with each other: `ProgramContext.refreshSessionIfNeeded` (`apps/ios/RaSi-Fiters-App/Shared/Models/ProgramContext+Auth.swift` ~L93, in-memory token) and `APIClient.refreshAccessTokenIfPossible` (`apps/ios/RaSi-Fiters-App/Shared/Services/APIClient.swift` ~L107, keychain token). Supabase rotates refresh tokens; reuse outside the reuse window can revoke the session → `signOut()`. The retry-once block (~L106) hints the race was hit before |
| S2 | Logouts / sync (iOS) | Keychain items use default accessibility (WhenUnlocked) → unreadable during locked background wakes; HealthKit data is also protected while locked; failed observer handlers make HealthKit back off |
| S3 | Sync (Android) | **No background sync exists**: no WorkManager worker, no `READ_HEALTH_DATA_IN_BACKGROUND` — Health Connect syncs only while the app is open |
| S4 | Invites (Android) | Backend emits on invite (`apps/backend/services/inviteService.js` ~L75 → `createNotification` → `sendPushToMembers`), so suspect the device side (FCM token registration, Android 13+ permission, channels, payload type) **and** the invite create/list path, since the in-app invite was also missing |
| S5 | Google sign-in (Android) | Credential Manager `GetGoogleIdOption` + web client ID (`apps/android/app/src/main/java/com/app/rasifiters/ui/auth/GoogleCredential.kt` ~L73). Failing build is the **Play** build (Play App Signing key). `ENV_RUNBOOK.md` §7 records **both** known `NoCredentialException` causes as fixed — Play App Signing SHA-1 registered, consent screen published to Production 2026-07-11 — and the failing account is the user's own (an owner bypasses Testing anyway; confirm it is a `rasi-fiters` GCP owner). So: a regression (publishing status reverted, Android OAuth client changed/deleted) or a third cause. **First move:** `adb logcat` on the Pixel for the underlying Credential Manager / Play services error code, then check GCP → Google Auth Platform → Audience status + Credentials → Android client SHA-1s |
| S6 | Latency (web + Android) | Refresh is 401-reactive only → a burst of 401s + extra round trips on every app open |
| S7 | Realtime (mobile) | The SSE notification stream dies when the app backgrounds; industry pattern = push in background, live connection only in foreground (Supabase Realtime is an in-stack option) |
| S8 | Session policy | **Read 2026-10-10:** `jwt_exp` 3600 s (1 h access tokens) · refresh-token rotation **on** · reuse interval **10 s** · no session time-box or inactivity timeout · multiple sessions per user allowed. So Supabase never times anyone out by policy; a logout needs a refresh failure — and reusing a rotated refresh token more than 10 s later is exactly the S1 race. Phase 0 should find the matching auth-log errors (logs API moved — see HANDOFF) |
| S9 | Error handling | Clients may treat transient failures (timeouts, 5xx, locked keychain) as auth failures and sign out — audit every `signOut` trigger on all three surfaces |

## 5. Cross-cutting requirements (every phase)

- **One contract per subsystem** (session lifecycle, push, sync, sign-in) written once, implemented
  identically on web / iOS / Android; platform idiom (APNs/FCM, HealthKit/Health Connect, SwiftUI/Compose/
  React) is the only sanctioned divergence and must be a called-out D-rule.
- **Every async UI state handled the same way everywhere:** loading, empty, error (human message + retry),
  offline. A shared state + error model per surface so screens are quick to build and iterate.
- **Consistent design across the three frontends** — shared component idioms; logic first, UI follows.
- **Observability built in** — structured request logs, client error reporting, readable event trails for
  sessions, syncs and pushes.
- **Live-binary compatibility** — backend changes degrade gracefully for every binary in `RELEASES.md`;
  backend deploys first.
- **No direct DB writes** — schema/data changes only as numbered migrations in `apps/backend/sql/`.
- **Testing:** the user now owns a real **Pixel 7** (Android 17, USB-debug authorized for this Mac — read-only
  `adb logcat` / `dumpsys` diagnostics are fair game) plus an iPhone, and tests live behavior; compile-checks
  stay the gate (`ios-build` = the user's ⌘B, `android-build`, web `npm run build`).

## 6. Decisions already made

- **Stack stays** — Supabase (Pro) + Render + Vercel. AWS evaluated and shelved (R8).
- **Staging = the same Supabase project, "staging tables"** — no second Supabase project. **Mechanism
  (board §8, approved):** a `staging` Postgres schema with identical table names (R5), a staging-only Postgres
  role, a second Render service `rasifiters-api-staging` on the **free** instance (D-10), staging-only emails +
  a login-change guard (shared `auth.users`), schema-neutral migrations run per schema. Live 2026-10-12 and
  **opt-in** (user): only for risky changes; day-to-day testing stays on live prod.
- **Design board approved 2026-10-11** ([`DESIGN_BOARD.md`](DESIGN_BOARD.md)) — the per-workstream contracts
  (§1–§7), staging (§8), notification + People concepts (§9–§10) and decisions **D-1…D-14** (all as recommended
  except D-10 → free staging). Standing rules from the walkthrough: **don't over-engineer**; **no shims for old
  binaries** (everyone updates; a version gate on iOS + Android blocks old builds only when needed); **free
  observability**; one brand palette = web's.
- **Supabase access = two project-scoped (`rasifiters`) tokens** (user decision 2026-10-10):
  `SUPABASE_ACCESS_TOKEN` = **read-only**, the default for every metric / log / setting / advisor read, no
  prompts; `SUPABASE_ADMIN_TOKEN` = **full access**, used only for deliberate changes (auth settings, staging
  infra) and **every use must prompt the user** (a PreToolUse hook — built in Step 0). Data/schema writes still
  go only through user-run migrations in `apps/backend/sql/`. Tokens can't separate prod from staging inside one
  project, so **prod-vs-staging separation lives at the Postgres-role level**: a staging role granted writes on
  the staging tables only, created by a user-run migration (`sql/008`, live 2026-10-12).
- **API host is hard-coded in live binaries** (`rasifiters-api.onrender.com`, iOS `APIConfig.swift`, Android
  `build.gradle.kts`) — any host/domain change needs an app release + adoption window first.
- **Worldwide = one region + fewer round trips + on-device caching.** Revisit region only with real
  per-country latency data.

## 7. Phase plan (approved 2026-10-11 — board §12)

Done: **Step 0** (token access, `token-guard` hook — 2026-10-11) · **Phase 0** discovery (7 verified briefs in
`discovery/`) · **Phase 1** design board (approved). Each track runs through `multiplex` (scout → plan →
plan-adversary → **user approves** → implementer(s) → impl-adversary → compile-check → `git-version` → user
tests). Tracks inside a phase run **in parallel** (separate worktrees per surface); backend before clients.

| Phase | Parallel tracks | Surfaces | Depends on | Exit gate |
|---|---|---|---|---|
| **1b — Hotfixes** ✅ done 2026-10-12 | **H1** auth hotfix (D-1): stateless proxy for every shared-client call, refresh = one direct `/token` call (5 s timeout, no replay), 503 for transient refresh + JWT-verify failures · **H2** raise `rate_limit_token_refresh` 150 → 1,500 (D-2; one admin-token call) · **H3** analytics membership check (D-3) | backend (+ Supabase setting) | — | Supabase auth logs: reuse + 429 errors drop; no cross-user refresh possible |
| **2 — Foundations** ✅ done 2026-10-12 | **A** observability: structured request log, SQL logging off, `app_events` + `POST /api/client-events` (works signed-out), version headers accepted, CORS preflight cache (migrations straight to prod) · **B** staging: schema + role migration, `rasifiters-api-staging` (free), staging web alias, client env switches, login-change guard, `APNS_PRODUCTION=false` · **C** version gate backend: `app-config` additive fields + `BLOCK_UNVERSIONED_ANDROID` switch (off) · **D** frontend kits: web / iOS / Android in parallel (async state, error vocabulary, banners, offline, palette tokens) | A–C backend · D web+iOS+Android | 1b | Request logs + events live; staging answers; kits compile on all three |
| **3 — Reliability** ✅ 2026-10-13 (backend + web live; iOS 1.5.0 (58) / Android 1.1.0 (5) on test channels, device-tested; store release waits for Phase 4) | **Backend first (parallel):** R1 per-user rate limits (secret key, D-4) + logout `local` / password `others` scopes · R2 sync v2 endpoint + permanent sample ledger + per-sample/per-field provenance migration + bounds (D-7) · R3 invite transaction + `push_deliveries` + device registry (`last_seen`, unauthenticated unregister) + APNs/FCM settings + SSE fixes. **Then one bundled release per surface (parallel implementers):** sessions contract → sync contract (catch-up 30 d, resume, review once) → invites/push (Android inbox) → Google button (Android) → kit adoption on touched screens → version gate UI + soft nudge | backend, then web + iOS + Android | 2 (staging + kits) | User tests on iPhone + Pixel + web — on staging first only for the risky parts (migrations, auth/session; staging is opt-in), otherwise on prod; gate raised once adoption allows |
| **4 — Features** ✅ 2026-10-13 (built + device-tested; backend + web live, People on for web; Android 1.2.0 (7) public; iOS 1.5.2 (61) awaiting App Store approval — `RELEASES.md`). Decisions: [`phase-4/DECISIONS.md`](phase-4/DECISIONS.md); built in three waves (A quick wins + privacy fix · B Notifications + People · C polish #9–#45), binding amendments in `plans/phase-4-*-amendments.md` | Notification redesign (categories, preferences, inbox, local-time scheduler; engagement opt-in) → People layer (program People list, privacy defaults) → **polish pass**: inconsistencies across screens and apps + industry-standard UI/UX improvements of any size (rearranging, additions, a page rebuild), each judged on real benefit vs effort — an audit lists candidates, the user picks (user, 2026-10-13: open to change, no over-engineering) | all | 3 | User tests on iPhone + Pixel + web (`phase-4/TEST-CHECKLIST.md`) |

Every phase closes with a `HANDOFF.md` update + `git-version` commit + push.

## 8. Open questions

Resolved by the approved board (2026-10-11): staging mechanism (§6), error reporting (free: own event tables
+ Xcode Organizer / Play vitals), log retention (event tables, 90 days), notification taxonomy (concept §9),
social model (program People list first). Still open: long-term region (only once per-country latency is
measured from the new request logs).

## 9. Operating model

- The **main session is the orchestrator**: it spawns agents (Explore / `scout` / `planner` / adversaries /
  `implementer`) and workflows, keeps its own context lean, and verifies agent claims against code before
  they reach the board.
- **`HANDOFF.md` is updated at every milestone** (agent results in, decision made, phase closed) so the user
  can `/compact` at any time and a fresh session can resume from it alone.
- Docs stay fresh: anything learned that contradicts a doc gets fixed in its canonical home in the same pass.
