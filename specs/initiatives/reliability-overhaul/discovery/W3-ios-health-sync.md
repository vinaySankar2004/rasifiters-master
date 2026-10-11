# W3 — iOS Apple Health sync: discovery brief

> Phase 0, read-only, 2026-10-11. The code read is live iOS 1.4.2 (56): no health-sync file has changed since
> 2026-07-05. Member ids are truncated to 8 chars. Platform = `member_push_tokens.platform`.

## 1. Summary

- **The 409s come from iOS sleep/steps sync, by design — CONFIRMED.** Each sync re-POSTs the last ~15 days per
  program, gets 409, then PUTs. Render logs match the 409 metric within 1% on 4 of 5 days, and iOS members
  account for at least 99% of them.
- **Background delivery breaks Apple's contract.** Observers are registered from a view-owned object instead of
  `didFinishLaunching`, the observer is acknowledged before the sync runs, and nothing keeps the app awake for
  the sync. Production data agrees: syncs bunch into 1–14 UTC hours a day, with gaps of 3+ days and catch-ups of
  up to 12 days.
- **Any logout silently disconnects sync.** Workouts are wiped and re-gated and sleep is switched off. Workouts
  done between the logout and the reconnect are never synced. This links W3 to W1.
- **Workout minutes are being double-counted in prod.** One member had 69 historical rows summed in a single
  minute. Deletions are ignored, sources aren't deduplicated, and the 45-day ledger is shorter than an anchor can
  be held.
- **S2 is PARTIAL.** The keychain uses the default `WhenUnlocked`, but that isn't the main failure. "Failed
  handlers cause backoff" is refuted, because the completion handler is always called. The real faults are the
  early acknowledgement and where the observers are registered.

## 2. How it works today

**Registration.** Observers and `enableBackgroundDelivery` start only in `ProgramContext.init`
(`ProgramContext.swift:255` → `+Auth.swift:54-56` → `+HealthKit.swift:261-265`, `+HealthKitSleep.swift:200-204`,
`+HealthKitSteps.swift:199-203`). `ProgramContext` is `AppRootView`'s `@StateObject` (`AppRootView.swift:5`), so
it exists only once a scene connects. `AppDelegate.didFinishLaunching` registers nothing
(`AppDelegate.swift:18-24`).

Frequency is `.immediate` for workouts and `.hourly` for sleep/steps (`HealthKitService.swift:108`,
`+Sleep.swift:144`, `+Steps.swift:103`). Results are discarded.

**Observer handler.** It runs `if error == nil { onUpdate() }; completionHandler()`
(`HealthKitService.swift:100-105`, `+Sleep.swift:135-140`, `+Steps.swift:94-99`). `onUpdate` only spawns
`Task { await self?.perform…() }` with a `[weak self]` capture (`+HealthKit.swift:262-264`), so HealthKit is
acknowledged before any work starts.

There is no `beginBackgroundTask` or `BGTaskScheduler` anywhere; the `fetch` mode (`Info.plist:9-12`) has no
handler.

**Triggers.**

| Flow | Triggers |
|---|---|
| Workouts, sleep | Launch `.task` (`AppRootView.swift:42-56`), auth change (`:57-66`), foreground (`:87-99`), program entry (`AdminHomeView.swift:64-70`), observer |
| Steps | Its observer, connect, and Sync Now only. SPEC §3b says otherwise |

**Fetch.**

*Workouts* use an `HKAnchoredObjectQuery`. The first sync is floored at the connect date
(`HealthKitService.swift:62-87`), and `deletedObjects` are discarded (`:77`). The anchor commits only after a
clean run (`+HealthKit.swift:111-117,201`).

The anchor is held when:
- a write was retryable,
- no program window resolved (`:123-130`),
- an in-window program is locked (`:149`),
- a confirmation was deferred (`+HealthSyncGating.swift:196-204`).

Workouts are grouped by (type, **start** day) across **all sources** (`HealthKitService.swift:146-165`).

*Sleep and steps* have no anchor. They re-query a rolling window of 14 days plus today
(`+Sleep.swift:21,47-69`, `+Steps.swift:20,47-82`).

**Upload.**

*Workouts:* `POST /api/workout-logs` with `on_duplicate:"sum"` (`APIClient+Workouts.swift:277-324`). On a primary
key collision the backend adds the minutes (`logService.js:192-214`). The only idempotency is the client-side
`HealthKitAppliedLedger`, keyed `uuid|programId` and pruned at 45 days (`HealthKitAppliedLedger.swift:16,44-53`).

*Sleep and steps:* POST, then on 409 (`logService.js:544-547`) a PUT (`APIClient+DailyHealth.swift:61-77,120-135`).
There is no in-run retry; the next trigger retries.

**Auth.** The token is captured once per run (`+HealthKit.swift:89`, `+Sleep.swift:76`, `+Steps.swift:76`).
Each writer refreshes only for its own retry (`APIClient+DailyHealth.swift:51-53`, `APIClient+Workouts.swift:310-312`).
The refresh reads the keychain (`APIClient.swift:114`).

**Keychain.** No `kSecAttrAccessible` is set, so items default to `WhenUnlocked`. Saves delete then add, and
ignore the add's status (`KeychainService.swift:7-20`). Tokens are read at init (`+Auth.swift:38-39`).

**Logout.** `signOut` calls `clearHealthKitSettings` (`+Auth.swift:153`), which clears the enabled flag, anchor,
ledger, connect date and confirmations (`+HealthKit.swift:268-296`). Separately, `authToken→nil` stops workouts
and sleep and persists them as disabled (`AppRootView.swift:67-71`). Steps is not touched.

## 3. Production evidence

| # | Query (window) | Result |
|---|---|---|
| P1 | Render `http_request_count` by status, daily, 10-04→10-11 (labels are bucket *ends*) | 409/day: 929, 690, 678, 1,207, 685, 471, 569, 304. 201: 8–35/day. 401: 902–1,142/day |
| P2 | Render app logs, UTC days 10-06…10-10: `daily_health_logs` point lookups (one per POST/PUT, `logService.js:544,883`) minus INSERTs, ÷2 | Estimated POST-409s 1,073 / 687 / 473 / 573 / 310 vs the metric's 1,207 / 685 / 471 / 569 / 304. Sources: 4–6 members/day, all iOS except one Android member at 1–6/day. Active UTC hours per member/day: 1–14 |
| P3 | `daily_health_logs` created in the last 60 days, by platform | iOS: 6 members, 261 rows (259 with steps). Android: 6 members, 95 rows. Both: 1 member, 153 rows |
| P4 | Steps-row creation lag (UTC created − `log_date`), 60 days | iOS (n=259): same day 47%, +1d 23%, +2–3d 11%, +4–7d 10%, ≥8d 9% (includes connect backfills) |
| P5 | Steps creation events per member (hour buckets), 60 days | iOS gaps: p50 1.0d, p90 2.3d, max 15.7d. Twelve gaps of ≥3d across 6 members; catch-ups of up to 12 days. Android: p90 6.3d, max 18d |
| P6 | `workout_logs` modified >1h after creation, grouped by minute, 90 days. (Manual and synced rows can't be told apart: there is no source column) | iOS `d57dad74`: **69 rows** (dates 07-15→09-04) at 09-23 07:09, plus **13 rows** (09-22→10-02) at 10-06. iOS `e0cb469d`: 9 rows at 08-23. Untokened `41ce9cbf`: 28 rows over 7 minutes (sync or manual, unclear). Only the sum path changes many rows like this; manual edits are one row per request (`logService.js:430-462`) |
| P7 | `workout_logs` with `duration ≥ 240` | iOS `6b1d3c25`: **3,466 and 3,482 minutes** (~58h) on 09-12 and 09-13 |

## 4. Failure modes

Evidence: **PD** = proven by production data · **PC** = proven by code · **PL** = plausible.

| # | Trigger → mechanism → symptom | Likelihood | Evidence |
|---|---|---|---|
| F1 | HealthKit launches the app in the background → observers exist only if a scene creates `ProgramContext` (`AppDelegate.swift:18-24`, `AppRootView.swift:5`) → no acknowledgement → HealthKit backs off and stops after 3 misses → reopening re-registers (`+HealthKit.swift:261-265`): "disconnects, then resumes" | High | PC (the deviation from Apple's guidance), consistent with P2 and P5. Whether a scene connects on these launches is unverified |
| F2 | Acknowledged before the work (`HealthKitService.swift:100-105`) and no background assertion → the app is suspended partway through 30–60 sequential requests → partial syncs | High | PC |
| F3 | A background scene is disconnected → `ProgramContext` is freed while the singleton observers live on → `self?` is nil but HealthKit is still acknowledged → silent no-op wakes | Medium | PL |
| F4 | Any logout (W1/S1) → `+Auth.swift:153` plus `AppRootView.swift:67-71` → workouts and sleep are OFF after re-login. Reconnecting resets the connect date (`+HealthKit.swift:47-48`), so **workouts done in the gap are lost** and the review screen reappears | High | PC |
| F5 | A sync starts with an expired token (any wake more than 1h after the last refresh) → every row sends the stale token: 401 → refresh → retry, and sleep/steps rows refresh twice → 401 bursts and token rotations that feed S1 | High | PC (not countable: no request logs) |
| F6 | Each sleep/steps sync makes ~15 days × programs × (409 + PUT) requests. The steps observer fires on every new sample while the app is open | Certain | PD (P1, P2) |
| F7 | A workout is re-saved/deleted, a second app writes it, or the anchor is held >45 days → deletions are ignored (`HealthKitService.swift:77`), sources aren't deduped (`:146-158`), and the ledger prune (`HealthKitAppliedLedger.swift:16`) is shorter than the hold → **double-summed minutes** | Medium | PD (P6). The 10-06 rows are 4–14 days old, which rules out the prune and points to a re-save or a second source |
| F8 | A multi-day or runaway workout → bucketed on its start day (`:155`), and the backend accepts any positive integer (`logService.js:127-130`) | Low | PD (P7) |
| F9 | `ProgramContext` is built while the device is locked → the keychain returns nil (`+Auth.swift:38-39`) → the login UI shows and `refreshSessionIfNeeded` exits early (`+Auth.swift:94`). Separately, delete-then-add (`KeychainService.swift:15-19`) can lose the token if the add fails while locked | Low (for sync) | PL |
| F10 | Smaller gaps:<br>• steps never runs on foreground (`AppRootView.swift:49-54,94-99`)<br>• a selected program that was left or hasn't started holds the anchor forever (`+HealthKitWindows.swift:19-39`), which feeds F7<br>• health `UserDefaults` aren't per-user, so settings carry over to the next account | Low | PC |

"Resumes oddly" is most likely one or more of:
- a 5–12-day catch-up with a burst of "Synced N…" notifications (P5),
- the review screen coming back after a logout (F4),
- toggles found switched off (F4),
- inflated workout minutes (F7).

## 5. Suspect verdicts

**S2 — PARTIAL.**
- The `WhenUnlocked` keychain default is confirmed (`KeychainService.swift:9-19`).
- HealthKit reads do fail while the device is locked, but the code handles that safely: it returns `.failed`,
  holds the anchor, and retries.
- Apple caches health writes until unlock, so HealthKit wakes come mostly after unlock. That makes the keychain
  a minor factor for sync, though it may matter for W1 (F9).
- "Failed handlers make HealthKit back off" is **REFUTED**: `completionHandler()` is always called, even on
  error. The real backoff risk is F1, and F2 is the related early-acknowledgement fault.

**409 origin — CONFIRMED** as the iOS sleep/steps POST-then-PUT (P1, P2). Android contributes about 0–7 a day.
Workout 409s are rare under sum-on-conflict.

## 6. Divergences from Android Health Connect

**Android has no background sync** (S3/W4). It syncs only on launch, auth, foreground and program entry
(`RootScreen.kt:74,94`, `AppScaffold.kt:93`), and runs all three flows on each trigger
(`HealthSyncController.kt:101-105`). Its workouts use a changes token; an expired token re-reads everything since
connect (`HealthConnectManager.kt:66-91`).

**The same as iOS:**
- deletions are ignored (`:86`),
- the 45-day ledger (`HealthStore.kt:168`), so it carries the same F7 risk,
- sum-on-conflict (`HealthSyncController.kt:682`),
- POST→409→PUT (`:698-744`).

Android produces fewer 409s only because it syncs less often.

## 7. Industry-standard target (contract only)

1. **Register at launch** [a, b]. Observers and `enableBackgroundDelivery` are set up in `didFinishLaunching`
   on every launch, owned by a long-lived service rather than a view. Check the result and respect the hourly
   caps.
2. **Acknowledge after the work, exactly once** [c, e]. Call the completion handler only after the run ends
   (success or failure), inside a background-task assertion.
3. **Lock-safe** [d, f]. A locked read means acknowledge and defer — never an auth failure. Store credentials as
   `AfterFirstUnlock(ThisDeviceOnly)` and save with add-or-update.
4. **Independent of the session.**
   - A fresh token per request from a single-flight provider.
   - A 401 after refresh means retry later, never disable sync.
   - Only an explicit disconnect clears sync state.
   - Sync configuration is stored per account.
5. **Idempotent batch contract.** One upsert per flow per run (a batch upsert already exists,
   `logService.js:555-561`). Each item carries an idempotency key; the server returns per-item outcomes. No
   409-as-control-flow.
6. **Cursor rules.**
   - Advance the cursor only after the server acknowledges.
   - Propagate deletions.
   - Dedupe on the server.
   - Apply a workout source/overlap policy and duration bounds.
7. **Best-effort freshness** [g]. Background delivery and `BGAppRefreshTask` are opportunistic; only the
   foreground is guaranteed. Catch-ups are bounded and silent.
8. **Observable.** Every run emits an event: trigger, foreground/background, counts, outcome, duration.

Sources:
- [a] https://developer.apple.com/documentation/healthkit/executing-observer-queries
- [b] https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)
- [c] https://developer.apple.com/documentation/healthkit/hkobserverquery/init(sampletype:predicate:updatehandler:)
- [d] https://developer.apple.com/documentation/healthkit/protecting-user-privacy
- [e] https://developer.apple.com/documentation/uikit/uiapplication/beginbackgroundtask(expirationhandler:)
- [f] https://developer.apple.com/documentation/security/ksecattraccessibleafterfirstunlock
- [g] https://developer.apple.com/documentation/backgroundtasks/bgtaskscheduler

## 8. Live-binary constraints

- iOS 1.4.2 (56), 1.4.3 (57) and lingering 1.4.0/1.4.1 all run this code. Android 1.0.0 (3)/(4) shares the write
  contract.
- The backend must keep these behaviours while those binaries are live:
  - daily-health POST returns **201 or 409**, followed by a partial **PUT**. A 200 upsert would make old binaries
    count every day as `.created` and send spurious notifications.
  - **`on_duplicate:"sum"`** returns **200/201**.
  - **400/403/404** mean skip; anything else means retry.
- Until adoption, old binaries will keep producing the 409s, the 401 bursts and the double-sums. The server can
  make those cheaper, but it can't stop them.
- Any new idempotency key must be optional, with legacy behaviour when it's absent.
- A keychain-accessibility change needs a new binary that re-saves the existing items.

## 9. Open questions for the user

1. Do `d57dad74` and `e0cb469d` use a second app that writes workouts (Strava, Garmin, a gym app)? Did they
   restore or replace their phone around 08-23, 09-23 or 10-06? The answer decides between F7's causes.
2. What does "resumes oddly" look like to reporters: the review screen, a burst of notifications, toggles
   switched off, or inflated minutes?
3. Is "fresh within ~1h without opening the app" a requirement, or is "fresh on open" enough? Apple guarantees
   neither.
4. Should a logout keep health sync connected, scoped per account?
5. Keep sum-on-conflict, or move to server-side per-sample dedup (and re-decide the manual-log interaction,
   SPEC F5/§10)?
6. Should workout duration be capped per day? Two rows of about 58 hours exist.
7. Do the affected testers force-quit the app or use Low Power Mode? Both limit background launches.
