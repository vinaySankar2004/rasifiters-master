# PROGRESS.md — Current State & Next Action

> **Read this FIRST every session.** The single source of truth for *where we are* and *what's next*.
> Cross-session loop: start → read this → work → at session end, update this file + commit (via
> `git-version`). A condensed run history (2026-06-28 → 2026-06-30) is in **`PROGRESS_ARCHIVE.md`**
> (one line per run, not auto-loaded); full per-run detail lives in this file's git history.

## Current phase

**ACTIVE WORKSTREAM (2026-07-08): Android port — the 4th surface (`apps/android`).** A faithful 1:1
Compose port of the same app against the same backend contract. Plan approved; phased scaffold→port→
de-scaffold sequence (A→J). **Phase A (foundation) + Phase B (auth path) + Phase C (program-picker) +
Phase D-landing (Summary dashboard) + Phase D-details (5 Summary forward targets) + Phase E (Members tab +
all 8 detail screens) COMPLETE — all build green.** Next = **Phase F** (Lifestyle tab + details). Full plan
+ decisions are in `apps/android/CONTEXT.md`
and the approved plan (`~/.claude/plans/immutable-jingling-hamming.md`). v1 scope = all screens + SSE
notifications + auth + Health Connect + FCM push; widgets deferred. Specs = thin port-notes per screen
(`specs/pages/android/`).

_(Prior milestone — still true:) Rebuild COMPLETE + SHIPPED across the first 3 surfaces: iOS on TestFlight
(approved, in beta use — user-announced 2026-07-05); web LIVE; backend LIVE. Remaining tail: go-public on
GitHub + pre-cutover smoke tests (below)._

- **`android`** — 🟡 **Phase E DONE (2026-07-08).** The **Members tab (Tab 2)** + **all 8 detail screens**
  are ported + green (`ui/members/{MembersScreen,MemberCards,MemberSimpleDetails,MemberMetricsDetailScreen,
  MemberRecentDetailScreen,MemberHealthDetailScreen,MemberManagementScreens,MemberDetailShared}.kt`). Tab
  body is role-bifurcated on `isProgramAdmin`: **admin/global-admin** get an Invite glass button, a Member
  Metrics preview card, a **View as** picker (global-admin gets "None"; program-admin auto-selects self) +
  the 5 member cards; **logger/member** see own Overview/Metrics/History/Streak + Recent/Health, loggers
  get a logs-only view-as. Inner screens: **metrics table** (search + Sort sheet 9 fields + Filter sheet
  All/Custom-date + min/max ranges, server-driven re-fetch, CSV export); **Workout History** (W/M/Y/P
  single-series chart); **Streak Stats** (tiles + ✓-affordance milestone ladder); **View Workouts** +
  **View Health** write surfaces (per-row ⋮ Edit/Delete + sort/filter + CSV; `admin_only_data_entry` lock
  hides mutations for non-admins); **Invite** (privacy-safe swallow-as-success), **roster** (searchable;
  global-admin rows tap → editor), **member editor** (joined-date + active toggle + Remove). `net` gained
  the member DTOs (metrics/history/streaks/recent/health/membership) + 12 endpoints (incl. DELETE-with-body
  + a metrics `@QueryMap`); `ProgramContext` gained `isProgramAdmin`/`loggedInUserProgramRole`, a focused-
  member slot, 8 loaders + 7 write actions (health-update uses a `JsonObject` body so explicit-null clears
  survive `explicitNulls=false`). Added a **FileProvider** (`res/xml/file_paths.xml`) for CSV export.
  Android-idiom deviations: per-row ⋮ menu (not swipe); minutes filter fields; the invite/roster/editor
  cluster (nominally Program-tab/Phase G) lit up now for the Members entry points. Thin SPECs under
  `specs/pages/android/`. `./gradlew :app:assembleDebug` = BUILD SUCCESSFUL. Next: **Phase F (Lifestyle)**.

  _(Phase D-details, 2026-07-08:)_ The **5 Summary forward targets** are ported +
  green (were `StubScreen`): the **log-workout** + **log-health** multi-row forms and the **activity /
  distribution / workout-types** chart drill-downs (`ui/summary/{LogWorkoutScreen,LogHealthScreen,
  ActivityDetailScreen,DistributionDetailScreen,WorkoutTypesDetailScreen}.kt` + shared `DetailChrome.kt` /
  `ChartPrimitives.kt`). Log forms: up-to-200-row batch (`POST /workout-logs/batch`) with per-row member
  picker (admin/logger) vs hidden-self (member), empty-skip / invalid-block, per-row backend `rowErrors`
  highlighting, lock mount-guard, success → `summaryRefreshToken` refresh; health form: sleep 0:00–24:00 +
  at-least-one-metric gate, clearable diet. Drill-downs (read-only): activity **W/M/Y/P** period selector
  (re-fetch per period) + daily-average header + iOS-style **x-axis label thinning** + a polished shared
  **tap/drag tooltip** (bold title, color-dotted rows, caret, shadow) on the activity + distribution charts;
  workout-types %-share chart + full breakdown. `ProgramContext` gained `canLogForAnyMember`,
  `loggedInMemberId/Name`, `summaryRefreshToken`, `loadProgramMembers/Workouts`, `addWorkoutLogsBatch`,
  `addDailyHealthLog`, `loadActivityTimeline(period)`; `net` gained the member/workout lookup DTOs, the batch
  + daily-health request/response DTOs, and `rowErrors` on `ErrorBody`/`ApiException`. 5 thin SPECs under
  `specs/pages/android/`. `./gradlew :app:assembleDebug` = BUILD SUCCESSFUL. Next: **Phase E (Members tab)**.

  _(Phase D-landing, 2026-07-08:)_ The **Summary dashboard** (Tab 1 of the shell) is
  ported + green: `ui/summary/{SummaryScreen,SummaryCards,SummaryCharts}.kt`. Program-progress ring (server
  `progress_percent` + client date math) + status pill; MTD Participation / Total Workouts / Total Duration /
  Avg Duration metric cards (change badges); Canvas activity-timeline (bars + active-members line) +
  distribution-by-day (7 bars) charts; Top Workout Types (top 5 + Others, dot palette); the two gradient
  action cards. Web-parity error banner (D-C1) + `admin_only_data_entry` data-lock banner + dimmed cards
  (D-C2). `ProgramContext` gained `summary`/`summaryLoading`/`summaryError` + `dataEntryLocked` +
  `loadSummary()` (7 analytics reads); `net` gained 7 analytics DTOs + `SummaryData` + 7 GET endpoints; theme
  gained secondary accents + `ChartPalette`/`workoutTypePaletteColor`. Android-idiom deviations A-1..A-4 (no
  card reorder; signed-in-user avatar per web; ProgramDTO progress source; Canvas charts). The 5 forward
  targets (activity/distribution/workout-types detail + log-workout/log-health forms) are `StubScreen` routes
  per the iOS D-SCOPE. Thin SPEC `specs/pages/android/summary/`. `./gradlew :app:assembleDebug` = BUILD
  SUCCESSFUL. Next: **Phase D details.**

  _(Phase C, 2026-07-08:)_ The **program-picker** (signed-in home / "My Programs")
  is ported + green: `ui/programs/{ProgramPickerScreen,AccountMenuSheet}.kt`. Program cards (status pill +
  date range + members/invite line + progress bar), client `canOpen`/`canManage` role gating, inline invite
  Accept/Decline/Cancel, delete (Android-idiom overflow ⋮ menu + confirm), the inline account sheet
  (`ModalBottomSheet`: profile/change-password/appearance/notifications/health-connect/privacy/support/
  sign-out), floating "+" with a pending-invite badge, the D-C1 error banner, and the D-N1 net-new
  **long-press drag-to-reorder** (`PUT /programs/order`, optimistic + revert) + **floating search**.
  `ProgramContext` gained programs/activeProgram state + `loadPrograms`/`moveProgram`/`persistProgramOrder`/
  `deleteProgram`/`respondToInvite`/`selectProgram`; new `ProgramDTO` + order/membership DTOs + 4 endpoints.
  `RootScreen` now routes token→**picker**→shell (first authenticated screen — exercises the Bearer header +
  401 authenticator + `GET /auth/me` self-heal live). Thin port-note `specs/pages/android/program-picker/`
  (deviations A-1..A-4). Forward-nav (create/edit, account destinations) deferred per iOS D-SCOPE.
  `./gradlew :app:assembleDebug` = BUILD SUCCESSFUL. **Phase B (2026-07-08):** logged-out auth path
  (splash/login/create-account/forgot-password), 4 auth stubs deleted. **Phase A (2026-07-08):** foundation —
  Gradle project, DI, state hub, Keychain-analog session, Retrofit/OkHttp + 401 authenticator, Material 3
  theme, bottom-nav scaffold. `android-build` skill = the pure-CLI compile loop (no MCP). Next: **Phase D** —
  Summary tab + details.

- **`backend`** — DEPLOYED + LIVE on Render (`rasifiters-api`, `https://rasifiters-api.onrender.com`); auth
  round-trip verified live against migrated data. All backend features ported (`specs/features/REGISTRY.md`).
- **`web`** — COMPLETE + LIVE on `https://rasifiters.com` (Vercel `rasifiters`, git auto-deploy on `main`).
  34 page SPECs (legacy-parity + the net-new `forgot-password`/`reset-password` recovery pages); signed-in
  proxy round-trip user-verified live (profile edit, email change, password recovery).
- **`ios`** — CODE-COMPLETE (runs 50→74). All screens + widgets + Apple Health auto-sync (workouts **+ sleep**,
  the latter net-new in `apple-health` 0.2.0 → `daily_health_logs.sleep_hours`, no backend/migration change)
  ported; the deferred-stub layer is closed (no stubs remain). Native build GREEN via the `xcode` MCP. 31 iOS
  screen SPECs. `apple-health` polished to **0.6.0** (2026-07-05): per-program date-window scoping (0.3.0),
  gated first-sync confirmation (0.4.0), admin-lock-aware sync (0.5.0), and the two user-reported sync
  fixes (0.6.0): **sum-on-conflict** — same-type later-in-the-day workouts now add minutes to the day's
  row via the new `on_duplicate:"sum"` flag on `POST /api/workout-logs` (`workout-logs` 0.4.0 D-C9, the
  one backend change; client `HealthKitAppliedLedger` guarantees replay idempotency) — and **silent
  auto-retry** — the "sync failed" banner is gone; failures surface as a passive settings caption + an
  inline Sync Now error (D-SIL). Visual/runtime verification is the user's, in Xcode — memory
  [[ios-user-verifies-builds-visually]].
- **Data/auth** — Supabase (`kpadxjekpiwfkqcxtrio`) provisioned; schema + 48/48 members migrated (bcrypt
  hashes imported, no resets). The one-time migrator was removed post-cutover.
- **Legacy detachment (2026-06-30)** — the repo now stands alone: SPEC `Reference impl` headers → `Provenance`
  (no live legacy paths), mission framing past-tense, `tools/migrator/` deleted, the `additionalDirectories`
  instruction dropped. App code under `apps/` is the sole source of truth; `PROGRESS.md` slimmed (log → archive).

## Next action

> ### ⏭️ ANDROID PORT — Phase E (Members tab + details). Say "continue" to resume.

**Phase D-details (5 Summary forward targets) is DONE + green** (2026-07-08): the **log-workout** +
**log-health** forms and the **activity / distribution / workout-types** chart drill-downs replace the 5
`StubScreen` routes in `ui/shell/AppScaffold.kt`. Faithful to the iOS/web SPECs (thin Android SPECs written).
Log forms POST `/workout-logs/batch` + `/daily-health-logs` (per-row member picker for admin/logger vs
hidden-self for members; lock mount-guard; per-row `rowErrors` highlighting; success → `summaryRefreshToken`
refresh). Drill-downs are read-only: activity **W/M/Y/P** period selector + daily-average header + iOS-style
x-axis label thinning + a polished shared **tap/drag tooltip** (bold title, color-dotted rows, caret, shadow);
distribution 7-bar + tooltip; workout-types %-share + full breakdown. **User live-tested the charts on the
emulator (light + dark) and signed off**; the log forms are the user's remaining manual pass. `android-build`
= BUILD SUCCESSFUL (Run 5). _(Phase D-landing before this was DONE + LIVE-TESTED; neutral M3 surface ramp +
nav icon parity landed — memory [[android-neutral-m3-surface-roles]].)_

Resume at **Phase E** — the **Members** tab (admin + standard variants) + its detail routes (member
history / streaks / workouts / health), matching the iOS/web `members` SPECs. Then Lifestyle + Program tabs
and settings sub-routes (Phases F→H), notifications/SSE + FCM (Phase I), Health Connect + de-scaffold
(Phase J). Gate every screen with the `android-build` skill; write thin SPECs under `specs/pages/android/`.
Phase list A→J is in `apps/android/CONTEXT.md`.

---

> ### ⏭️ (Parallel tail, first 3 surfaces) TestFlight SHIPPED (2026-07-05) — remaining: go-public + pre-cutover smoke tests

Repo is standalone at `~/Desktop/rasifiters-master`. Ship checklist (7 = the one open step):

1. [x] **Move the repo** → `~/Desktop/rasifiters-master` (standalone; legacy no longer a sibling).
2. [x] **Run migration `apps/backend/sql/004_seed_healthkit_workout_types.sql` on Supabase** — done by user.
3. [x] **iOS HealthKit + Background capabilities** — CONFIRMED already present in the project config (not a
   pending to-do): `RaSi-Fiters-App.entitlements` carries `com.apple.developer.healthkit` +
   `com.apple.developer.healthkit.background-delivery`; `Info.plist` carries `UIBackgroundModes=[fetch]` plus
   the two `NSHealth*UsageDescription` strings. Still user-side in the developer portal / App Store Connect:
   enable HealthKit on the App ID (if not already), on-device test (Simulator has no HealthKit), App Store
   privacy config.
4. [x] **Flip `APNS_PRODUCTION=true` on Render — DONE (verified 2026-07-05).** Value confirmed `true` via
   `tools/render-env.sh get`; a redeploy was triggered the same day to guarantee the live process carries it
   (env-var flips via REST don't auto-redeploy). Note: even unset, the code falls back to
   `NODE_ENV === "production"` (`apps/backend/utils/pushNotifications.js`), so production APNs was already
   the effective mode.
5. [x] **Bump the iOS version/build** — done by user at archive time.
6. [x] **Archive + upload → TestFlight — DONE.** Approved and **in beta use** (user-announced 2026-07-05).
   The LIVE iOS binary is now the TestFlight beta — backend changes must degrade gracefully for it
   (memory: ios-live-binary-compatibility). **Second push SHIPPED same day: 1.3.1 (46)** — carries
   apple-health 0.6.0, program reorder/search 0.2.x, autocapitalization; same-version builds skip beta
   review (auto-approved, live to the external Beta Testers group in minutes — memory:
   testflight-versioning-convention). **LIVE binary = 1.3.1 (46).**
7. [ ] **Pre-cutover backend smoke-tests** (batched; needs a live admin JWT the user supplies) if not already
   covered by the web signed-in round-trip.

## Build sequence

1. [x] Scaffold the ICM repo — 2026-06-28
2. [x] Provision infra — Supabase + Render + Vercel LIVE (2026-06-28/29)
3. [x] Migrate data + auth to Supabase — 2026-06-28 (migrator since removed)
4. [x] `backend` — all features ported + deployed + auth verified live
5. [x] `web` — all pages ported + deployed + LIVE on `rasifiters.com`
6. [x] `ios` — all screens/widgets/Apple-Health ported; native build green (user does visual + TestFlight)
7. [x] Cutover — web domain LIVE; iOS on TestFlight (approved, in beta) — 2026-07-05
8. [~] `android` — 4th surface (Compose port). Phase A foundation + Phase B auth path + Phase C
   program-picker + Phase D-landing (Summary dashboard) + Phase D-details (5 Summary forward targets) green
   (2026-07-08); Phases E→J pending.

## Coverage

- Features: **15** (backend coverage complete) — `specs/features/REGISTRY.md` + `registry.json`.
- Web page SPECs: **34** · iOS screen SPECs: **31** · Android screen SPECs: **11** (thin port-notes) —
  `specs/pages/REGISTRY.md`.
- Legacy-parity coverage: `COVERAGE.md`.

## Open items (carry until resolved)

- **Member identity self-heal (2026-07-07)** — fixed a web bug where a member with an empty `session.user.id`
  (never re-derived after login; no `id` claim in the Supabase JWT) was blocked from logging workouts
  ("You can only log workouts for yourself.") and saw a **blank Members tab** (own cards gated on that id).
  Fix: net-new **`GET /api/auth/me`** (`auth` SPEC D-C7, additive/safe for the LIVE iOS binary) + the web
  `AuthProvider` calls it on load to make the id authoritative/self-healing + a log-form guard. Backend =
  correct throughout; both symptoms were web-only. **Immediate user workaround: sign out + back in.**
  Also hardened the **iOS** `StandardMembersTab` to render its member cards unconditionally (each has its own
  empty state) so a member never sees a fully blank tab — **ships in the next TestFlight build** (build-number
  bump only). Deploy order: backend (`/me`) first, then web; iOS on the next archive.


- **Re-auth the Render + Vercel MCPs** — both OAuth sessions are stale (400/403 in this session); re-connect
  via `/mcp` interactively when next needed. REST (`tools/render-env.sh`) + local `vercel` CLI work meanwhile.
- **Make the GitHub repo public** — pre-public health check done 2026-07-01 (no tracked secrets; contact emails
  kept as-is per user; cosmetic infra-identifier anonymization applied). Flip visibility when ready.
- ~~**iOS runtime + TestFlight**~~ **DONE 2026-07-05** — uploaded, approved, in beta use (user-announced).
  Second push **1.3.1 (46)** shipped 2026-07-05 (auto-approved, live to beta testers). **LIVE binary =
  1.3.1 (46).** Beta convention going forward: bump build number only, marketing version reserved for
  App Store submissions (memory: testflight-versioning-convention).
- ~~**`APNS_PRODUCTION`**~~ **DONE 2026-07-05** — confirmed `true` on Render + redeploy triggered to apply
  (was also already the effective mode via the `NODE_ENV === "production"` fallback).
- **Backend runtime smoke-tests** are batched to a pre-cutover pass needing a live admin JWT (user supplies).
- **`notifications` cross-feature emits** are intentionally deferred in backend services (documented in-code
  TODOs) — wire when that work is scheduled; not blocking ship.
