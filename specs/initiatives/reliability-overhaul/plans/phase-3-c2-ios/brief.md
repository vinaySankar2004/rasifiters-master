# Phase 3 track C2 — scope brief (pipeline status: revised-once)

# SCOPE BRIEF: C2 iOS, Phase 3 client half (one bundled iOS release)

Scope: sessions, HealthKit sync v2, device registry + SSE + invite inbox, Google/Apple sign-in failure events, kit adoption + instant opens, version-gate UI, and events woven into each step.

- **Features** (each with its spec and `consumed_by`):
  - auth@0.13.0 (SPEC: specs/features/auth/SPEC.md §3.1). Used by web, iOS and Android.
  - health-sync@0.1.0 (SPEC: specs/features/health-sync/SPEC.md §8, rules 1–11). `consumed_by` is empty today; this release adds iOS.
  - apple-health@0.7.0 (SPEC: specs/features/apple-health/SPEC.md). iOS only. Its sync paths move onto health-sync. D-SUM, the client ledger and POST→409→PUT are retired.
  - notifications@0.4.0 (SPEC: specs/features/notifications/SPEC.md §3.1, §3.2 "Clients", §3.3). Web, iOS, Android.
  - invites@0.2.0 (SPEC: specs/features/invites/SPEC.md §3.1). Web, iOS, Android.
  - observability@0.2.2 (SPEC: specs/features/observability/SPEC.md §4.1, §8, §8.1). `consumed_by` is empty today; this release adds iOS.
  - app-config@0.2.0 (SPEC: specs/features/app-config/SPEC.md §3 and "iOS consumption"). iOS only today; Android is joining in C3.
  - frontend-kit@0.1.0, status built, unadopted (SPEC: specs/features/frontend-kit/SPEC.md §3–§6, §10). Web, iOS, Android.
  - Read-only users, contracts unchanged:
    - programs@0.2.0 (picker cache)
    - analytics@0.4.0 and analytics-v2@0.2.0 (Summary cache)
    - workout-logs@0.6.0 and daily-health-logs@0.3.0: iOS sync stops using them. The batch log forms keep their routes.

- **Pages/screens** (each spec lives at `specs/pages/ios/<slug>/SPEC.md`):
  - ios/login and ios/create-account
  - ios/program-picker (includes `AccountMenuSheet`)
  - ios/program-actions (`InvitesTabView`)
  - ios/program-member-management and ios/admin-members (`InviteMemberView` entry)
  - ios/admin-home (program-entry sync trigger)
  - ios/admin-summary
  - ios/apple-health
  - ios/change-password
  - ios/my-profile
  - ios/notifications (spec note only: unregister when permission is denied)
  - ios/splash, only if the root signed-in decision gains a "keychain locked" state
  - The widget screens (widget-quick-add-workout, widget-quick-add-health) do **not** change.

- **Files (exhaustive — implementer may touch ONLY these), grouped by surface**:
  - backend/ — none (out of scope; live and compatible).
  - web/ — none (track C1).
  - android/ — none (track C3).
  - ios/, step 1: sessions (+ `auth.*` events)
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Services/APIClient.swift`
      - Read the current token from the one store at send time and replace the caller's Bearer with it.
      - On a 401 sent with an outdated token, retry with the current one; refresh only when the token expires within 60 s (today 300 s) or on a 401.
      - One refresh in flight; retry a failed refresh once within 5 s.
      - Sign out only when `/refresh` answers 401. Today any second 401 or a 401/403 from refresh signs out (`:78-88`).
      - Throw a status-bearing error with `code` and `Retry-After` (`APIHTTPError`, whose message is the same server text, so untouched screens read the same).
      - Send the §4.1 headers plus a fresh `X-Request-Id`.
      - Use a 15 s request timeout instead of `URLSession.shared`'s 60 s.
      - Add `AppConfigResponse.latest_ios_version`.
    - `…/Shared/Services/APIClient+Auth.swift`
      - Refresh errors keep their status and code.
      - `logout`: send Bearer and the body refresh token.
      - New `logoutAll` (`POST /auth/logout-all`).
      - `registerDevice`: send `platform: "ios"` and `device_id`.
      - New `unregisterDevice` (`POST /notifications/device/unregister`, no auth).
      - `loginGlobal` / `socialSignIn`: send `platform` and `device_id`. `LoginView` passes `deviceId: nil` today (`:205`).
      - These login calls wait for the device-registry queue first (§3.1 ordering rule).
    - `…/Shared/Services/KeychainService.swift`
      - Use `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` and update-or-add with status checks. Today it deletes and then adds, ignoring the add's status (`:15-19`).
      - `load` must tell "not found" apart from `errSecInteractionNotAllowed`.
      - Re-save existing items with the new accessibility once.
      - Add the install-id item (service `com.app.rasifiters.install-id`).
    - `…/Shared/Services/SessionStore.swift` — the ONE token store: atomic save of the token pair, and a read result that can say "locked".
    - `…/Shared/Models/ProgramContext.swift` — `authToken` / `refreshToken` stop being a second copy. They become a UI mirror written only from the store. Add published `isOnline` and update-available state.
    - `…/Shared/Models/ProgramContext+Auth.swift`
      - Remove the refresh on every foreground (`refreshSessionIfNeeded`, `:93-134`). That refresh also reloads lookup data and membership; keep that data reload on foreground, decoupled from the token.
      - Full sign-out teardown: logout this device, unregister the device, clear the in-memory data and the launch cache, stop the stream. The event queue is kept.
      - Forced sign-out with a reason.
      - `signOutEverywhere`.
      - Never auto-retry `changePassword` / `setPassword` (§3.1 rule 6).
      - Remove the offline-alert writes.
      - This file is 443 lines, so the planner may move teardown into the new `ProgramContext+Session.swift` below.
    - `…/Shared/Services/APIClient+Workouts.swift` and `…/Shared/Services/APIClient+DailyHealth.swift`
      - The batch writers stop calling `authFailureHandler` on their own 401 retries (`+Workouts.swift:203-206`, `+DailyHealth.swift:259-262`) and use the central path.
      - `BulkWorkoutError` gains a status (D-KIT-5).
      - Step 2 deletes `writeHealthKitWorkoutLog`, `writeHealthKitSleepLog` and `writeHealthKitStepsLog` (health-sync rule 11).
    - `…/Shared/Kit/AppError.swift` — map the new status, code and `Retry-After` from `APIHTTPError`, and `BulkWorkoutError`'s status. No copy change.
    - `…/Features/Auth/LoginView.swift` and `…/Features/Auth/CreateAccountView.swift` (582 lines)
      - Emit `auth.sign_in_failed` (methods `password` / `google` / `apple`; `provider` kind for a native SDK failure; cancellations excluded).
      - Map non-401 errors to kit copy; a 401 keeps the server's text (credential scope rule, frontend-kit §4).
    - `…/Features/Home/Settings/ChangePasswordView.swift` — rule 6: "couldn't confirm" copy after a 503, 5xx or timeout; a same-password 400 on a manual retry means the change landed.
    - `…/Features/Home/Settings/MyProfileView.swift` — rule 6 for set-password. Possibly the "Sign out everywhere" row (see open question 1).
    - `…/Features/Home/ProgramPickerView.swift` — `AccountMenuSheet`: Sign Out goes through the new teardown, and possibly the "Sign out everywhere" row. Steps 3 and 5 also edit this file.
  - ios/, step 2: HealthKit sync v2 (+ `sync.run`)
    - `…/Shared/Services/HealthKitService.swift` (166 lines)
      - Read one item per sample: uuid, origin bundle id, start and end, mapped name.
      - Read `deletedObjects`.
      - Catch-up predicate.
      - Read samples by UUID for the upgrade run.
      - Discard the anchor on the upgrade run.
      - Register observers and background delivery from launch.
      - Call the observer's completion handler after the work, inside `beginBackgroundTask`.
    - `…/Shared/Services/HealthKitService+Sleep.swift` and `…/Shared/Services/HealthKitService+Steps.swift` — replace the fixed 14-day window (`sleepRecentDays` / `stepsRecentDays`) with the rule 4 catch-up window.
    - `…/Shared/Services/HealthKitAppliedLedger.swift` — read only by the upgrade run, then deleted after it succeeds (rule 9).
    - `…/Shared/Services/HealthKitSyncNotifier.swift` — count = v2 `applied`. Same look.
    - `…/Shared/Models/ProgramContext+HealthKit.swift`, `…+HealthKitSleep.swift`, `…+HealthKitSteps.swift`, `…+HealthKitWindows.swift`, `…+HealthSyncGating.swift`
      - Become thin UI/state wrappers over the engine.
      - Settings, anchor, exclusions and upgrade marker are stored per member (UserDefaults keys are not per-user today).
      - Review once, using `GET /state` and `PUT review_done`.
      - D-LOCK hold, including on a server `skipped_locked`.
      - Disconnect is the clearer (rule 7).
    - `…/Shared/Models/PendingSyncConfirmation.swift` — the workout payload carries per-sample items. Review rows can stay grouped by (type, day) for display.
    - `…/Shared/Views/HealthSyncConfirmationView.swift` — only if the payload change forces it; no visual change.
    - `…/Features/Home/Settings/AppleHealthSettingsView.swift` (815 lines) — show the last successful sync time; Sync Now becomes the manual trigger; Disconnect semantics.
    - `…/Features/Home/AdminHomeView.swift` — the `program_entry` trigger goes through the engine (today it runs workouts and sleep only).
    - `…/App/AppDelegate.swift` — register the engine's observers in `didFinishLaunching` (W3 F1); start `NetworkMonitor` once.
    - `…/App/AppRootView.swift` — launch and foreground triggers run all three kinds through the engine (today steps never runs on foreground).
  - ios/, step 3: push + invites
    - `…/Shared/Services/NotificationStreamClient.swift`
      - Parse `event:`.
      - Add `onReady` and `onClose`; a plain close means reconnect.
      - Remove the 1 h resource timeout cap.
    - `…/Shared/Models/ProgramContext+Notifications.swift`
      - Stream only in the foreground; stop on background.
      - Reconnect with backoff and full jitter, with a fresh token (refreshed if it expires within 60 s).
      - Re-fetch `/unacknowledged` after every `ready` and merge by id. Today it replaces the queue (`:42-43`).
      - Permission denied → `POST /device/unregister`. Today it uses Bearer `DELETE` (`:74-77`).
      - Push tap → acknowledge and open the target.
    - `…/App/AppDelegate.swift` — token rotation goes through the registry queue; pass `type` and `program_id` on tap; a foreground `program.invite_received` push refreshes the inbox.
    - `…/Shared/Models/ProgramContext+ProgramManagement.swift` — `loadPendingInvites` returns or throws instead of writing the global `errorMessage` (`:124-126`).
    - `…/Features/Home/ProgramActions/InvitesTabView.swift` — a failed load shows `ErrorStateView`, not "No pending invitations" (W7 i10). Response errors use kit copy.
    - `…/Features/Home/ProgramManagement/InviteMemberView.swift` — remove the swallow at `:161-172`: "sent" only on 200, everything else through the kit (invites §3.1).
  - ios/, step 5: kit adoption + instant opens
    - `…/Features/Home/ProgramPickerView.swift`
      - Programs and invites load in parallel (serial today, `:126-129`).
      - Show the cache first, then refresh.
      - Use the kit stale banner / `ErrorStateView` instead of the private `errorBanner`.
      - Offline and update banners float with `bottomInset: 150`.
    - `…/Features/Home/Tabs/AdminSummaryTab.swift`
      - The 8 loads run in parallel (serial today, `:146-160`).
      - Cache first.
      - Use `LoadState` / `.task(id:)` instead of `guard !isLoading`, which drops newer requests (W7 F5).
      - Kit stale banner and error view replace the private banner.
    - `…/Shared/Models/ProgramContext+Analytics.swift` — the 8 Summary loaders return or throw instead of the global `errorMessage`, and write the cache. The other loaders are untouched.
    - `…/Features/Home/Tabs/SummaryChartCards.swift` — fix only the spinner that never ends on loaded-empty data (`:92-99`, W7 F3). No restyle.
    - `…/Shared/Services/APIClient+Programs.swift` and `…/Shared/Services/APIClient+Analytics.swift` — touch only if the cache needs a cached-read twin. Recommended: cache raw 2xx JSON bytes keyed per member + path + query, so no DTO needs `Encodable`.
    - `…/App/AppRootView.swift` — remove the "You're offline" `.alert` (`:164-178`) in favour of the kit offline banner.
  - ios/, step 6: version-gate UI
    - `…/Shared/Models/ProgramContext+VersionCheck.swift` — compare against `latest_ios_version`; dismiss once per version. The minimum gate is unchanged.
    - `…/App/AppRootView.swift` — the update-available `FloatingBanner`, whose Update action opens `APIConfig.appStoreURL`. The existing `ForcedUpdateModalView` stays as the blocking screen.
  - ios/, new files (picked up automatically: the project uses `PBXFileSystemSynchronizedRootGroup`). Planner may rename but should not add more:
    - `…/Shared/Services/APIClient+Session.swift` — token-at-send, single-flight refresh, error classification, identity headers. Keeps `APIClient.swift` near 200 lines.
    - `…/Shared/Services/DeviceRegistry.swift` — install id plus one serial register/unregister queue (§3.1 ordering rule).
    - `…/Shared/Services/ClientEventQueue.swift` — event queue on disk that survives sign-out; batches of ≤ 25 to `POST /api/client-events`; `auth.*` and `sync.run` builders.
    - `…/Shared/Services/APIClient+HealthSync.swift` — DTOs and calls for batch and state.
    - `…/Shared/Services/HealthSyncEngine.swift`
      - Owned by a singleton, not by the view-owned `ProgramContext`.
      - One run in flight; triggers; background task.
      - Advance or hold; `PUT /state`.
      - Resolves program windows and locks itself (from `fetchPrograms`), so background wakes work without the UI.
    - `…/Shared/Services/HealthSyncItems.swift` — HealthKit reads to items, catch-up window, split at 300 items / 256 kb and on 413.
    - `…/Shared/Services/HealthSyncUpgrade.swift` — rule 9: legacy items, carry the review over, marker, delete the ledger.
    - `…/Shared/Services/LaunchCache.swift` — per-member on-disk cache for the picker and Summary; cleared by the teardown.
    - `…/Shared/Models/ProgramContext+Session.swift` — optional split of teardown, forced sign-out and sign-out-everywhere.
  - ios/, project and docs
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App.xcodeproj/project.pbxproj` — `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` only (4 entries: app and widget targets, Debug and Release). Today 1.4.3 (57).
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/CONTEXT.md` — Auth, Apple Health and Staging sections.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/ios/{login,create-account,program-picker,program-actions,program-member-management,admin-members,admin-home,admin-summary,apple-health,change-password,my-profile,notifications}/SPEC.md`, plus `splash` only as noted above.

- **DB surface**: none. The release reads and writes only through existing live API routes; no migration.

- **Flags/env/config involved**:
  - Render `MIN_IOS_VERSION` / `LATEST_IOS_VERSION` are set by the user or orchestrator after adoption, not in code.
  - `Config/APIConfig.swift` stays unchanged: the main scheme runs Release against prod; the `RaSi-Fiters-App-Staging` scheme runs Debug against staging (opt-in).
  - The entitlements already include HealthKit background delivery. No new capability or keychain access group is needed.
  - `Info.plist` stays unchanged: `beginBackgroundTask` needs no `BGTaskScheduler` id.

- **Blast radius**:
  - No contract changes. Dependent features (programs, memberships, invites, logs, analytics, health-connect) are untouched.
  - Parity surfaces:
    - web (C1): sessions, sign-out everywhere, SSE re-fetch, invite-send swallow removal, events, kit, instant opens.
    - android (C3): all of the above plus health sync (`integration` `health_connect`), version gate, install id.
  - Shared names and fields must match across all three tracks: `auth.forced_sign_out`, `auth.sign_in_failed`, `auth.refresh_failed`, `sync.run`, and the copy for "Sign out everywhere" and the rule-6 message.
  - Review once is cross-platform (health-sync D-C9), so iOS and Android must both honour `review_done_at` from any integration.

- **Live-binary compat**: none. The backend is already live and compatible.
  - Known accepted risk (health-sync F1): a member running an old and a new build at once can still double-count workouts, because the old build sums outside the ledger. That is fixed only by raising `MIN_IOS_VERSION` after adoption.
  - iOS never receives the Android-only `426` (that gate keys on an `okhttp` user agent). Still map `426` to `isUpdateRequired` per health-sync rule 8.

- **Doc↔code mismatches found**:
  1. **Widget extension (task text: "the widget extension reading the ONE token store").** `RaSi-Fiters-App-Widgets/AddWorkoutWidget.swift` is static: `.widgetURL` deep links only, with no keychain, app group or entitlements. Tokens are read in-app by `Features/Widgets/QuickAdd{Workout,Health}WidgetEntryView.swift` via `programContext.authToken`. Once `APIClient` injects the current token at send time, those files need no edit and no shared keychain group is needed.
  2. **iOS picker has a dead invite path.** W2 says only Android reads invites from picker rows. The iOS picker also has an accept/decline path for `my_status == "invited"` via `PUT /program-memberships` (`ProgramPickerView.swift:348-359, 479-489`). It is never populated (0 such rows in prod), so it is harmless.
  3. **Invite-sent copy differs.** iOS says "Invite sent" (`InviteMemberView.swift:181`) and Android says "Invite sent". Web says "Invitation sent." and invites §3.1 specifies "Invitation sent".
  4. **app-config SPEC line refs are stale.** It cites `AppRootView.swift` lines `:37`, `:70`, `:85-87`; the code is now at `:42-43`, `:87-90`, `:119-122`.
  5. **`consumed_by` lags.** health-sync and observability list no clients, and frontend-kit status is still "built". Expected until this release lands.

- **Out of scope (explicitly)**:
  - apps/backend, web and Android.
  - Members, Lifestyle and Program tabs, member detail screens, the log forms, and the quick-add widget screens and extension (no restyle; they keep working through the central `APIClient`).
  - The dead picker membership-row invite path (mismatch 2).
  - `ForgotPasswordView` and `NotificationsSettingsView`, which have no behaviour change.
  - `BGAppRefreshTask` and Android-style background sync.
  - Notification redesign and the People layer (Phase 4).
  - Repointing the existing `appOrange` / `appRed` to the kit palette (D-KIT-10).

- **Open questions for the orchestrator**:
  1. **Where does "Sign out everywhere" go?** Options: `AccountMenuSheet` next to Sign Out, or `MyProfileView` next to Delete Account. Pick one placement plus confirm-dialog copy for all three tracks.
  2. **What happens to health-sync state after an explicit sign-out?** Rule 7 says sync "stops" on an explicit sign-out but resumes for the same member. Recommendation: keep per-member toggles, anchor and exclusions on any sign-out (sync just pauses with no session); only Disconnect clears them. This replaces today's `clearHealthKitSettings()` in `signOut`.
  3. **What should a push tap open on iOS?** Recommendation: acknowledge plus re-fetch; `program.invite_received` refreshes the inbox (picker badge); no new navigation.
  4. **Invite success copy:** converge to "Invitation sent" on iOS and Android (needs a web/Android decision as well)?
  5. **Can a password write be retried after a 401?** May `/change-password` and `/set-password` take the sessions path of 401 → refresh → one retry? A 401 means `PUT /user` never ran. Rule 6 bans retries only after a 503, 5xx or timeout. Also flag to the planner that these are HTTP `PUT`s, which URLSession can treat as idempotent on a dropped connection.
  6. **Binary version (user decision):**
     - Option (a): 1.4.3 (58) on the still-open 1.4.3 train. No new Beta App Review, but `MIN_IOS_VERSION` compares marketing versions only, so it can't tell 58 from the old 1.4.3 (57), which carries 1.4.2 code. That gap closes once (57) expires around 10-15.
     - Option (b): 1.5.0 (58), a new train with one first-of-train Beta App Review. The gate can then cleanly require ≥ 1.5.0.
     - **Recommend (b).** One-train-ahead rule: once 1.5.0 (58) is uploaded as the App Store candidate, pre-bump the repo immediately to 1.5.1 (59).
