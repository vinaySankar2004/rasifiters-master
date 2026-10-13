# Phase 3 track C3 — scope brief (pipeline status: revised-once)

# SCOPE BRIEF: Reliability overhaul Phase 3 client half, Track C3 Android (one bundled release in `apps/android`)

- **Features** (cite these, don't restate them):
  - auth@0.13.0 (SPEC: specs/features/auth/SPEC.md §3.1) · consumed_by [web, ios, android]
  - health-sync@0.1.0 (specs/features/health-sync/SPEC.md §3, §8) · consumed_by **[]**, needs to become [ios, android]
  - health-connect@0.2.0 (specs/features/health-connect/SPEC.md) · [android]
  - notifications@0.4.0 (specs/features/notifications/SPEC.md §3.1–3.3) · [web, ios, android]
  - invites@0.2.0 (specs/features/invites/SPEC.md §3.1) · [web, ios, android]
  - observability@0.2.2 (specs/features/observability/SPEC.md §4.1, §8, §8.1) · consumed_by **[]**, needs to become [web, ios, android]
  - app-config@0.2.0 (specs/features/app-config/SPEC.md §3) · consumed_by **[ios]**, needs to add android
  - frontend-kit@0.1.0 built, not adopted yet (specs/features/frontend-kit/SPEC.md §3–§10) · [web, ios, android]
  - Consumed with no contract change: programs@0.2.0 (picker cache) · analytics@0.4.0 + analytics-v2@0.2.0 (Summary's 7 reads, cached and run in parallel) · workout-logs@0.6.0 + daily-health-logs@0.3.0 (Android stops using the old sync paths, health-sync §8 rule 11).
  - Design board: specs/initiatives/reliability-overhaul/DESIGN_BOARD.md §1–§7. Evidence: discovery/W1, W2, W4, W5, W7.

- **Pages/screens** (all `specs/pages/android/<slug>/SPEC.md`): android/login · android/create-account · android/program-picker · android/summary · android/my-profile · android/change-password · android/health-connect · android/notifications-alerts · android/member-management (invite-send errors) · android/widgets (version gate before the widget deep link) · android/notifications (only if open question 7 is yes).

- **Files (exhaustive; implementer may touch ONLY these), grouped by surface**:
  - backend/: none (out of scope, live and already compatible).
  - web/: none (Track C1).
  - ios/: none (Track C2).
  - android/ (one implementer). P = /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters

    **Sessions + transport**
    - P/core/Session.kt
      - Today: two copies of the token (Session plus `_authToken` in ProgramContext.kt:104), and `EncryptedSharedPreferences.create` has no guard (Session.kt:15-26).
      - Change: one token store exposed as a StateFlow. If the store can't be read (e.g. after a restore), clear it and report `token_store_unreadable`.
    - P/net/Network.kt
      - Today: signs out on ANY refresh failure (:92-96, :105-119). The refresh `bareClient` uses default timeouts and sends no headers.
      - Change: proactive refresh when the token expires within 60 s · sign out only on refresh `401 session_invalid` · 503 / timeout / offline keep the session · one retry within 5 s, then backoff · 15 s request timeout · route 426 to the version gate · logout / unregister / client-events never trigger refresh loops.
    - P/net/TokenRefresher.kt (NEW): single-flight refresh, JWT `exp` decode with android.util.Base64 (no new dependency), failure classification, `auth.refresh_failed` events. Shared by the interceptor, the authenticator and SSE.
    - P/net/ClientHeaders.kt (NEW): an interceptor that adds `X-App-Platform: android`, `X-App-Version` (versionName), `X-App-Build` (versionCode) and a fresh UUID `X-Request-Id`. Goes on ALL THREE OkHttp clients: main, refresh and SSE (observability §8; the app-config D-C5 gate keys on `X-App-Version`).
    - P/net/ApiException.kt: carry `code`, `retryAfter` and the response's `X-Request-Id` (D-KIT-5 capture).
    - P/core/kit/AppError.kt: the `ApiException` branch (:101) currently drops `code` and `retryAfter`; pass them through.
    - P/net/ApiService.kt: add these endpoints:
      - `POST auth/logout-all`
      - `POST notifications/device/unregister`
      - `GET program-memberships/my-invites` and `PUT program-memberships/invite-response`
      - `GET app-config`
      - `POST client-events`
      - `POST health-sync/batch` and `GET|PUT health-sync/state`

      Remove the raw sync endpoints (`postWorkoutLog`, `postDailyHealthLogRaw`, `putDailyHealthLogRaw`, :290-297) and the old invite-response path once nothing calls them.
    - P/net/Dtos.kt:
      - `LoginRequest` gains `platform` (the login ride-along defaults to ios without it).
      - `OAuthRequest` gains `platform` (W2 latent bug).
      - `DeviceUnregisterRequest` becomes `{push_token?, device_id?}`.
      - `ErrorBody.code`.
    - P/net/HealthSyncDtos.kt (NEW): batch, item and result DTOs, plus state DTOs (health-sync §3.2–3.4).
    - P/net/PlatformDtos.kt (NEW): `AppConfigResponse`, `ClientEvent` batch, `PendingInviteDTO`, `InviteResponseRequest`.
    - P/core/AppContainer.kt: wire TokenRefresher, DeviceRegistry, EventQueue, LaunchCache, VersionGate and a single ConnectivityObserver.

    **Teardown, events, cache, gate**
    - P/core/ProgramContext.kt (1,269 lines; put new logic in the NEW files below, keep edits here thin):
      - One sign-out teardown on every path: own sign-out, refresh `session_invalid`, `logout-all` 200, delete account. It revokes this device (`/logout`), unregisters the device, clears the launch cache and stops the stream.
      - `logoutAll()`.
      - Login and OAuth ride-along of `push_token`, `device_id` and `platform`.
      - The invite inbox state (`my-invites`) and `respondToInvite` using `invite_id` + `action` + `block_future`.
      - Remove the `sendProgramInvite` swallow (:999-1006).
      - `changePassword` / `setAccountPassword` are never retried automatically (auth §3.1 rule 6).
      - Programs and Summary as kit UiState fed by the cache. Summary's 7 reads run in parallel (today serial, :578-598).
      - `refreshDataForNotification` for `program.invite_received` reloads the inbox.
      - `auth.sign_in_failed` and `auth.forced_sign_out` events.
    - P/core/events/ClientEventQueue.kt (NEW):
      - Persisted queue that survives sign-out (filesDir, excluded from backup).
      - Batches of ≤ 25 events, UUID ids kept across retries.
      - 429 waits for Retry-After · 413 splits the batch · 400 drops it · 5xx or network error retries with backoff.
    - P/core/LaunchCache.kt (NEW): stores the last good programs list and per-program Summary data, per member (JSON via kotlinx.serialization in noBackupFilesDir). Cleared by the teardown. `SummaryData` (bottom of ProgramContext.kt) needs `@Serializable`, or a cached DTO.
    - P/core/VersionGate.kt (NEW):
      - Reads `GET /app-config` on launch, on foreground, before replaying a widget route, and on any 426.
      - Compares `BuildConfig.VERSION_CODE` with `min_android_version_code` → required, and with `latest_android_version_code` → available.
      - Remembers a dismissal once per version in `rasi.fiters.prefs`.
    - P/ui/components/UpdateRequiredScreen.kt (NEW): blocking full-screen. "Update" opens `market://details?id=com.app.rasifiters`, falling back to https. Copy = KitCopy `updateRequired` / `update`.

    **Push + SSE + invites**
    - P/push/DeviceRegistry.kt (NEW):
      - Install id stored in the `noBackupFilesDir/install_id` file.
      - ONE serial queue (Mutex) for `PUT /device` (with `device_id`) and `POST /device/unregister` (no login, one retry, then drop).
      - A sign-in waits for an in-flight unregister; a pending retry is dropped when a sign-in begins.
      - Forget the cached push token and the dedupe memo afterwards (notifications §3.1).
    - P/push/RaSiFirebaseMessagingService.kt: `onNewToken` goes through DeviceRegistry. `onMessageReceived` posts the notification on the channel given by its type, with a tap PendingIntent carrying `notification_id`, `type` and `program_id`. Today this callback does nothing (:22-24).
    - P/App.kt: create the `rasi_invites` channel (IMPORTANCE_HIGH, "Invites & membership") next to `rasi_default`. Today only `rasi_default` exists (:20-27).
    - P/MainActivity.kt: a push tap reads the intent extras → `POST /:id/acknowledge` → opens the target (inbox or picker), on both onCreate and onNewIntent.
    - P/net/NotificationStreamClient.kt:
      - Today: no onFailure / onClosed handling (:52-62).
      - Change: `ready` triggers a re-fetch of `/unacknowledged` · every close or error is a reconnect with backoff + full jitter · get a fresh token first · foreground only.
    - P/ui/RootScreen.kt:
      - Stream start/stop on ON_START / ON_STOP instead of today's ON_RESUME-only start (:86-99).
      - Health trigger names `launch` / `foreground`.
      - Version-gate overlay and the update-available banner.
      - Gate before the widget replay.
      - POST_NOTIFICATIONS handling (see open question 7).
    - P/ui/programs/ProgramActionsSheet.kt: the My Invites tab is fed by `/my-invites` (today `myStatus == "invited"`, :83). Accept/Decline go through `/invite-response`; Decline gets a confirm with "block future invites" (iOS InvitesTabView parity).
    - P/ui/programs/InviteInbox.kt (NEW, optional extraction): invite card + decline dialog, so the two 300–600-line screens don't grow.

    **Google button**
    - P/ui/auth/GoogleCredential.kt:
      - Today: `GetGoogleIdOption` without a nonce (:73-79 and the link flow :114-123); raw `e.message` shown (:83-86); `catch (Exception)` also swallows coroutine cancellation.
      - Change:
        - Use `GetSignInWithGoogleOption` with a nonce: SHA-256 hex goes to Google, the raw nonce goes to `/auth/oauth` and `/auth/link`.
        - Map `GetCredentialException` types to human messages and add a double-tap guard.
        - Send `auth.sign_in_failed` with `kind: provider` and the SDK code.
        - Rethrow `CancellationException`.
    - P/ui/auth/LoginScreen.kt: the "Login" dialog stops showing raw text (:51-58). 401 keeps the server text (credential-scope rule); 503 / offline / timeout use KitCopy.
    - P/ui/auth/CreateAccountScreen.kt: only if the GoogleSignInButton signature or error type changes (:177-185).

    **Account settings**
    - P/ui/program/ProfileScreen.kt:
      - A "Sign out everywhere" row + confirm → `logoutAll` (auth §3.1).
      - The link-Google nonce and error mapping (:277-286).
      - `set-password` rule 6 copy (:326).
    - P/ui/program/ChangePasswordScreen.kt: rule 6. Never retried automatically; after 503 / 5xx / timeout say "couldn't confirm" and suggest signing in with the new password; a `400 "must be different"` on a manual retry counts as done (:93-95).

    **Kit adoption + instant opens** (no restyle; banners float)
    - P/ui/programs/ProgramPickerScreen.kt:
      - Cached list first, then refresh.
      - Programs + invites load in parallel (today one serial load, :106-108).
      - Failed → ErrorView · stale → FloatingBanner (`bottomInset` 146.dp + `navigationBarsPadding`, kit §6) · offline banner.
      - Badge = inbox count + `requested` count (today :115).
      - Drop the dead inline invited-card Accept/Decline (:198, :368-371), keep "requested".
      - Pull-to-refresh (M3 PullToRefreshBox, already in the BOM) if open question 9 is yes.
    - P/ui/summary/SummaryScreen.kt: cached Summary first · failed with no data → ErrorView instead of `error?.let { ErrorBanner }` + zero cards (:61-68, :82) · stale / offline banner · pull-to-refresh with sync trigger `pull_to_refresh`.
    - P/ui/shell/AppScaffold.kt: the program-entry trigger becomes `onTrigger(program_entry)` (:93).
    - P/ui/members/MemberManagementScreens.kt: only if the kit message can't come through ProgramContext's Result (:121-124 already shows `e.message`).

    **Health Connect sync v2** (health-sync §8 rules 1–11)
    - P/health/HealthSyncController.kt (800 lines): keep the public surface the UI uses (flows, enable / disconnect / toggle, `onTrigger(trigger)`, `finishConfirmation`). Move run logic out. One run in flight per device.
    - P/health/HealthSyncRunner.kt (NEW):
      - A run: read → items → `POST /batch` (split at 300 items / 256 kb, halve on 413).
      - Hold on `skipped_locked` (D-LOCK).
      - `PUT /state sync_success`.
      - Error handling per rule 8 (503 busy + Retry-After).
      - The `sync.run` event.
    - P/health/HealthSyncItems.kt (NEW): one item per sample (or day) × selected in-window, unlocked, non-excluded program; workout `value` per sample; deletions from `DeletionChange.recordId`.
    - P/health/HealthSyncUpgrade.kt (NEW), rule 9:
      - Re-read each `hc.ledger|<id>|<programId>` entry by id → send it as a `legacy` item.
      - Discard the changes token and read today − 30 d.
      - Set the upgrade marker.
      - Carry `review_done` over from the `hc.*` confirmed lists.
      - Delete the old ledger once every legacy item is final.
    - P/health/HealthConnectManager.kt:
      - Today: reads only the first `readRecords` page (:94-99); an expired token falls back to the connect date (:80-83); sleep and steps use a fixed 14 days (:125, :137); `getChanges` ignores deletions (:85-87).
      - Change: page through every result with `pageToken` · catch-up window per rule 4 · `readRecord` by id · deletions · `grantedPermissions()` checked every run.
    - P/health/HealthStore.kt: per-member namespacing; migrate the existing un-namespaced `rasi.health` keys to the current member (W4 §8); upgrade marker; drop the 45-day ledger after the upgrade.
    - P/health/HealthModels.kt: run, item and result models; `HealthSyncResult` counts.
    - P/health/HealthDates.kt: catch-up window helpers.
    - P/health/HealthSyncNotifier.kt: only if the "Synced N" count source changes.
    - P/ui/health/HealthConnectSettingsScreen.kt: live permission state → "Reconnect Health Connect" (today it always says "will sync automatically"); last successful sync time; triggers `connect` / `manual`.
    - P/ui/health/HealthSyncConfirmationScreen.kt: review once. Shown only when no integration's row has `review_done_at`; confirm → `PUT review_done`; local exclusions still honored.

    **Manifest, res, build, docs**
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/AndroidManifest.xml: add `android:fullBackupContent` + `android:dataExtractionRules`. Today `allowBackup="true"` has no rules.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/res/xml/backup_rules.xml (NEW) and .../res/xml/data_extraction_rules.xml (NEW): exclude `rasi.fiters.session`, `rasi.health`, the event queue and the launch cache.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/res/values/strings.xml: `rasi_invites` channel id + name.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/build.gradle.kts: `versionName` only (versionCode is already 5, :41). User decision.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/CONTEXT.md: auth, health, push and kit sections.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/android/{login,create-account,program-picker,summary,my-profile,change-password,health-connect,notifications-alerts,member-management,widgets}/SPEC.md: D-rules + changelog rows. Rewrite program-picker A-4/A-5.

- **DB surface**: none. Client-only; every write goes through live API routes (`health_sync_*`, `app_events`, `member_push_tokens`, `push_deliveries`, `program_invites` sit behind the API). No migration.

- **Flags/env/config involved**:
  - `BuildConfig.VERSION_CODE` / `VERSION_NAME` / `API_BASE_URL`; the `staging` build type (build.gradle.kts).
  - Render env, set by the user only after Play adoption, not in this release's code: `MIN_ANDROID_VERSION_CODE`, `LATEST_ANDROID_VERSION_CODE`, `BLOCK_UNVERSIONED_ANDROID` (all unset / off today).
  - FCM channel ids `rasi_invites` / `rasi_default`.
  - Health Connect permissions unchanged: no background-read permission (D-6), so no new Play declaration.

- **Blast radius**:
  - Network.kt and Session.kt sit under EVERY Android API call. auth is depended on by members, programs, program-memberships, notifications, invites, workouts, program-workouts, workout-logs, daily-health-logs, analytics, analytics-v2, member-analytics, observability, apple-health, health-connect and health-sync, so regression-check every Android screen (quick-add widget screens included).
  - health-sync's dependents are none. app-config, observability and frontend-kit have no feature dependents.
  - Parity to hold:
    - web (C1) + iOS (C2): auth §3.1 (incl. "Sign out everywhere" copy and placement), notifications §3.3, invites §3.1, observability event names and props, frontend-kit copy (§3 verbatim) and banner behavior, instant opens for picker + Summary.
    - iOS only (C2): health-sync §8, the app-config gate and banner.

- **Live-binary compat**: none. The backend is unchanged and every contract this build uses is live since 2026-10-13. Notes:
  - (a) Live Android 1.0.0 (4)/(3) keeps the old POST→409→PUT sync, the list-derived invites (still broken, no shim) and sign-out on any refresh non-2xx (auth D-C14a). This build fixes the last one.
  - (b) Flipping `BLOCK_UNVERSIONED_ANDROID` or setting `MIN_ANDROID_VERSION_CODE` later blocks 1.0.0. That is a user decision after rollout. The new build must send `X-App-Version` on the refresh and SSE clients too, or it would be 426'd itself.

- **Doc↔code mismatches found**:
  - **No widget token read exists.** The task premise is that the quick-add widget reads the ONE token store. The Glance widgets (P/widget/*.kt) hold no token; they deep-link through `WidgetRoute` → RootScreen → ProgramContext → the single Session. No widget file change is needed; the look stays (D-ANDROID-WIDGET-4).
  - **CONTEXT.md, storage:** says "session/prefs in DataStore". The DataStore dependency is declared but unused; tokens are EncryptedSharedPreferences `rasi.fiters.session`, appearance is SharedPreferences `rasi.fiters.prefs`, health state is `rasi.health`.
  - **CONTEXT.md, login ride-along:** says login "accepts push_token+device_id". `ProgramContext.login` sends neither (:173-176); OAuth sends only `pushToken`, with no `platform`.
  - **CONTEXT.md, sleep sync:** says sleep uses a "daily-health-logs upsert". It is really POST→409→PUT.
  - **program-picker page SPEC A-4/A-5:** rests on the false premise that invites arrive in `GET /programs` (prod has 0 such rows). Accept goes through `PUT /program-memberships`, which returns 404.
  - **Picker "All Invites" tab:** the label exists for global admins (ProgramActionsSheet.kt:~96), but Android never calls `/all-invites`.
  - **registry.json pending flips:** health-sync and observability have `consumed_by` [], app-config has [ios].
  - **Version already pre-bumped:** versionCode is already 5 in build.gradle.kts, matching RELEASES.md's pre-bump.

- **Out of scope (explicitly)**:
  - `apps/backend`, `apps/web`, `apps/ios`.
  - Android background sync / WorkManager (D-6).
  - Notification redesign and People / social (board §9–§10, Phase 4).
  - Any page or widget restyle, palette repointing (D-KIT-10), and kit adoption on screens this release doesn't otherwise touch (Members, Lifestyle, details, log forms).
  - Pull-to-refresh beyond picker + Summary.
  - Admin all-invites / revoke, unless open question 6 says yes.
  - Play in-app update library, unless open question 2 says yes.
  - Orchestrator-owned docs: specs/features/**, registry.json, both REGISTRY.md files, RELEASES.md, PROGRESS.md, specs/initiatives/reliability-overhaul/**, plus the ENV_RUNBOOK "Android OAuth client per signing key" checklist line. The planner lists these under "Docs for the orchestrator".

- **Open questions for the orchestrator**:
  1. **Version (user decision).** Propose versionName **1.1.0**, versionCode **5** (unused; RELEASES.md requires ≥ 5).
  2. **Update button.** A plain Play Store intent (recommended, no new dependency) or `com.google.android.play:app-update-ktx` for an in-app immediate update (board §1 says "when available")?
  3. **"Sign out everywhere" placement and copy.** Must match C1/C2. Proposal: My Profile → Sign-in methods section, above Delete Account, with a confirm dialog.
  4. **Offline / stale banners.** Picker + Summary only (kit scope rule), or app-wide from RootScreen? App-wide would break the clearance rule on screens with bottom actions.
  5. **Foreground FCM vs the SSE modal.** notifications §3.2 says "Android shows foreground messages", but the SSE modal also fires. Show both (contract as written), or suppress the tray notification while the stream is connected?
  6. **Global-admin invites.** Should Android adopt `GET /all-invites` + `revoke` (iOS has it), or stay with My Invites only?
  7. **Notification permission.** Is board §3.5 ("asked in context with a settings fallback; unregister when revoked") in this release? Today POST_NOTIFICATIONS is requested on every signed-in launch and the result is ignored (RootScreen.kt:62-80).
  8. **Health state on explicit sign-out.** Keep the per-member local toggles so the same member resumes (proposed; server `GET /state` restores the review and last success), or wipe them?
  9. **Pull-to-refresh.** Confirm pull-to-refresh on picker + Summary (an invisible gesture, needed for the `pull_to_refresh` sync trigger).
  10. **Update-screen page SPEC.** Does the blocking update screen get its own page SPEC (specs/pages/android/update-required/SPEC.md, which needs a pages-REGISTRY row from the orchestrator), or is it documented in splash/widgets?
