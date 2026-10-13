# Phase 3 client release — approval amendments (all three tracks)

> **Status: APPROVED by the user 2026-10-13 (U1–U3 as recommended) — binding.** Implementers apply these ON TOP of their
> track's `plan.md`; where a plan and this file disagree, this file wins. Evidence:
> [`phase-3-client-parity.md`](phase-3-client-parity.md) (P#) and each track's `verdict.md` (C1#/C2#/C3#).
> Shared docs (feature SPECs, registry, REGISTRY, RELEASES) stay orchestrator-owned: one docs commit at landing.

## 1. User decisions

| # | Decision | Answer |
|---|---|---|
| U1 | Binary versions | iOS **1.5.0 (58)** (new train; pre-bump to 1.5.1 (59) right after upload) · Android **1.1.0 (5)** |
| U2 | Push tap | An **invite** push opens the invite inbox (iOS: a published flag `ProgramPickerView` consumes to present `ProgramActionsSheet` on its Invites tab; Android as planned); any other type acknowledges + re-fetches. notifications §3.2 amended to match |
| U3 | "Sign out everywhere" placement | **My Profile, above Delete Account, on all three**, behind a confirm dialog. iOS moves its row out of `AccountMenuSheet` into `MyProfileView` using the existing row idiom |

## 2. Shared rules (every track)

| # | Rule |
|---|---|
| A1 | **One copy table** (casing follows each surface's button idiom). Sign out everywhere: label `Sign out everywhere` · hint `Signs you out on every device, including this one.` · dialog `Sign out everywhere?` / `You'll be signed out on all your devices, including this one.` / confirm `Sign out everywhere`. Password success: `Password updated. Your other devices will be signed out.` · set: `Password set. Your other devices will be signed out.` · rule 6: `We couldn't confirm your password change. It may have gone through, so try signing in with your new password.` · invite: `Invitation sent` (only on 200; the PUT /invite-response message is not shown — invites §3.1 amended). Forced sign-out: kit `signedOut` (`Your session has ended. Please sign in again.`) |
| A2 | **Forced sign-out is explained on all three:** the teardown sets a one-shot reason; the login screen shows A1's `signedOut` once in its existing error slot (no new chrome) |
| A3 | **Refresh policy:** quick retry `min(Retry-After ?? 2, 5)` s; then backoff 30 / 60 / 120 / 300 s; sign out **only** on `401` + `code == "session_invalid"` — every other refresh failure enters backoff. Skew: iOS adopts Android's lifetime expiry (store `receivedAt`; expires at `receivedAt + (exp − iat)`); web keeps its 5-min gap. Teardown resets refresh state on all three (Android `TokenRefresher.reset()`). iOS access token with a nil refresh token → sign out, reason `token_store_unreadable`; only a keychain **decode** failure counts as unreadable — other statuses behave like `locked` (C2#3) |
| A4 | **SSE:** 1 s base, ×2, 30 s cap, full jitter, 60 s idle timeout, reset + re-fetch `/unacknowledged` on `ready`; pause reconnects while offline. Android: `MAX_DELAY_MS = 30_000`, stream client `readTimeout(60, SECONDS)`. Keep a short-lived set of acknowledged ids and filter re-fetches on it (C1#5); a re-fetch drops items acknowledged elsewhere and refreshes the invite inbox when it carries invite notifications (C2#7) |
| A5 | **Foreground push:** no duplicate — iOS `willPresent` returns `[.badge]` while the stream is connected (Android already skips the tray post) |
| A6 | **Offline banner is global** on all three: one connectivity monitor → one floating banner (iOS at the `AppRootView` root, Android in `RootScreen`/`AppScaffold` honouring per-screen insets; web as planned). Lists get bottom padding while a banner shows (C3) |
| A7 | **Update-available banner:** program picker only. Android's blocking screen opens the Play Store listing with a plain intent (no in-app-update library) — app-config D-rule. Android hides `NotificationModal` + sheets while `updateRequired` is set; the widget replay wraps `versionGate.check()` in `withTimeoutOrNull(3_000)` (C3) |
| A8 | **Credential errors:** server text only for 400 / 401 / 409 / 422 on the public sign-in routes; authenticated routes map through the kit (C3: no `Invalid token.` on password routes). iOS `MyProfileView` link / unlink / email → `credentialMessage`, profile save → `AppError`; iOS drops `refresh_token` from link/unlink and its guard (auth D-C14c). Web shows the kit `unknown` copy on a Google provider failure |
| A9 | **Password writes after a 401:** refresh, then re-send **once** (the write never ran) on all three — Android re-sends after `ApiException 401` while keeping one-shot for connection-failure replays |
| A10 | **Invite inbox:** global admins keep **All Invites + Revoke** on Android (`fetchAllInvites`, a Revoke pill when `isGlobalAdmin`). Card actions: retire the *invited* Accept/Decline on all three cards (the inbox is the one path); keep the *requested* Cancel Request on all three. Web shows accept / decline / revoke errors via a `respondError` line in `InvitesTab` + the decline modal (catch the decline `mutateAsync`). Android `PendingInviteDTO` gets explicit `@SerialName` on every field |
| A11 | **Events:** `auth.refresh_failed` once per failure cycle (after the quick retry); iOS emits `auth.sign_in_failed` for `/oauth/complete` and carries `request_id`; Android drops 415 batches like 400 |
| A12 | **Device registry:** `PUT /device` at most once per 12 h unless the token or permission changed; unregister once per denial (memo) — both mobile surfaces; notifications §3.1 amended |
| A13 | **Summary + picker:** pull-to-refresh on both screens on iOS + Android; Summary pull = reload now, sync in the background, reload again if the sync applied data. Partial failures keep the parts that loaded (Android stops failing all seven reads). The error view never sits over another program's or zero values (C2#12) |
| A14 | **Launch cache:** written only while a session token exists (no write after teardown — C1#2); cleared by the teardown |

## 3. Health sync (iOS + Android)

| # | Rule |
|---|---|
| H1 | **Review once:** `review_done: true` is sent **only after the user confirms a review**. A first sync with 0 rows stays a local confirm; a same-integration `last_success_at` also counts as a local confirm (so a reinstall doesn't re-ask — C3) |
| H2 | **Disconnect** clears the toggle, programs, status, connect date and anchor / changes token; keeps exclusions and confirmed reviews; sends nothing to the server. Android removes `clearExcludedKeys` + `clearConfirmedPrograms` from the disconnect paths. **Reconnect:** the workout read starts at `max(last_success − 1 d, reconnect date)` — the disconnected period is not imported silently (today's connect-date rule) |
| H3 | **Upgrade marker (rule 9)** is set only when the old build held a ledger (`hadLedger`), never because workouts are merely enabled (C2 blocking #1) |
| H4 | **Run semantics:** manual / connect / pull-to-refresh triggers wait for an in-flight run (Android `runMutex.withLock`, not `tryLock`); `sync_success` per (program, kind) minus held keys; data with no resolvable window holds the anchor and reports `failed` (faithful); nothing to send → `sync.run` outcome `skipped`. Exclusions are recorded only after a successful `PUT` (C2#10) |
| H5 | iOS: space `.background` observer wakes while the app is active and bump Summary only for workout changes (C2#6) |

## 4. Track-specific fixes

- **C1 web:** fix the two-tab guard — adopt any stored same-account pair with a later `exp` regardless of time left, then refresh with the adopted refresh token if near expiry (verdict blocking #1). Set-password: call `passwordSetDone()` when the refetch shows `has_password` (C1#3). Redo test S4 with a valid-then-expired recovery token while signed in (C1#4).
- **C2 iOS:** wrap the `try await` ternaries in `APIClient.data(for:)` + `uploadHealthSync` (C2#2); `Task.isCancelled` guard after the stream's await (C2#9); the doc / anchor fixes in C2#13.
- **C3 Android:** `Result.map<Attempt, TokenRefreshResponse>` (B2); offline + expired token maps to `OFFLINE`, not `UNAVAILABLE`; `callTimeout(15, SECONDS)`; `MemberManagementScreens.kt:144` → `Invitation sent`; mark the picker / Summary page-SPEC D-C1 rules superseded; record the rule-9 upgrade-window deviation; fix the manifest anchor (:71-72) and import checkpoint.

## 5. Orchestrator (docs commit at landing)

Bumps (max per feature): auth 0.14.0 · notifications 0.5.0 · app-config 0.3.0 · health-sync 0.2.0 · observability
0.3.0 · frontend-kit 0.2.0 · invites 0.2.1; D-rule IDs assigned once; each track's "Docs for the orchestrator" list +
§1–§3 above recorded as D-rules; release checklist line "an Android OAuth client exists for every signing key that
ships" (W5).
