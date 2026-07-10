# PROGRESS.md — Current State & Next Action

> **Read this FIRST every session.** The single source of truth for *where we are* and *what's next*.
> Cross-session loop: start → read this → work → at session end, update this file + commit (via
> `git-version`). A condensed run history (2026-06-28 → 2026-06-30) is in **`PROGRESS_ARCHIVE.md`**
> (one line per run, not auto-loaded); full per-run detail lives in this file's git history.

## Current phase

**LATEST (2026-07-10): Signup wizard + Google/Apple federated sign-in SHIPPED — `auth` v0.8.0.** The
Create Account flow is now a 3-step no-scroll wizard on all 3 clients, with Continue-with-Google
(web/iOS/Android) + Sign-in-with-Apple (iOS), custom dark-pill buttons, and the auth screens tightened to
fit one screen. Backend (Render) + web (Vercel) **deployed**; **live-tested on all 3 platforms**. R1
preserved (native id_token / web auth-`code` → `/api/auth/oauth` → Supabase `signInWithIdToken`; new
`/oauth/complete` two-step for new social users; **409** on a same-email collision). Load-bearing details +
the iOS GoogleSignIn-9.2.0 nonce quirk + the infra are in `specs/features/auth/SPEC.md` §9 (D-C8/D-C9) and
the auto-memory `federated-signin-shipped`. **Not-yet-done tail:** the new iOS/Android **binaries are
code-complete + compile-clean but NOT yet on TestFlight/Play** — shipping them is the user's next step (iOS
bump `CURRENT_PROJECT_VERSION` 48→49, same marketing version; Android `bundleRelease` + add the release
SHA-1 to the Google Android OAuth client). **NEXT PLANNED TASK (new session):** link/unlink Google+Apple in
**account settings** on all 3 surfaces (see auto-memory `link-google-account-settings-followup`).

**PRIOR WORKSTREAM (2026-07-08, COMPLETE): Android port — the 4th surface (`apps/android`).** A faithful 1:1
Compose port of the same app against the same backend contract. Plan approved; phased scaffold→port→
de-scaffold sequence (A→J). **Phase A (foundation) + Phase B (auth path) + Phase C (program-picker) +
Phase D-landing (Summary dashboard) + Phase D-details (5 Summary forward targets) + Phase E (Members tab +
all 8 detail screens) + Phase F (Lifestyle tab + timeline drill-down + workout-types manager) + Phase G
(Program tab + all 6 settings/admin sub-routes) + Phase I (notifications) + Phase H (Health Connect) +
Phase J (de-scaffold) COMPLETE — all build green; all 4 bottom tabs are real screens and the scaffold is
fully removed (`StubScreen.kt` deleted 2026-07-08, Run 15; zero placeholders remain).**
Next = **the user generates a signed AAB in Android Studio → Play Console internal testing** (the port is
code-complete). Full plan
+ decisions are in `apps/android/CONTEXT.md`
and the approved plan (`~/.claude/plans/immutable-jingling-hamming.md`). v1 scope = all screens + SSE
notifications + auth + Health Connect + FCM push; widgets deferred. Specs = thin port-notes per screen
(`specs/pages/android/`).

_(Prior milestone — still true:) Rebuild COMPLETE + SHIPPED across the first 3 surfaces: iOS on TestFlight
(approved, in beta use — user-announced 2026-07-05); web LIVE; backend LIVE. Remaining tail: go-public on
GitHub + pre-cutover smoke tests (below)._

- **`android`** — 🟢 **Phase H (Health Connect) DONE + green (2026-07-08, Run 14): workout + sleep auto-sync.**
  The Android analog of the iOS `apple-health` feature, re-expressed on **Health Connect**
  (`androidx.health.connect:connect-client 1.1.0-alpha07`). New `health/` module — `HealthConnectManager`
  (availability via `getSdkStatus`, read auth via `PermissionController`, **incremental workouts via the
  Changes API** = the anchor analog, **rolling 14-day sleep window**, aggregation), `HealthConnectWorkoutTypeMap`
  (`ExerciseSessionRecord.EXERCISE_TYPE_*` → the library names `apple-health`'s `sql/004` already seeded; targets
  ⊆ iOS map), `HealthStore` (SharedPreferences = the UserDefaults analog: settings + first-sync gating + the
  sum-on-conflict applied-sample ledger), `HealthModels`/`HealthDates`/`HealthSyncNotifier`, and the big
  `HealthSyncController` (the four iOS `ProgramContext+HealthKit*` extensions ported 1:1 — single-flight,
  per-program window scoping **D-S5**, first-sync confirmation gating **D-CONF**, admin-lock skip **D-LOCK**,
  sum-on-conflict + ledger **D-SUM**, silent auto-retry **D-SIL**). UI: `ui/health/HealthConnectSettingsScreen`
  (workout + sleep toggles, program selection with locked rows, sync status + Sync Now, disconnect) +
  `ui/health/HealthSyncConfirmationScreen` (one program per page, checkable rows, tick=commit+advance,
  back=defer — a full-screen overlay from `RootScreen`). Wiring: `ProgramContext` gained
  `isDataEntryLocked(programId)` + owns a `HealthSyncController`; `ApiService` gained status-code-aware raw
  writes (`postWorkoutLog`/`postDailyHealthLogRaw`/`putDailyHealthLogRaw` → `Response<Unit>`); account rows
  (Program tab + picker sheet) + launch/auth/resume/program-entry sync triggers. **No backend change, no
  migration** — reuses the already-live `workout-logs` D-C9 + daily-health upsert. Manifest: HC READ
  permissions + provider `<queries>` + permissions-rationale intent-filters. Deviation **H-1**: no
  HealthKit-style immediate background delivery (HC has none) — sync on app triggers. `./gradlew
  :app:assembleDebug` = BUILD SUCCESSFUL. New feature SPEC `specs/features/health-connect/` (0.1.0) + thin
  screen SPEC `specs/pages/android/health-connect/`. **User live-tested workout + sleep sync on the Pixel_8
  and signed off (2026-07-08) — verified end-to-end.**
- **`android`** — 🟢 **Phase I (notifications) DONE + green (2026-07-08, Runs 10–11): in-app SSE + FCM push.**
  **I-a (Run 10, user live-tested + signed off):** the in-app half — okhttp-sse `NotificationStreamClient`
  (`GET /notifications/stream`, Bearer header, `readTimeout(0)`) + `/unacknowledged` backfill + a
  single-notification `NotificationModal` **queue** (oldest-first, optimistic `/:id/acknowledge`, F7/F8) mounted
  as an app-root overlay in `RootScreen` (stream starts on sign-in, restarts on `ON_RESUME`, tears down on
  sign-out). **I-b (Run 11): FCM push** — Firebase project `rasi-fiters` (user-provisioned;
  `google-services.json` gitignored, sole-builder machine), google-services plugin + `firebase-messaging`,
  `push/RaSiFirebaseMessagingService` (onNewToken→register; onMessageReceived no-op — SSE owns foreground),
  `POST_NOTIFICATIONS` runtime request, device-token registration (`PUT /notifications/device` with
  `platform:"android"`, dereg on sign-out). **Backend delta (deploy-pending push):** `firebase-admin` FCM
  sender in `utils/pushNotifications.js` fired alongside APNs by `sendPushToMembers`; `upsertPushToken` +
  login/`PUT /device` thread a `platform` param (default `"ios"` — LIVE iOS binary unchanged);
  `FIREBASE_SERVICE_ACCOUNT` base64 secret set on Render (`sync:false`); **no migration** (the `platform`
  column already exists). `assembleDebug` green. SPEC `specs/pages/android/notifications-alerts/` (0.2.0) +
  `notifications` feature **0.3.0** (consumed_by += android; committed `587eae8`, tagged
  `feature/notifications@v0.3.0`). **Backend DEPLOYED + live** (2026-07-08, `bb2bbc2`); **user live-tested FCM
  push tray delivery on the Pixel_8 and signed off (2026-07-08) — verified end-to-end.**
- **`android`** — 🟢 **Pre-Phase-H cleanup DONE (2026-07-08, Run 9):** app-wide **solid** background (the
  auth-only orange gradient removed); picker **"+"** → new `ProgramActionsSheet` (My Invites / Create) →
  `POST /programs` (`createProgram`); picker **account sheet wired** to the real settings screens (dead
  Health-Connect row removed); **edge-back** from the 4 main tabs → picker (`AppScaffold` `BackHandler`); +
  audit fixes (member workout/health log Edit/Delete now surface errors; workout-form stale row-error clears
  on edit; member-history detail resets the shared timeline to "week" on leave; **Lifestyle load sequenced
  like iOS** — no program-admin program-wide flash). `assembleDebug` green; full detail in
  `apps/android/CONTEXT.md` + `specs/pages/android/{program-picker (v0.2.0),lifestyle (v0.1.1)}/SPEC.md`.
- **`android`** — 🟡 **Phase G DONE (2026-07-08).** The **Program tab (Tab 4)** + its **6 settings/admin
  sub-routes** are ported + green (`ui/program/{ProgramScreen,ProgramSections,ProgramCards,
  ProgramAccountSection,ProfileScreen,ChangePasswordScreen,AppearanceScreen,NotificationsScreen,
  EditProgramScreen,ManageRolesScreen}.kt`). Role-bifurcated on `isProgramAdmin`: **standard** = read-only
  Program Info card (client date math: Name/Status/Duration/Progress/Active Members) + Switch + Leave + My
  Account; **admin/global-admin** = Program Info action section (Select · Edit-if-canEdit · Leave-if-not-
  global) + Members (View/Invite) + Role Management (if canEdit; Admins/Loggers preview + Manage Roles) +
  Workout Types + My Account. Sub-routes: **My Profile** (name/gender + password-confirmed email change +
  delete account), **Change Password** (live 5-rule policy + success dialog), **Appearance**
  (System/Light/Dark → new `core/AppearanceStore` wired into `MainActivity`→`RaSiFitersTheme`),
  **Notifications** (OS-status card + Open-Settings deep link; FCM is Phase I), **Edit Program**
  (name/status/dates + admin-only-data-entry toggle + no-op-save skip), **Manage Roles** (segmented
  Admin/Logger/Member + last-active-admin guard + per-row spinner). `net` gained `MemberDTO` + 5 mutation
  DTOs + 7 endpoints; `ProgramContext` gained the account actions (`fetchMember`/`updateMemberProfile`/
  `changePassword`/`changeEmail`/`deleteAccount`) + `updateProgram`/`leaveProgram`/`updateMemberRole` + a
  `loggedInGender` seed. Members/Workout-Types sections **reuse** the Phase E `MEMBER_ROSTER`/`MEMBER_INVITE`
  + Phase F `LIFESTYLE_WORKOUT_TYPES` routes (no new screens). Deviations: **Apple-Health row omitted**
  (Health Connect = Phase H/J, user-confirmed); Switch/Leave → `popBackStack(PICKER)` via a threaded
  `onSwitchProgram`; dialogs not alerts; neutral M3 surfaces [[android-neutral-m3-surface-roles]]. **Zero
  `StubScreen` call-sites remain** — all 4 tabs are real. 7 thin SPECs under `specs/pages/android/`.
  `./gradlew :app:assembleDebug` = BUILD SUCCESSFUL (Run 8). Next: **Phase H (Health Connect) / Phase I
  (SSE + FCM)**.

  _(Phase F, 2026-07-08:)_ The **Lifestyle tab (Tab 3)** + its 2 forward targets
  are ported + green (`ui/lifestyle/{LifestyleScreen,LifestyleCards,LifestyleTimelineDetailScreen,
  WorkoutTypesListScreen}.kt`). Tab body: header + glass button (→ workout-types manager), a role-gated
  **"View as"** picker (admin/global-admin; program-wide = "Admin", global-admin none = "None"; hoisted in
  `ProgramContext` so it survives a detail push+back — separate slot from the Members-tab view-as), the 4
  workout-type stat cards (total/most-popular/longest/participation — participation always program-wide),
  the **Workout Type Popularity** ranked-bar card (Count/Total-Minutes/Avg-Minutes segmented, top-6 + Show
  all), and the tappable **Lifestyle Timeline** preview. Inner screens: **timeline drill-down** (W/M/Y/P +
  daily-average header + a new dual-axis `SleepDietChart` — sleep-hrs bars on the leading axis, diet 0–5 on a
  trailing "/5" axis, D-C1 — + the shared tap/drag tooltip + Sleep/Diet legend) and the **workout-types
  manager** (Available/Hidden sections, search, admin add/rename/delete-custom + hide/show any via a per-row
  ⋮ menu; double-duty with the Program tab / Phase G). `net` gained the health-timeline + 4 analytics-v2
  workout-type DTOs + 5 workout-management request DTOs + endpoints (+ `memberId` on `getWorkoutTypes`);
  `ProgramContext` gained `LifestyleData` + `loadLifestyle`/`loadHealthTimeline`, the hoisted lifestyle
  view-as + `ensureLifestyleViewAsDefault`, and the full workout-management set (`programWorkoutsAll` +
  add/edit/delete/toggle). Shared-chrome refactor: hoisted `Period`/`PERIODS`/`PeriodSelector` into
  `DetailChrome.kt`; made Members `MemberPickerSheet`/`GlassIconButton` public (+ a `noneLabel` param). 3 thin
  SPECs under `specs/pages/android/`. `./gradlew :app:assembleDebug` = BUILD SUCCESSFUL (Run 7). Next:
  **Phase G (Program tab + settings)**.

  _(Phase E, 2026-07-08:)_ The **Members tab (Tab 2)** + **all 8 detail screens**
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

> ### ⏭️ ANDROID PORT — CODE-COMPLETE + LIVE-VERIFIED (all phases A→J green; Phase H Health Connect sync + Phase I FCM push both user-live-tested on the Pixel_8, 2026-07-08). Next + only remaining step: **the user generates a signed AAB in Android Studio → Play Console internal testing.**

**Phase J is DONE** (2026-07-08, Run 15): the last scaffold placeholder `ui/StubScreen.kt` is **deleted**
(unused since Phase G drove call-sites to 0); the `apps/android/CONTEXT.md` scaffold-removal tracker is
folded to a CLOSED note; `:app:assembleDebug` = BUILD SUCCESSFUL. No scaffold placeholder remains anywhere
in `apps/android` — all 4 bottom tabs + every detail/settings screen are real. **Nothing left to port.**

**Phase H is DONE + compiles green** (2026-07-08, Run 14): the `health/` module + `ui/health/` screens port
the iOS `apple-health` feature to Health Connect 1:1 (all of D-S5/D-CONF/D-LOCK/D-SUM/D-SIL; Changes API =
the anchor; rolling 14-day sleep window). No backend change, no migration. **User live-tested workout + sleep
sync on the Pixel_8 and signed off (2026-07-08)** — the port is verified end-to-end, not just compiling.

**Phase I** is DONE, deployed, and user-verified end-to-end (Runs 10–12). Resume at **Phase J** —
de-scaffold: confirm zero stub screens remain (already true), delete the now-unused `ui/StubScreen.kt`, fold
the scaffold-removal tracker into `CONTEXT.md`, final `android-build` green; then the user generates a signed
AAB in Android Studio and pushes to Play Console internal testing.

**✅ Phase I FULLY VERIFIED end-to-end (2026-07-08).** Backend deployed live on Render (dep
`dep-d97hd3e7r5hc73c9fj6g`, `bb2bbc2`; degrade-safe for the LIVE iOS binary). FCM push confirmed reaching the
Pixel_8 tray (`firebase-admin` → FCM → device, `rasi_default` channel) after fixing one device-test bug: the
Android client wasn't sending `platform` (kotlinx.serialization omits a **default-valued** property, so
`platform = "android"` was dropped → the token stored as `'ios'` → the FCM sender skipped it). Fixed by making
`platform` a required (always-serialized) field. Client-only fix, no backend redeploy.

---

> ### ⏭️ Phase H (Health Connect) — the next porting phase after Phase I ships.

**Phase G (Program tab + settings/admin sub-routes) is DONE + green + LIVE-TESTED** (2026-07-08): the
**Program tab (Tab 4)** replaces the last `StubScreen("Program")`, plus its 6 sub-routes (My Profile ·
Change Password · Appearance · Notifications · Edit Program · Manage Roles). Role-bifurcated on
`isProgramAdmin`; the Members + Workout-Types sections reuse the Phase E roster/invite + Phase F manager
routes (no new screens). New `core/AppearanceStore` lit up the light/dark/system theme override (wired in
`MainActivity`). Apple-Health account row omitted (Health Connect = Phase H/J, **user-confirmed**).
`android-build` = BUILD SUCCESSFUL (Runs 8 + 8b). 7 thin SPECs written. **User live-tested on the Pixel_8
emulator (light + dark) and signed off 2026-07-08.**

Post-build polish (Runs 8b, in the same working tree): (1) **dark-mode root fix** — wrapped
`RaSiFitersTheme`'s content in a `Surface(contentColor = onBackground)` so `Text` OUTSIDE a Scaffold (the
program picker + auth screens) is no longer black-on-black in dark mode (Compose's `LocalContentColor`
defaults to black; only a Surface/Scaffold re-provides it). (2) **Support link = iOS** — the account-menu
Support row now opens the web `/support` page (`AppLinks.supportUri`), not a `mailto:` (which stays the
forgot-password fallback). (3) **light-mode rows** — inner setting rows use a theme-conditional
`programRowColor()` (white `surface` in light like iOS; the raised `surfaceContainerHigh` KEPT in dark) +
the settings-row subtitle shrank to `bodySmall`/one-line. **Dark mode was user-approved as-is and is
untouched by the light fix.**

> ✅ **COMMITTED:** Phase G + Runs 8/8b are committed (`7e7ad7e` feat(android): Phase G, `a98bc10` chore(skills)).
> The **Run 9 pre-Phase-H cleanup** (background/`+`/account-nav/edge-back + audit fixes) is committed on top of
> those (2026-07-08). Working tree clean → **just say "continue" to start Phase H/I in a new session.**

Resume at **Phase H** — **Health Connect** (Samsung Health; the HealthKit analog: `ExerciseSessionRecord` →
`/workout-logs`, `SleepSessionRecord` → `/daily-health-logs`; per-program toggles, data-lock aware; the
account-tab Health row lands here) — then **Phase I** (SSE real-time + FCM push; the net-new backend
`platform:"android"`) and **Phase J** (de-scaffold: delete the now-unused `StubScreen.kt`). Gate every
screen with `android-build`; write thin SPECs under `specs/pages/android/`. Phase list A→J is in
`apps/android/CONTEXT.md`.

_(Phase F, 2026-07-08:) The **Lifestyle tab (Tab 3)** + its two forward targets (timeline drill-down +
workout-types manager) landed + green (Run 7); user live-tested + signed off._

_(Earlier:)_ **Phase D-details (5 Summary forward targets) is DONE + green** (2026-07-08): the **log-workout** +
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
   program-picker + Phase D-landing (Summary dashboard) + Phase D-details (5 Summary forward targets) +
   Phase E (Members tab + 8 details) + Phase F (Lifestyle tab + timeline + workout-types manager) +
   Phase G (Program tab + 6 settings/admin sub-routes) + Phase I (notifications) + Phase H (Health Connect)
   + Phase J (de-scaffold) green (2026-07-08); all 4 tabs real, scaffold removed. Port is CODE-COMPLETE
   (all phases A→J). Remaining: user generates a signed AAB → Play Console internal testing.

## Coverage

- Features: **16** (incl. the Android-only `health-connect`) — `specs/features/REGISTRY.md` + `registry.json`.
- Web page SPECs: **34** · iOS screen SPECs: **31** · Android screen SPECs: **29** (thin port-notes) —
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
