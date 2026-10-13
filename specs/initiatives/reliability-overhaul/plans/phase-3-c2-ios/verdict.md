# Phase 3 track C2 — plan-adversary verdict

# PLAN VERDICT: OBJECTIONS (13)

1. **[BLOCKING] The plan sets the rule-9 upgrade marker for more users than the SPEC allows, and this can double-count workouts.**
   - Evidence: plan step 2a.1, `HealthSyncPrefs.migrateLegacyIfNeeded`: `if hadLedger || isEnabled(.workout, member: member) { …upgradeMarker }`. health-sync §8 rule 4 limits the today − 30 d read to "a device that held an old-build ledger".
   - Nothing announces this change. It has no benefit: when the ledger is empty, `catchUpStart` already reads from `max(connectDate, today−30)`, which covers every sample since connect, held ones included. The only effect is that pre-connect samples get imported.
   - Failure scenario:
     - A member connects workouts on 1.4.3 12 days ago. No workout has synced since, so the ledger is empty.
     - 20 days ago they manually logged "Running 30 min", and the same run is in Apple Health.
     - On upgrade the marker is set and the anchor is nil, so the read starts at today − 30.
     - The 20-day-old run uploads as a new sample. The server adds its minutes to the manual row, which becomes 60 min.
     - Without the extra condition, the connect-date rule (12 days) would exclude it.
   - Fix: `if hadLedger { set marker }`.
   - Separately, for the orchestrator: rule 9 itself imports pre-connect workouts from the last 30 days for ledger holders, silently, because the review is carried over. That deserves a SPEC look.

2. **[ADVISORY] Two snippets presented as copy-paste-ready will not compile.**
   - Evidence: `APIClient.data(for:)` contains `allowRefresh ? try await rawData(for: request) : try await transport(request)`, and `uploadHealthSync` contains `tooBig ? nil : try await rawData(for: request)`. Swift rejects both: "'try'/'await' cannot appear to the right of a non-assignment operator".
   - Fix: `try await (allowRefresh ? rawData(for: request) : transport(request))`, or an if/else.

3. **[ADVISORY] Any keychain error other than "locked" signs the user out and deletes the session.**
   - Evidence: `SessionStore.readKeychain` maps every non-locked `OSStatus` to `.unreadable`. `restorePersistedSession` then calls `SessionTeardown.end(.forced("token_store_unreadable"))`, and `store.clear()` deletes the item.
   - Board §2 client 3 says a locked keychain keeps the session.
   - Failure scenario: a transient `errSecNotAvailable` (-25291) or -34018 at launch signs the user out and destroys a still-valid token pair. That is the random-logout class this initiative is meant to kill.
   - Fix: only a decode failure of a `.found` item should count as unreadable. Other statuses should behave like `.locked` (keep the session, read again later).

4. **[ADVISORY] After Disconnect and reconnect, up to 30 days of disconnected-period data now uploads silently.**
   - Evidence: decision 3 / D-IOS-SYNC-3 keeps `review_done_at`. The `catchUpStart` code uses `last_success_at − 1 d` for programs that have it.
   - Failure scenario: a user disconnects workouts for 3 weeks, then reconnects. Every workout from those 3 weeks uploads with no review. In 1.4, a reconnect started fresh from the reconnect date and showed a review.
   - The rule is labelled, but this consequence for the user is not stated. Either get the user's explicit OK, or use `max(lastSuccess−1d, connectDate)` as the floor for workouts on reconnect.

5. **[ADVISORY] The new "Sign out everywhere" row changes how an existing screen looks.**
   - Evidence: step 1.20 adds a permanent row to `AccountMenuSheet`. The standing rule (net-new UI must not restyle pages) says new controls stay collapsed or floating, and the page looks identical until used.
   - Alternative with no layout change: add "Sign out everywhere" as a second destructive action in the existing Sign Out confirmation, using a `confirmationDialog`.
   - Whichever placement is chosen, C1 and C3 must use the same one.

6. **[ADVISORY] Background triggers are not spaced while the app is in the foreground.**
   - Evidence: `Trigger.isSpaced` excludes `.background`. `HKObserverQuery` handlers fire on every saved sample while the app is in the foreground; `.hourly` only limits background delivery.
   - Failure scenario:
     - A user walks with the Summary tab open.
     - Each steps write triggers a full run: GET /state, POST /batch and PUT /state. That is 3 calls out of the shared limit of 60 per member per 10 minutes, and the 429 then blocks Sync Now.
     - Steps that come back `updated` count as applied, so `dataChanged` bumps `summaryRefreshToken` and Summary refetches 8 endpoints, which show no steps data.
   - Fix: space `.background` while `applicationState == .active`, and bump the Summary token only when workouts were applied or removed.

7. **[ADVISORY] The notification re-fetch never removes items, and re-fetched invites don't refresh the inbox.**
   - Evidence: `loadUnacknowledgedNotifications` only adds items (the old code replaced the queue).
   - Failure scenario 1: a modal still queued on iOS is acknowledged on web. It reappears on the next foreground.
   - Failure scenario 2: a `program.invite_received` that arrives while the app is backgrounded is merged into the queue, but `refreshData` is never called for it. The picker badge stays stale, which conflicts with invites §3.1 ("refresh on every SSE or push invite_received").

8. **[ADVISORY] The push-tap behaviour differs from the SPEC and from Android, and this is still unresolved.**
   - Evidence: D-IOS-PUSH-2 is "acknowledge + re-fetch only". notifications §3.2 "Clients (next builds)" and board §3.5 say "acknowledge + open the target".
   - The plan defers this to the orchestrator. It must be decided before implementation, because otherwise iOS and Android ship different tap behaviour.

9. **[ADVISORY] The notification stream can open while the app is in the background.**
   - Evidence: in `startNotificationStreamIfNeeded`, the Task never checks `Task.isCancelled` after `await validAccessToken()`.
   - Failure scenario: `suspendNotificationStream()` runs during a slow refresh. The stream still connects.
   - Fix: add `guard !Task.isCancelled` after the await.

10. **[ADVISORY] A failed review commit can permanently exclude a row the user wants.**
    - Evidence: `commitReviewPage` saves the unchecked rows as exclusions before the PUT, and exclusions only ever accumulate.
    - Failure scenario: the user unchecks row X and taps the tick while offline, so the PUT fails. They re-check X and tap again. X stays excluded and never uploads.
    - Fix: record exclusions after a successful PUT, or remove keys the user re-checked.

11. **[ADVISORY] Offline use generates a burst of `auth.refresh_failed` events.**
    - Evidence: while offline with a token close to expiry, each stream reconnect leads to `validAccessToken`, a refresh, the 5 s retry, and an event. Each 30 s back-off window repeats this.
    - Result: roughly 100+ events per hour, which fill the 200-event queue and are flushed in one burst on reconnect.
    - Fix: pause stream reconnects while `isOnline == false`, or record one event per offline period.

12. **[ADVISORY] Summary shows placeholder numbers under the error view.**
    - Evidence: in `.failed`, `ErrorStateView` sits above cards that still render whatever ProgramContext holds: zeros, or the previous program's values, since `clearInMemorySession` and program switches don't reset analytics.
    - Failure scenario: switching from program A to program B while the load fails shows A's numbers under B's header. That contradicts kit §6 ("never fake zeros").

13. **[ADVISORY] Docs and anchors need small corrections.**
    - "Docs for the orchestrator" is missing two caller-note updates: workout-logs D-C9 ("only the iOS Apple Health sync sends on_duplicate:sum") and daily-health-logs (`writeHealthKitSleepLog` / `writeHealthKitStepsLog`). After this release only old binaries use those paths.
    - Smaller items:
      - Step 3.6 deletes `deregisterPushTokenIfDenied` from `+Auth`, but it lives in `+Notifications.swift:74`. That file is replaced wholesale anyway.
      - Step 2b.13's range `:3-136` includes `extension APIClient {` (line 10), which the same step says to keep.
      - The risk note says rule 6 "covers" a CFNetwork PUT replay. It does not: `hadUnconfirmedAttempt` is false on the first response.
      - `/oauth/complete` failures emit no `auth.sign_in_failed`, which is a parity gap.
      - A Disconnect during an in-flight run lets the run write back `setAnchor` / `recordRun` for the disconnected kind; only sign-out has a guard.

**What I checked:**
- I read every briefed iOS file at the cited anchors. All the anchors I spot-checked matched. The stale ones are listed in item 13.
- Grep for consumers across `apps/ios` of every removed or renamed symbol: `rawData`, `authFailureHandler`, `refreshAccessTokenIfPossible`, `isOffline` / `offlineNotice`, `loadAnalytics*`, `loadPendingInvites`, `signOut`, the `HealthSyncResult` / `writeHealthKit*` / ledger and window helpers, `PushTokenNotification.didUpdate`, `deregisterDevice`, and `APIError` / `APIHTTPError` pattern matches. Every caller is handled.
- Web and Android are untouched, and there is no backend contract change, so there is no cross-surface parity break beyond the shared copy and event names (items 5, 8, 13).
- I checked the plan against:
  - auth §3.1;
  - health-sync §3 / §8, rules 1–11;
  - notifications §3.1–3.3;
  - invites §3.1;
  - observability §3.2 / §8 / §8.1, including the event vocabularies and `error_class`;
  - frontend-kit §3–§6 / D-KIT-8 / D-KIT-9;
  - app-config;
  - apple-health §8 D-rules;
  - board §2 / §3 / §6.
- No D-rule ID collisions in the page or feature SPECs. Page version cells match.
- Backend `authenticateToken` behaviour: a staging build cannot consume the prod ledger, because a prod token gets 401 on staging and the upgrade stays pending.
- Live binaries are unaffected: iOS only, no backend change.

Relevant files:
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Services/HealthKitAppliedLedger.swift`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Services/SessionStore.swift`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Models/ProgramContext+Notifications.swift`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Features/Home/ProgramPickerView.swift`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/health-sync/SPEC.md`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/workout-logs/SPEC.md`
