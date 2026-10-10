# Reliability overhaul — initiative brief

> **Status:** scoped 2026-10-10 · **Next:** Session 1 = Step 0 (credentials) → Phase 0 (discovery) →
> Phase 1 (design board). **No app code changes before the user approves the design board.**
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
| Google sign-in → **"No credentials available"** dialog | Android, real Pixel | Screenshot 2026-10-10. Install source (Play vs Android Studio) not yet recorded |
| Slow, sometimes "doesn't load" | all, worst far from us-east | |

**Production metrics** (Render 30 days + Supabase read-only, to 2026-10-10)
- Healthy core: 2 × HTTP 500 in 30 days, no crashes/restarts/failed deploys; CPU ~0.1% of 0.5 vCPU, RAM
  ~120/512 MB. ~4.5–6k requests/day; 59 accounts, 14–17 members logging weekly; DB 25 MB; **Supabase Pro**.
- **401 ≈ 22% of all requests** — expired tokens: web + Android refresh only *after* a 401 (iOS also
  refreshes proactively near expiry). Each app open after >1 h costs 3 sequential round trips first.
- **409: 500–1,200/day** — most likely health-sync re-sending rows the backend already has (rejected as
  duplicates by design, `apps/backend/services/logService.js`).
- **499 (client gave up): 2–12/day** — the closest log signal to "it didn't load".
- Geography: Render `virginia` + Supabase `us-east-1`; API ≈125 ms from Vancouver, est. 250–350 ms per call
  from India (more on mobile data). Screens issue 10–15 calls, some chained.

**Observability gaps:** Render's plan keeps no request logs / latency metric (app logs only); the backend
logs every SQL query (Sequelize) instead of requests; Vercel Hobby keeps ~1 h of logs; Supabase auth audit
log is empty; no client crash/error reporting on any surface. (Infra facts: `apps/backend/CONTEXT.md`,
`apps/web/CONTEXT.md`.)

## 4. First suspects (unverified — Phase 0 must confirm or refute each with evidence)

| # | Area | Suspect |
|---|---|---|
| S1 | Logouts (iOS) | Two refresh paths not coalesced with each other: `ProgramContext.refreshSessionIfNeeded` (`apps/ios/RaSi-Fiters-App/Shared/Models/ProgramContext+Auth.swift` ~L93, in-memory token) and `APIClient.refreshAccessTokenIfPossible` (`apps/ios/RaSi-Fiters-App/Shared/Services/APIClient.swift` ~L107, keychain token). Supabase rotates refresh tokens; reuse outside the reuse window can revoke the session → `signOut()`. The retry-once block (~L106) hints the race was hit before |
| S2 | Logouts / sync (iOS) | Keychain items use default accessibility (WhenUnlocked) → unreadable during locked background wakes; HealthKit data is also protected while locked; failed observer handlers make HealthKit back off |
| S3 | Sync (Android) | **No background sync exists**: no WorkManager worker, no `READ_HEALTH_DATA_IN_BACKGROUND` — Health Connect syncs only while the app is open |
| S4 | Invites (Android) | Backend emits on invite (`apps/backend/services/inviteService.js` ~L75 → `createNotification` → `sendPushToMembers`), so suspect the device side (FCM token registration, Android 13+ permission, channels, payload type) **and** the invite create/list path, since the in-app invite was also missing |
| S5 | Google sign-in (Android) | Credential Manager `GetGoogleIdOption` + web client ID (`apps/android/app/src/main/java/com/app/rasifiters/ui/auth/GoogleCredential.kt` ~L73). `NoCredentialException` causes: signing-cert SHA-1 of the installed build not registered (debug vs upload vs Play App Signing), OAuth consent screen still in Testing (`ENV_RUNBOOK.md` §7), no Google account on device |
| S6 | Latency (web + Android) | Refresh is 401-reactive only → a burst of 401s + extra round trips on every app open |
| S7 | Realtime (mobile) | The SSE notification stream dies when the app backgrounds; industry pattern = push in background, live connection only in foreground (Supabase Realtime is an in-stack option) |
| S8 | Session policy | Supabase Auth refresh-token reuse interval / revoke-on-reuse settings interact with S1 — read them in the dashboard / Management API |
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
- **Testing:** the user now owns a real **Pixel** (Android) plus an iPhone, and tests live behavior;
  compile-checks stay the automated gate (`ios-build`, `android-build`, web `npm run build`).

## 6. Decisions already made

- **Stack stays** — Supabase (Pro) + Render + Vercel. AWS evaluated and shelved (R8).
- **Staging = the same Supabase project, "staging tables"** — no second Supabase project. Mechanism decided
  on the design board; candidate: a separate Postgres schema with identical table names (honors R5 — no
  prefixes). Open: `auth.users` is per-project, so staging test accounts would share prod Auth; whether the
  staging API is a second Render service. A staging path supersedes the "test against live" convention.
- **API host is hard-coded in live binaries** (`rasifiters-api.onrender.com`, iOS `APIConfig.swift`, Android
  `build.gradle.kts`) — any host/domain change needs an app release + adoption window first.
- **Worldwide = one region + fewer round trips + on-device caching.** Revisit region only with real
  per-country latency data.

## 7. Phase plan (proposed — the user approves it on the design board)

| Phase | What | Output |
|---|---|---|
| **Step 0** | **Credentials, no OAuth.** Token-based access to all three services so no session needs a browser login: Render (`RENDER_API_KEY`, already works), Vercel (`VERCEL_TOKEN`), Supabase (`SUPABASE_ACCESS_TOKEN` PAT) — values in gitignored `.claude/settings.local.json` `env`. Verify whether each hosted MCP accepts a Bearer header; otherwise use the CLI/REST with the token. Prove each with a read-only call (Render logs, Vercel logs, Supabase Management API auth settings + logs). Update `CLAUDE.md` MCP section, `.mcp.json`, `.env.mcp.example`, scope-guard hook | Working, documented, no-OAuth access |
| **0 — Discovery** | Read-only, parallel agents, one per workstream: **W1** sessions/auth (all surfaces + Supabase settings) · **W2** push + invites · **W3** iOS health sync · **W4** Android health sync · **W5** Android Google sign-in · **W6** observability + perf baseline · **W7** frontend loading/error/design consistency | One evidence brief per workstream: current behavior with file:line, failure modes, S1–S9 confirmed/refuted, what industry-standard looks like |
| **1 — Design board** | Artifact: per workstream current vs target, the shared contract, decisions for the user; staging mechanism; notification redesign + social layer at concept level | User-approved board → SPEC §9 D-rules |
| **2 — Foundations** | Observability (request logging, client error reporting), staging, shared loading/error primitives per surface | |
| **3 — Reliability fixes** | W1 sessions → W3/W4 sync → W2 push/invites → W5 Google sign-in; `multiplex` per item, per-surface implementers in parallel, backend first | User tests on iPhone + Pixel + web |
| **4 — Features** | Notification redesign (taxonomy, preferences, inbox, scheduled/engagement pushes — App Store rule: promotional pushes need explicit opt-in), then the social layer (privacy model first, then page redesigns) | |

Every phase closes with a `HANDOFF.md` update + `git-version` commit + push.

## 8. Open questions (for the design board)

- Staging mechanism (schema vs. other) and whether a staging Render service is needed.
- Client error reporting tool (Firebase Crashlytics is natural on Android — Firebase already wired for FCM —
  vs. one tool across all three surfaces).
- Render log retention: a log stream/drain vs. in-app request logging only.
- Notification taxonomy, preferences model, and engagement-push policy.
- Social model: followers vs. friends vs. per-program people list; privacy defaults.
- Long-term region (only once per-country latency is measured).

## 9. Operating model

- The **main session is the orchestrator**: it spawns agents (Explore / `scout` / `planner` / adversaries /
  `implementer`) and workflows, keeps its own context lean, and verifies agent claims against code before
  they reach the board.
- **`HANDOFF.md` is updated at every milestone** (agent results in, decision made, phase closed) so the user
  can `/compact` at any time and a fresh session can resume from it alone.
- Docs stay fresh: anything learned that contradicts a doc gets fixed in its canonical home in the same pass.
