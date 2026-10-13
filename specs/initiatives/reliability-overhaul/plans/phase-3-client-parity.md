# Phase 3 client release — cross-surface parity check

> Output of the `parity-check` agent (2026-10-13) over the three plans. Decisions: [`phase-3-client-amendments.md`](phase-3-client-amendments.md).

OBJECTIONS: 8 blocking and 15 advisory parity breaks across C1 (web), C2 (iOS) and C3 (Android). The blocking ones: health-sync review-once and Disconnect rules contradict each other between iOS and Android; push-tap behaviour, the "Sign out everywhere" placement and copy, the refresh retry/backoff/skew constants, the SSE reconnect values and the forced-sign-out message each differ by surface; web still hides invite-response errors. Checked: auth §3.1 + §9, notifications §3.1–3.3, invites §3.1 + §9, observability §8/§8.1, health-sync §3 + §8, frontend-kit, app-config, DESIGN_BOARD §1–§7, and the live web/iOS/Android code at the cited anchors. No out-of-scope page or widget restyle found: every UI change is either required by a contract or a floating banner, and Android's InviteCard keeps the existing card chrome.

## 1. [blocking] Health review-once: the silent confirm when a first sync finds no data (ios vs android)

C2 HealthSyncPlan.stateEntries sends `review_done: true` for every `autoReviewed` key, meaning an unreviewed (program, kind) with 0 rows. C3 keeps that 0-row confirm local only, and its cross-track risk #5 says 'C2 must not push those'. health-sync §8 rule 6 says review_done is sent only 'after the user confirms'. Failure: a member connects Apple Health for program P with no data yet, so iOS writes review_done_at. Their Health Connect phone, or iOS once back-dated data arrives, then never shows the first-sync review for P, because rule 6 accepts a review from any integration. C3 checklist #11 passes or fails depending on which device connected first.

**Fix:** Write one rule into health-sync §9. Recommended (matches the SPEC wording): C2 drops `review_done` for autoReviewed keys and keeps only sync_success. If iOS must keep D-CONF's 'no review later' on the device, add a per-member local autoReviewed set to HealthSyncPrefs, as Android's local confirmed list does.

## 2. [blocking] Health Disconnect semantics (ios vs android)

C2 D-IOS-SYNC-3: Disconnect clears the toggle, programs, status, connect date and anchor, keeps exclusions, and sends nothing to the server. C3 step C8 keeps HealthSyncController.kt:119-188 except `ledgerClear()`, so `clearExcludedKeys` and `clearConfirmedPrograms` still run. C3's runner then re-confirms from the server (`eligible.filter { state.isReviewed }…markProgramConfirmed`). Failure: on Android, review P → uncheck rows → Disconnect → reconnect. No review shows (the server has review_done_at), the exclusions are gone, and the rows the user rejected are uploaded on the next run if they fall inside the catch-up window. iOS never does this. C2 decision 3 asks C3 to mirror its rule; C3 doesn't.

**Fix:** C3 C8: remove `clearExcludedKeys` (and the now-redundant `clearConfirmedPrograms`) from disconnectWorkouts/Sleep/Steps. Record one shared Disconnect D-rule in health-sync §9 and mark D-CONF's 'reconnect re-gates' as superseded in both apple-health and health-connect.

## 3. [blocking] Push tap behaviour (ios vs android (vs notifications §3.2))

notifications §3.2 'Clients (next builds)': a tap acknowledges and 'opens the target (type + program_id)'. C3 4g/D9/D12b: acknowledge, then route (an invite opens ProgramActionsSheet on My Invites, anything else pops to the picker). C2 D-IOS-PUSH-2: acknowledge and re-fetch with no navigation. C2 itself says 'The orchestrator must decide parity.' As planned, tapping an invite push opens the inbox on a Pixel but leaves the iPhone on whatever screen it was on.

**Fix:** Decide before implementation. Recommended minimum on both: an invite tap opens the invite inbox (iOS: a published flag that ProgramPickerView consumes to present ProgramActionsSheet on its Invites tab), and other types only acknowledge and re-fetch. Amend §3.2 to match.

## 4. [blocking] 'Sign out everywhere': placement and copy (web vs ios vs android)

Web: My Profile above Delete Account; button 'Sign Out Everywhere'; hint 'Signs you out on every device, including this one.'; dialog 'Sign Out Everywhere?' / 'You'll be signed out on all your devices, including this one.' iOS: AccountMenuSheet row under Sign Out on the program picker; 'Sign out everywhere'; alert body 'You'll be signed out of RaSi Fiters on all your devices, including this one.' Android: My Profile → Sign-in methods under Password; row 'Sign out everywhere' / 'End your session on all devices, including this one.' with a red 'Sign out' TextButton. All three plans call themselves the parity anchor. Board §2 backend 4 puts the action in 'account settings'.

**Fix:** Record one placement and one string table in auth §9. Recommended: My Profile, above Delete Account, on all three (2 of 3 plans plus the board's 'account settings'; standardise toward the majority). iOS moves its row into MyProfileView using the existing row idiom. Use one title, one dialog body and one confirm label on all three; casing may follow each surface's existing button idiom.

## 5. [blocking] Refresh policy constants, clock-skew guard and the sign-out trigger (web vs ios vs android)

Quick retry: web uses min(Retry-After ?? 2, 5) s; iOS min(Retry-After ?? 1, 5) s; Android (Retry-After ?: 2) clamped to 1..4 s. Backoff: web 30/60/120/300 s; iOS a flat max(Retry-After, 30) s; Android 5/10/20/40/60 s. Clock-skew guard: web refuses a proactive refresh within 5 min of the last one; Android computes expiry from lifetime (receivedAt + exp − iat); iOS has none. iOS `expiresSoon` compares exp with the device clock, so a phone ≥ 59 min fast refreshes before every request — the refresh-storm pattern this initiative exists to stop. Sign-out trigger: iOS `exchange()` tears down on ANY /refresh 401, without checking `code`; a non-retryable 400 gets no backoff, so the refresh is retried on every request. Web and Android sign out only on 401 + `session_invalid`, as board §2 rule 3 requires. C1 says C2/C3 must use its values; neither plan does.

**Fix:** One auth §9 D-rule with fixed values. Recommended: quick retry min(Retry-After ?? 2, 5) s; backoff 30/60/120/300 s; sign-out only on 401 && code == 'session_invalid'; any other refresh failure enters backoff. For skew, iOS adopts Android's lifetime-based expiry (store receivedAt next to the pair); web keeps its 5-min gap as its idiom. C3 changes QUICK_RETRY_MAX_S to 5 and backoffMs to 30/60/120/300; C2 changes its default to 2 s, makes the backoff escalate, and checks the code.

## 6. [blocking] SSE reconnect values and dead-stream detection (android vs web/ios)

Reconnect cap: web 30 s (C1 writes '1 s ×2, cap 30 s' into notifications §3.3 0.5.0); iOS 30 s; Android 60 s (`MAX_DELAY_MS = 60_000L`). §3.3 says the values are 'fixed by the client plans', meaning one set. Idle detection: iOS gets a 60 s idle timeout from `timeoutIntervalForRequest = 60`, which the 25 s pings keep alive. Android `Network.streamClient()` keeps `readTimeout(0)`, as in today's NotificationStreamClient.kt:26-28. A half-open stream after a Wi-Fi→cell switch then never errors, so Android never reconnects or re-fetches /unacknowledged until the next ON_STOP/ON_START.

**Fix:** C3: set MAX_DELAY_MS = 30_000 and give streamClient() readTimeout(60, SECONDS), matching iOS. Put the full value set (1 s base, ×2, 30 s cap, full jitter, 60 s idle, reset on `ready`, re-fetch on `ready`) into notifications §3.3 once.

## 7. [blocking] Forced sign-out: what the user is told (web vs ios/android)

Web: a forced teardown redirects to /login?reason=expired, which shows the kit signedOut copy 'Your session has ended. Please sign in again.' C1 lists that string as a constant C2/C3 must mirror. iOS: checklist S4 expects 'signs out at its next refresh with no alert'. Android: the gate flips to the auth graph with no message. Unexplained logouts are this initiative's core complaint, and here the three surfaces would handle them differently.

**Fix:** iOS: SessionTeardown `.forced` sets a one-shot published reason; LoginView shows KitCopy signedOut once in its existing alert or error slot. Android: tearDown(forcedReason) sets a StateFlow that LoginScreen shows in its existing errorMessage slot. No new chrome. Record in auth §9.

## 8. [blocking] Web hides invite accept/decline/revoke errors (web vs ios/android)

apps/web/src/app/programs/page.tsx:401-418: an accept failure is caught and swallowed ('keep modal open on error') and revoke uses `mutate` with no onError. At :594-603, decline's `mutateAsync` rejection is unhandled. C1 step 23 adopts the kit only for the invites LOAD error, and step 17 only swaps onSuccess for onSettled. Failure: an expired invite gets 400 'This invite has expired.' (or 404 'Invite not found or already processed.') and the web user sees nothing. iOS shows the AppError message in the 'Unable to update invitation' alert; Android shows it in FormErrorText.

**Fix:** C1 step 23: add a respondError state set from `toAppError(error).message` in respondInviteMutation.onError, cleared on the next attempt. Render it as the existing rf-danger text line in InvitesTab and in the decline modal, and catch the decline mutateAsync.

## 9. [advisory] Offline banner scope (web vs ios/android)

Web adds one global `FloatingBanner variant="offline"` in shell.tsx, shown on every page. iOS LaunchScreenBanner shows offline only on the picker and Summary. Android shows it on the picker and Summary only (Q4). Board §6.4 calls for 'one connectivity monitor → one floating offline banner'.

**Fix:** Choose one scope in frontend-kit §9. Either the banner is global on all three (iOS at the AppRootView root; Android in RootScreen/AppScaffold, honouring per-screen insets), or web limits it to /programs and /summary.

## 10. [advisory] Global-admin invite inbox on Android (android vs web/ios)

Web and iOS global admins use GET /all-invites, an 'All Invites' label and `revoke`. C3 Q6 makes the tab 'My Invites' for every role with no all-invites or revoke. Today's Android labels the tab 'All Invites' for global admins, so this is a visible regression for them. invites §3.1: 'Global admins also use GET /all-invites and action: "revoke"'.

**Fix:** Either add fetchAllInvites plus a Revoke pill (shown when isGlobalAdmin) to InviteCard, or have the user explicitly approve the gap as an invites §9 D-rule.

## 11. [advisory] F3 card accept/decline path (program-memberships) (web vs ios vs android)

Web C1 step 17 removes the card Accept, Decline and 'Cancel request' buttons. Android C3 D12c removes 'invited' Accept/Decline but keeps 'requested' Cancel Request. iOS keeps both (ProgramPickerView.swift:355-360 → respondToInvite :479 → updateMembershipStatus); C2 only rewires its success and catch handling. Invisible in prod (0 such rows).

**Fix:** One rule in invites D-C8 for all three: retire the card actions on iOS and Android too (status text only), or keep 'requested' Cancel everywhere.

## 12. [advisory] Error mapping on credential screens (web vs ios/android)

Web `credentialErrorMessage` shows server text for every 4xx except 408/426/429. iOS SessionCopy.credentialMessage and Android toCredentialMessage show it only for 400/401/409/422, so 403 (the staging +stg guard) and 404 ('Credentials not found.') read differently. iOS MyProfileView link/unlink (:301), email change (:407) and profile save (:422/:454) also keep `localizedDescription`, i.e. raw 503/500 server text, on a screen C2 touches. iOS still sends refresh_token on link/unlink and blocks them when it is missing (ProgramContext+Auth.swift:291-309); web and Android drop it per auth D-C14c.

**Fix:** Use one set in frontend-kit §9 (recommend 400/401/409/422 on all three). C2 routes MyProfileView's link/unlink/email errors through credentialMessage and profile-save errors through AppError, and removes the refreshToken guard and parameter.

## 13. [advisory] Password rule-6 and success copy; Android 401 re-send (web vs ios vs android)

'Couldn't confirm' copy differs on every surface. Web: 'We couldn't confirm your password change. It may have gone through, so try signing in with your new password.' iOS: '...It may have gone through. Try signing in with your new password before trying again.' Android: '...so try your new password the next time you sign in.' Success copy: web 'Password updated. Your other devices will be signed out.' / 'Password set. …'; iOS and Android keep 'Password Updated / Your password has been changed successfully', and set-password shows nothing. Android's X-One-Shot body means that on a 401 the authenticator refreshes but OkHttp won't re-send the body, so Android shows the 401 text. Web and iOS refresh and re-send once (C1's rule-6 401 clarification).

**Fix:** One AUTH_COPY table in auth §9 used verbatim on all three. C3: after an ApiException 401 on changePassword/setAccountPassword, re-send once (the write never ran); keep one-shot so connection-failure replays stay blocked.

## 14. [advisory] Invite copy (android vs web/ios)

Android MemberManagementScreens.kt:144 still shows 'Invite sent', and C3 lists the file as needing no edit. iOS changes to 'Invitation sent'; web shows 'Invitation sent.' (invites §3.1). invites §3.1 also says to show the PUT /invite-response 200 message ('human text — show it'). None of the three plans shows it, and C3's D-rule cites iOS.

**Fix:** C3 edits :144 to 'Invitation sent'. The orchestrator amends invites §3.1 to 'response message not shown', since all three agree.

## 15. [advisory] Version-gate soft nudge scope and update path (ios vs android)

iOS LaunchScreenBanner shows 'update available' on the picker AND Summary. Android shows it on the picker only (Q4), and its cross-track #3 says iOS should match. Android uses a plain Play intent; board §1 and app-config say 'Play in-app immediate update when available'.

**Fix:** Pick one scope (recommend picker only; iOS passes the update branch only from ProgramPickerView). Record Android's plain intent as an app-config §9 D-rule with the user's OK.

## 16. [advisory] Foreground push presentation (ios vs android)

iOS willPresent always returns [.banner, .sound, .badge], so an SSE-connected app shows both the system banner and the in-app modal. Android suppresses the tray post while SSE is connected (checklist #8: 'no tray duplicate').

**Fix:** Either record this as an Android-only D-rule in notifications §9, or have iOS return [.badge] while notificationStreamClient is connected.

## 17. [advisory] Client event details (web vs ios vs android)

Web reports auth.refresh_failed on every attempt, including before the quick retry (2 events per failure cycle); iOS and Android report once, after the retry. iOS handleCompleteSocial (/oauth/complete) emits no auth.sign_in_failed; web and Android do. iOS events never carry request_id; web and Android quote it. Android ClientEventQueue drops only 2xx/400 batches, so a 415 backs off forever; iOS drops 400/415 and web drops every non-retryable 4xx.

**Fix:** Web: report once, after the quick retry. iOS: record the oauth/complete failure (method from the pending provider) and pass APIHTTPError.requestId. Android: drop 415 as well.

## 18. [advisory] Teardown and refresh edge cases (android, ios)

Android TokenRefresher `blockedUntilMs`/`consecutiveFailures` are not reset by tearDown; web (`resetRefreshState`) and iOS (`resetRefreshBackoff`) reset theirs. iOS with a stored access token but a nil refresh token never signs out: performRefresh returns nil and every call 401s indefinitely. Web forces `token_store_unreadable` in that case, and Android treats it as signed out.

**Fix:** Add a TokenRefresher.reset() called from tearDown. iOS treats `.tokens(refresh: nil)` as unreadable, which forces a sign-out with reason token_store_unreadable.

## 19. [advisory] Health-sync run semantics drift (ios vs android)

Android runOnce uses `runMutex.tryLock()`, so manual Sync Now, connect and pull_to_refresh during an in-flight run return Skipped; iOS waits and runs again for non-spaced triggers. sync_success: iOS sends it per (program, kind) minus held keys; Android only when the whole flow advanced (C3 Docs h). Data with no resolvable window: iOS holds the anchor and reports 'failed' (faithful 1.4); Android advances the token and reports success. sync.run outcome for a run with nothing to send: iOS 'skipped', Android 'success'.

**Fix:** Android: non-automatic triggers take runMutex.withLock instead of tryLock. Write the other three as single health-sync §8 D-rules and align the losing plan.

## 20. [advisory] Pull-to-refresh and partial-failure UX (ios vs android)

iOS Summary `.refreshable` awaits the whole pull_to_refresh sync before reloading; Android reloads at once and syncs in the background. Android adds picker pull-to-refresh; iOS explicitly doesn't (D-IOS-KIT-2). Android loadSummary uses coroutineScope/async, so one failed read fails all seven (ErrorView or stale banner); iOS and web apply partial successes.

**Fix:** Align on 'reload now, sync in the background, reload again if it applied data' for Summary pull-to-refresh. Record picker pull-to-refresh and partial-failure handling as frontend-kit D-rules, or align them.

## 21. [advisory] Device-registry cadence (ios vs android)

iOS sends PUT /device on every foreground (as notifications §3.1 says) and POST /device/unregister on every foreground while permission is denied, with no memo. Android re-PUTs at most every 12 h and unregisters only if it had registered.

**Fix:** Record Android's 12 h throttle as a D-rule in notifications §9, and add a 'denied → unregistered' memo on iOS, or align both.

## 22. [advisory] Feedback when the provider (Google) fails (web vs ios vs android)

Android maps Credential Manager failures to human messages (W5). iOS shows the generic kit 'unknown' copy. Web's onProviderError only reports the event, so the user sees nothing on a GSI failure.

**Fix:** C1 step 10/11: onProviderError also sets errorMessage to KIT_COPY unknown (or a mapped message).

## 23. [advisory] SPEC version and D-rule ID reconciliation (web vs ios vs android (docs))

Predicted bumps conflict: auth 0.14.0 (C1) vs 0.13.1 (C2/C3); notifications 0.5.0 (C1/C3) vs 0.4.1 (C2); app-config 0.2.1 (C2) vs 0.3.0 (C3). Parallel D-rule IDs will collide: C2 claims auth D-C16, frontend-kit D-KIT-13, notifications D-C17 and health-sync D-C13, while C1 and C3 add unnumbered D-rules to the same SPECs.

**Fix:** Orchestrator takes the max bump per feature (auth 0.14.0, notifications 0.5.0, app-config 0.3.0, health-sync 0.2.0, observability 0.3.0, frontend-kit 0.2.0, invites 0.2.1) and assigns D-rule IDs once, in one docs commit.

## Uncovered

- invites §3.1: show the PUT /invite-response 200 message — no plan shows it (all three agree on not showing it, so the SPEC needs amending)
- notifications §3.2: on iOS, a push tap 'opens the target' — C2 defers it (D-IOS-PUSH-2); only Android routes
- invites §3.1: global-admin GET /all-invites + revoke on Android — C3 drops it
- board §1 / app-config: Android 'Play in-app immediate update when available' — C3 uses a plain store intent (needs a D-rule and the user's OK)
- board §6.4: one floating offline banner on iOS + Android — only the picker and Summary are covered (web is global)
- Telling the user why they were signed out after a forced sign-out on iOS + Android — only web covers it
- Kit adoption on touched screens: web /programs invite-response errors (silent today); iOS MyProfileView link/unlink/email/profile-save errors (only set-password is adopted)
- observability §8: auth.sign_in_failed for iOS /oauth/complete failures
