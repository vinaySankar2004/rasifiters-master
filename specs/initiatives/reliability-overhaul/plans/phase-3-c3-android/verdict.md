# Phase 3 track C3 — plan-adversary verdict

# PLAN VERDICT — OBJECTIONS (12)

All 12 objections are ADVISORY. I found nothing BLOCKING: no data loss, no double count, no sign-out loop, no live-binary break, no parity break against a backend contract.

1. **[ADVISORY] Step B2 won't compile as written (TokenRefresher).** It calls `.map<TokenRefreshResponse, Attempt> { … }`. The stdlib signature is `inline fun <R, T> Result<T>.map(...)`, so the type arguments are in the wrong order: R becomes TokenRefreshResponse, T becomes Attempt, and the receiver doesn't match.
   Failure scenario: the "copy-paste-ready" code fails checkpoint B. Fix: `.map<Attempt, TokenRefreshResponse>` or `.map { it -> Attempt.Ok(...) as Attempt }`.

2. **[ADVISORY] Offline with an expired token shows the "busy" message instead of the offline message.** In B2, `call()` turns an IOException into `Transient("offline")`. `tokenForRequest()` then throws `AuthUnavailableException` once the token has expired, and B4 maps that to `UNAVAILABLE`. That breaks frontend-kit D-KIT-4 ("Any transport failure → offline", SPEC.md:155).
   Failure scenario: the app sits idle for more than 1 h, then opens in airplane mode. Every request fails before reaching the network. Summary's first-open ErrorView and the change-password error both say "RaSi Fiters is busy right now…" instead of the offline copy. This hits checklist item 2. Fix: carry the attempt kind on `AuthUnavailableException` and map `offline`/`timeout` to OFFLINE/TIMEOUT.

3. **[ADVISORY] A program that was silently confirmed (0 rows) gets the review screen again after a reinstall.** The plan sends `review_done` only after a user confirm (C7). But `sync_success` is sent for that program on later runs, so the server has `last_success_at` (health_connect) and no `review_done_at`. This contradicts health-sync §8 rule 7 ("same member resumes … with no review screen (D-8)") and rule 6 ("not after a reinstall").
   Failure scenario: connect a program with no data, sync for weeks, reinstall, sign in. A review page lists 30 days of data that already synced. Fix: in `ServerState`, treat a `last_success_at` on the same integration as a local confirm only, with no PUT. Checklist item 11 (iOS still reviews) stays intact. Cross-track with C2.

4. **[ADVISORY] On the picker, the floating banner covers the last program card.** The LazyColumn's bottom `contentPadding` is 120.dp (ProgramPickerScreen.kt:186). The banner's top sits about 146 + 12 + 52 + 12 dp plus the nav bar above the bottom. Summary gets an 84.dp spacer in F5c; the picker gets nothing.
   Failure scenario: while offline, stale, or with an update available, the last card can't be scrolled clear. This breaks the standing "UI must fit" gate.

5. **[ADVISORY] Two page-SPEC D-rules would contradict the new code.** program-picker D-C1 (SPEC.md:28: banner "on any load/delete/invite/reorder failure") and summary D-C1 (SPEC.md:25) both stay as written. Meanwhile F4/F5 move load errors to ErrorView and FloatingBanner. The H3 table rewrites A-4/A-5 and adds A-7/D-C3 but never marks D-C1 as superseded or narrowed.

6. **[ADVISORY] The blocking "Update required" screen can be covered.** It is drawn as the last child of the root Box (G5e). But `NotificationModal` is a `Dialog` (NotificationModal.kt:35), and `ProgramActionsSheet` / `AccountMenuSheet` are `ModalBottomSheet`s. All of those are separate windows that render above it.
   Failure scenario: a 426 arrives while a sheet is open, or an SSE alert arrives. The user keeps interacting "through" the gate. Fix: hide modals and sheets while `updateRequired`.

7. **[ADVISORY] A widget tap can stall for up to 15–30 s with no feedback.** G5d `await`s `versionGate.check()` before the widget replay, and that call has the 15 s connect + 15 s read timeouts. On a weak network the form simply doesn't open. Fix: `withTimeoutOrNull(3_000) { versionGate.check() }`.

8. **[ADVISORY] One stale anchor, and missing imports at checkpoint B.**
   - A14 cites the FCM service comment at AndroidManifest.xml :77-78. It is actually at :71-72.
   - D4 says the ProgramContext imports (`TokenRefresher`, `ClientEventQueue`, `signInFailed` / `forcedSignOut`, `AppErrorException`, `toAppError`) are added "in this step, because checkpoint D needs them". But B8a, B8c and B8h already use them, so checkpoint B fails as written.

9. **[ADVISORY] `PendingInviteDTO` field names are ambiguous (A2).** Only `inviteId` and `programId` are explicitly given `@SerialName`. The other seven are listed bare.
   Failure scenario: if the implementer leaves them without `@SerialName`, `ignoreUnknownKeys` silently decodes `program_name` and the dates as null. Every card then shows "Unknown Program" and "Start – End". Fix: spell out the snake_case `@SerialName` for every field.

10. **[ADVISORY] Change/set-password can show raw "Invalid token." text.** In B4, `toCredentialMessage()` passes the server's text through for 401. On the authenticated credential routes, auth §3.1 rule 2 says a 401 means the session, not wrong credentials. Because these writes use a one-shot body, OkHttp runs the authenticator (the refresh succeeds) but does not replay the request. The original 401 reaches the UI.
    Failure scenario: a clock-skewed token produces a 401 on `/auth/change-password`. The user sees "Invalid token." although a manual retry would succeed. Fix: limit server text for 401 to the public sign-in routes.

11. **[ADVISORY] The 15 s timeout applies per phase, not per request.** B3 sets connect, read and write timeouts of 15 s each. The board (§6.4) says "requests time out at 15 s", and the plan's Docs line tells the orchestrator to record "15 s timeouts". Worst case is about 45 s. Either use `callTimeout(15, SECONDS)` or record the per-phase meaning.

12. **[ADVISORY] Upgrade-run deviations not recorded, and file size.**
    - Health-sync rule 9 says the upgrade run "always … read workouts from today − 30 days. No age test". C5 uses `catchUpStart(oldest, today−30)`, so if another Android device of the same member already has a health_connect `last_success_at`, the upgrade window is shorter. This isn't listed among the Docs D-rules.
    - The C7 runner is about 240 lines against the plan's own "≤ ~200" claim.
    - ProgramContext (1,269 lines) gains invites, push routing, SSE wiring, programs/summary state and teardown, despite the brief's "keep edits here thin".

**What I checked (all six angles):**

- **Consumers:** grepped every changed symbol across all Android source. That covers `authToken`, `programsLoading`, `summaryError`/`summaryLoading`, `respondToInvite`, `onNewPushToken`, `startNotificationStreamIfNeeded`, the three `performXSync` functions, `onTrigger`, `GoogleSignInButton`/`fetchGoogleIdToken`, `linkGoogle`, `unregisterDevice`, `WorkoutSample`/`HealthStore` constructors, and every `OkHttpClient`. Every caller is covered by the plan. Web and iOS are untouched; no backend contract changes, so there is no cross-surface parity break.
- **Backend:** read `routes/auth.js` (link/unlink ignore `refresh_token`; logout takes Bearer and/or body), `authService.refreshAccessToken` (401 `session_invalid` / 503 only), `routes/clientEvents.js` and its service (no 401, prop sanitising), `utils/push/fcm.js` (channel ids, data keys) and the health-sync validators (instant regex, sample_id/origin charsets).
- **SPECs:** checked against auth §3.1, health-sync §3/§8 (rules 1–11), notifications §3.1–3.3, invites §3.1, observability §8/§8.1, app-config D-C4/D-C5, frontend-kit §6/§10/D-KIT-4, and DESIGN_BOARD §1–§6.
- **Anchors and versions:** verified the anchors in ProgramContext, Network, Session, RootScreen, the picker, the actions sheet, Summary, Profile, ChangePassword, Login, CreateAccount, the HC settings screen and AppScaffold (all correct except the manifest one). All 11 page-SPEC versions match the H3 table. versionCode 5 is unused per RELEASES.md.
- **Live binaries:** none affected (backend unchanged); all three OkHttp clients send the `X-App-*` headers.

Key files:
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/net/Network.kt`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/core/kit/AppError.kt`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/programs/ProgramPickerScreen.kt`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/components/NotificationModal.kt`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/AndroidManifest.xml`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/android/program-picker/SPEC.md`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/android/summary/SPEC.md`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/health-sync/SPEC.md`
