# PROGRESS_ARCHIVE.md — condensed run history (historical)

> A concise, one-entry-per-run chronological record of the RaSi Fiters rebuild (2026-06-28 → present):
> each run's date, headline, and gist. **Append-only history — not auto-loaded.** For current phase +
> next action, read `PROGRESS.md`; for release-channel state, `RELEASES.md`; for the load-bearing decisions,
> the SPECs. Full per-run detail lives in the git history of `PROGRESS.md` (condensed from a 2,545-line
> session log on 2026-06-30, and again on 2026-08-20 when the finished-phase narrative moved here). Some
> entries reference the legacy app + the removed one-time migrator as they were written — kept as the audit
> trail.

## Run history (newest first)

- **2026-08-20** — **Play Store truth pass — the landing page finally says Android is out.** Android had been
  public since 2026-08-06 but `rasifiters.com` still showed a dead "Coming soon" Google Play pill. Flipped it
  to a live link with styling identical to the App Store pill (landing SPEC **0.1.3**, D-LAND-3 rewritten,
  **F-LAND-3 closed**); added `PLAY_STORE_URL` to `content.ts` and made `layout.tsx` import both store URLs
  instead of re-declaring one, so the `SoftwareApplication` JSON-LD `sameAs` now carries both listings. Same
  pass: added the missing Android/Play + FCM infra lines to `CONTEXT.md`, de-duplicated `RELEASES.md`'s
  current-binaries notes, and condensed `PROGRESS.md` (the finished Android Phase A→J / iOS-train narrative
  moved here; its stale "Resume at Phase H" next-action was deleted).
- **2026-08-15** — **Android production release recorded + versionCode pre-bumped to 5.** User announced the
  2026-08-06 Play production go-live; `RELEASES.md` + `PROGRESS.md` flipped to "public on all four surfaces".
  Pre-bumped `versionCode` 4→5 (`apps/android/app/build.gradle.kts:41`) since Play rejects re-uploads at a
  consumed build. Also closed the pre-cutover backend smoke-test item as obsolete (superseded by ~7 weeks of
  production traffic), carrying out its one residual as a standing risk note (`DELETE /api/auth/account`).
- **2026-08-06** — **🚀 ANDROID IS PUBLIC — first Play Store production release LIVE; all four surfaces are
  now shipped to the public.** Closed-testing build 1.0.0 (4) promoted from the library (no new upload),
  approved, 100% rollout to 176 countries + rest of world (managed publishing off → live on approval). No
  code change. Console at announcement: 6 installs, 13 monthly active devices.
- **2026-08-03** — **Play production access granted, then the first production release submitted.** The
  2026-07-28 application cleared review; build (4) was promoted to production (release name "4 (1.0.0)"),
  full rollout, and entered app review.
- **2026-07-28** — **Applied for Play production access.** The 14-day / 12-tester closed-test gate cleared, so
  the three-step access form was submitted (closed-test recruitment + audience + readiness answers).
- **2026-07-20** — **iOS 1.4.2 (56) approved → current public App Store release; 1.4.3 (57) cleared Beta App
  Review** on external TestFlight, so later builds of that train distribute near-instantly. 1.4.2 train closed.
- **2026-07-17** — **iOS 1.4.2 (56) submitted for App Store review** (carrying the iPad/Mac pass + new 13"
  iPad screenshots) and **1.4.3 (57) uploaded as the ahead-train** external-TestFlight build; the 1.4.2
  TestFlight builds (55/56) were removed from testing.
- **2026-07-16** — **iOS large-screen (iPad / Mac "Designed for iPad") adaptive-column pass — 100% screen
  coverage, compile-green, user live-verified phase-by-phase.** Presentation-only, iOS-only (no behavior/API
  change → live binaries unaffected). New `AdaptiveLayout` enum + `.adaptiveColumn(max:)`
  (`apps/ios/RaSi-Fiters-App/Shared/Extensions/View+AdaptiveLayout.swift`): `formMaxWidth` 520,
  `contentMaxWidth` 700 — both wider than any iPhone, so compact rendering stays pixel-identical. 37 files
  touched + 1 new. **Load-bearing rule (memory `ios-large-screen-column-rules`): cap the CONTAINER
  (List/ScrollView), never per-row content** — row caps leave swipe reveals/slide animations at the window
  edge; grouped Lists capped narrower than the window need a matching `systemGroupedBackground` backdrop;
  sheets are exempt, fullScreenCovers are not.
- **2026-07-15** — **Active Days became the PRIMARY member-metrics stat — `member-analytics` v0.4.0 (D-C7),
  shipped + user-verified on all three clients.** First user-feedback-driven (deliberate, not faithful-as-is)
  change post-rebuild: Active Days and Workouts traded places in every primary slot; Member Performance
  Metrics default sort → `active_days`; backend default `sort` flipped (semantic only — every shipped binary
  passes `sort` explicitly). Built via the **multiplex pipeline** (Run 2); two-push backend-first deploy,
  tagged `feature/member-analytics@v0.4.0`.
- **2026-07-11** — **Android Continue-with-Google fixed for ALL Play testers — an ops fix, no code/binary
  change.** Closed-testing users hit "No credentials available" on Continue with Google. Root cause was
  neither SHA-1 nor code: the **Google Auth Platform → Audience** consent screen sat in *Testing* with 0 test
  users, so only project owners could obtain a credential. Fix = publish the consent screen to **Production**
  (instant; only basic `email`/`profile`/`openid` scopes, so no Google verification review). Durable capture:
  **`ENV_RUNBOOK.md` §7** + memory `google-signin-consent-screen-gotcha`.
- **2026-07-10** — **Account-settings link/unlink Google (+ Apple on iOS) + add-password shipped — `auth`
  v0.9.0.** Net-new "Sign-in methods" section on each account screen; four additive authenticated routes
  (D-C10). **R1 preserved:** link = session-bound GoTrue `linkIdentity` binding an ephemeral client to the
  caller's OWN Supabase user → no OAuth redirect, no second `auth.users` row, `/oauth`'s D-C8 409 untouched.
  Requires Supabase **Manual linking** (user-enabled). Apple link/unlink is iOS-only. Built via the multiplex
  pipeline; user live-tested on all three platforms. Tagged `feature/auth@v0.9.0`; memory
  `link-unlink-account-settings-shipped`.
- **2026-07-10** — **Signup wizard + Google/Apple federated sign-in shipped — `auth` v0.8.0.** Create Account
  became a 3-step no-scroll wizard on all three clients, with Continue-with-Google (all) + Sign-in-with-Apple
  (iOS) and custom dark-pill buttons. R1 preserved (native `id_token` / web auth-`code` → `/api/auth/oauth` →
  Supabase `signInWithIdToken`; new `/oauth/complete` for new social users; **409** on same-email collision).
  Load-bearing detail incl. the iOS GoogleSignIn-9.2.0 nonce quirk: `auth` SPEC §9 D-C8/D-C9 + memory
  `federated-signin-shipped`.
- **2026-07-08** — **Android port COMPLETE — the 4th surface (`apps/android`), phases A→J, all build-green.**
  A faithful 1:1 Compose port against the same backend contract: **A** foundation (Gradle/DI/state hub,
  Keystore-backed session, Retrofit + 401 authenticator, M3 theme) · **B** auth path · **C** program-picker
  (+ net-new D-N1 drag-to-reorder + floating search) · **D-landing** Summary dashboard · **D-details** 5
  Summary forward targets (log-workout/log-health forms + activity/distribution/workout-types drill-downs) ·
  **E** Members tab + all 8 detail screens · **F** Lifestyle tab + timeline + workout-types manager · **G**
  Program tab + 6 settings/admin sub-routes · **I** notifications (okhttp-sse in-app stream + FCM push;
  backend gained a `firebase-admin` sender + a `platform` param defaulting to `"ios"` so the live iOS binary
  was unaffected) · **H** Health Connect (the iOS `apple-health` feature re-expressed on Health Connect —
  Changes API as the anchor analog, rolling 14-day sleep window, D-S5/D-CONF/D-LOCK/D-SUM/D-SIL ported 1:1;
  deviation **H-1**: no HealthKit-style background delivery, sync on app triggers) · **J** de-scaffold
  (`StubScreen.kt` deleted; zero placeholders remain). User live-tested each phase on the Pixel_8 and signed
  off. One device-test bug worth remembering: kotlinx.serialization omits **default-valued** properties, so
  `platform = "android"` was dropped and the token stored as `'ios'` — fixed by making it a required field.
  Thin per-screen SPECs under `specs/pages/android/`; phase list + decisions in `apps/android/CONTEXT.md`.
- **2026-07-06** — **The GitHub repo went public** (memory `repo-is-public`); the pre-public health check
  found no tracked secrets.
- **2026-07-05** — **First-3-surface ship tail closed:** iOS on TestFlight (approved, in beta use), web LIVE
  on `rasifiters.com`, backend LIVE on Render. `APNS_PRODUCTION=true` verified on Render.
- **2026-07-01** — **Merged the two Summary workout-add entry points into one multi-row "Add workouts" form (web + iOS).** Removed the single "Add workout" + admin-only "Bulk add" cards/forms; the unified multi-row form now posts to `POST /workout-logs/batch` for everyone — **`workout-logs` D-C8** relaxes batch auth so a plain member may batch-log **their own** rows (member column hidden, each row seeded to self); admin/logger keep the per-row member picker. All-or-nothing duplicate rejection unchanged; widgets untouched. Deleted `LogWorkoutForm`/`BulkLogWorkoutForm` → `LogWorkoutsForm` (web); `AddWorkoutDetailView`/`BulkAddWorkoutDetailView` → `AddWorkoutsDetailView` (iOS). `tsc` ✓, iOS `BuildProject` ✓ (0 errors). SPECs: `workout-logs`→0.3.0 (D-C8), web `summary`→0.2.0, iOS `log-workout`→0.2.0.
- **2026-06-30 (run 65)** — **Ported the 2 iOS widget entry views → the iOS DEFERRED LAYER IS CLOSED.** `question-asker` on the last 2 deferred stubs (`QuickAddWorkout`/`QuickAddHealthWidgetEntryView`, the Home-Screen widget deep-link targets).
- **2026-06-30** — **Web polish + live-test fixes (post-launch side-quests; web surface stays CLOSED → next is `ios`).** Three user-reported fixes against the LIVE site, all committed + deployed + manually verified by the user: **(1) Profile page (`/program/profile`) gender fix + net-new email change** (commit `e4712d5`; **members→0.3.0**, **auth→0.5.0**,…
- **2026-06-29 (pm-10)** — **Specced + ported the `program` page (10th web page) — the FOURTH & LAST WORKSPACE TAB (`/program`), the program settings hub. All 4 workspace tabs now live; the landing layer is complete.** `question-asker` run 24.
- **2026-06-29 (pm-9)** — **Specced + ported the `lifestyle` page (9th web page) — the THIRD WORKSPACE TAB (`/lifestyle`), the workout-type-analytics / health-timeline overview.** `question-asker` run 23.
- **2026-06-29 (pm-8)** — **Specced + ported the `members` page (8th web page) — the SECOND WORKSPACE TAB (`/members`), the per-member overview / "view as" dashboard.** `question-asker` run 22.
- **2026-06-29 (pm-7)** — **Specced + ported the `summary` page (7th web page) — the FIRST WORKSPACE TAB (`/summary`), the program-overview dashboard + the desktop log-form write path.** `question-asker` run 21.
- **2026-06-29 (pm-6)** — **Specced + ported the `programs` hub (6th web page) — the FIRST PROTECTED route — and RESOLVED the standing `middleware.ts` HS256→ES256 open question.** `question-asker` run 20.
- **2026-06-29 (pm-5)** — **Specced + ported the `create-account` page (5th web page) — the public/auth path (splash → login → forgot → reset → create-account) is now COMPLETE.** `question-asker` run 19.
- **2026-06-29 (pm-4)** — **Specced + ported the `reset-password` page (4th web page, 2nd net-new) + the NET-NEW backend `POST /auth/reset-password` (auth 0.3.0→0.4.0); the auth-recovery path is now END-TO-END.** `question-asker` run 18.
- **2026-06-29 (pm-3)** — **Specced + ported the `forgot-password` page (3rd web page, the FIRST net-new one) + the NET-NEW backend `POST /auth/forgot-password` (auth 0.2.0→0.3.0).** `question-asker` run 17.
- **2026-06-29 (pm-2)** — **Specced + ported the `login` page (2nd web page spec) + established the auth-recovery path plan.** User opened by mandating the auth follow-up set: Supabase Auth was chosen for easy self-service recovery, so login/sign-up/account pages must GAIN forgot/reset-password (web first, then iOS), with a **dual** forgot-password (emailed rese…
- **2026-06-29 (pm)** — **Phase 3 (`web`) STARTED — ported the web foundation scaffold + it builds green.** Backend feature coverage having closed (14 features), began the web phase.
- **2026-06-29 (am-6)** — **Specced + ported `app-config` — the 14th and LAST backend feature; backend feature coverage is now COMPLETE.** First confirmed (per the carried Next-action) what remained of `app-config`/push: **nothing to port** — `GET /api/app-config` was already inline + byte-identical in `server.js`; the push/APNs device lifecycle (`PUT`/`DELETE /api/notifica…
- **2026-06-29 (am-5)** — **Specced + ported the `member-analytics` feature.** (13th feature — the per-member analytics surface; **its own file pair**, not the analytics/analytics-v2 pair).
- **2026-06-29 (am-4)** — **Specced + ported the `analytics-v2` feature.** (12th feature — the v2 half of the shared `routes/analytics.js`/`analyticsService.js` file pair; the file pair is now whole, like the logs + workout services).
- **2026-06-29 (am-3)** — **Specced + ported the `analytics` (v1) feature.** (11th feature — the program-level read-aggregation API; the `v1Router` half of the shared `routes/analytics.js`/`analyticsService.js`).
- **2026-06-29 (am-2)** — **Specced + ported the `daily-health-logs` feature.** (10th feature — the OTHER half of the shared `routes/logs.js`/`services/logService.js` file pair).
- **2026-06-29 (am)** — **Specced + ported the `workout-logs` feature.** (9th feature — the workout-logging write surface, and the `workoutLogRouter` half of the shared `routes/logs.js`/`services/logService.js`).
- **2026-06-28 (pm-15)** — **Specced + ported the `program-workouts` feature.** (8th feature — the program-scoped other half of the shared `workoutService.js`).
- **2026-06-28 (pm-14)** — **Specced + ported the `workouts` feature.** (7th feature — the global workout library).
- **2026-06-28 (pm-13)** — **Wired the two deferred 501 delete cascades.** (`members DELETE /:id` + auth `DELETE /account`) now that program-memberships/invites/notifications are ported.
- **2026-06-28 (pm-12)** — **Specced + ported the `invites` feature.** (6th feature — the co-mounted other half of `/api/program-memberships`).
- **2026-06-28 (pm-11)** — **Specced + ported the `notifications` feature.** (5th feature — **the keystone**).
- **2026-06-28 (pm-10)** — **Specced + ported the `program-memberships` feature.** (4th feature).
- **2026-06-28 (pm-9)** — **Specced + ported the `programs` feature.** (3rd feature).
- **2026-06-28 (pm-8)** — **Specced + ported the `members` feature.** (2nd feature).
- **2026-06-28 (pm-7)** — **Deployed the auth backend to Render + verified it live.** User provisioned the Blueprint (`apps/backend/render.yaml`) and connected GitHub auto-deploy; service `rasifiters-api` (`srv-d90tgmv7f7vs73cudptg`) live at `https://rasifiters-api.onrender.com`.
- **2026-06-28 (pm-6)** — **Switched the backend host Railway → Render.** (user decision; METHODOLOGY R7).
- **2026-06-28 (pm-5)** — **Ported the backend foundation + `auth` feature.** into `apps/backend/`.
- **2026-06-28 (pm-4)** — **Specced the backend `auth` feature.** (first SPEC in the repo) via `question-asker`.
- **2026-06-28 (pm-3)** — **Ran the migration against live Supabase.** User applied `apps/backend/sql/001_schema.sql` + reset the DB password + handed over creds; filled `tools/migrator/.env`.
- **2026-06-28 (pm-2)** — **Built the migrator + faithful schema.** Mapped the live legacy schema via `pg_dump --schema-only` (richer than the Sequelize models: real CHECKs, `programs.created_by NOT NULL`, composite FKs, partial unique index; found `auth_identities`/`email_verification_tokens` empty + `l…
- **2026-06-28 (pm)** — **Provisioned Supabase.** Created a new org `RaSi Fiters` (`lxehyprifvuozciizlem`) + project `rasifiters` (ref `kpadxjekpiwfkqcxtrio`, `us-east-1`, ACTIVE_HEALTHY) via the Supabase CLI (upgraded 2.67→2.108 to fix the broken `--region` enum; trusted the `supabase/…
- **2026-06-28** — Scaffolded the ICM repo from higgins-master; then restructured to fit RaSi: dropped `companies/` → `apps/`; split specs into `specs/features/` + `specs/pages/` (with role-based view rules); removed the `stitch` skill (faithful direct por…
