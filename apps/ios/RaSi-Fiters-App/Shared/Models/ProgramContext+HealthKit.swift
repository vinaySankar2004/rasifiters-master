import Foundation
import HealthKit

/// Apple Health auto-sync lifecycle on `ProgramContext`: connect/disconnect, the sync run, and
/// UserDefaults persistence. The workout mapping + HealthKit access live in `HealthKitService` /
/// `HealthKitWorkoutTypeMap`; the backend write is `APIClient.writeHealthKitWorkoutLog`.
extension ProgramContext {

    private enum HealthKitDefaultsKeys {
        static let enabled = "healthkit.enabled"
        static let syncProgramIds = "healthkit.syncProgramIds"
        static let lastSyncDate = "healthkit.lastSyncDate"
        static let lastSyncCount = "healthkit.lastSyncCount"
        static let lastSyncFailed = "healthkit.lastSyncFailed"
        static let connectDate = "healthkit.connectDate"
    }

    /// Outcome of one sync run, consumed ONLY by the manual "Sync Now" button (automatic triggers
    /// discard it — failures there are silent and retry on the next trigger, D-SIL). `.skipped` =
    /// a guard bailed (disabled / already syncing / a confirmation is pending).
    enum HealthSyncResult {
        case synced(Int)    // clean run; N = created + summed
        case failed         // couldn't reach the server (or read HealthKit) — will retry next trigger
        case skipped
    }

    // MARK: - Connect date (first-sync cutoff)

    /// Set on first connect; used as the first-sync cutoff so we never backfill arbitrary history.
    var healthKitConnectDate: Date? {
        UserDefaults.standard.object(forKey: HealthKitDefaultsKeys.connectDate) as? Date
    }

    // MARK: - Start / stop

    func startHealthKitSync() {
        guard HealthKitService.shared.isAvailable else { return }

        // Ask for notification permission (no-op if push already authorized) so sync results can appear.
        HealthKitSyncNotifier.requestAuthorizationIfNeeded()

        Task {
            do {
                try await HealthKitService.shared.requestAuthorization()
                await MainActor.run {
                    isHealthKitEnabled = true
                    if healthKitConnectDate == nil {
                        UserDefaults.standard.set(Date(), forKey: HealthKitDefaultsKeys.connectDate)
                        // Fresh (re)connect: re-gate every program so this first sync is reviewed again.
                        clearConfirmedPrograms(.workouts)
                    }
                    persistHealthKitSettings()
                }
                HealthKitService.shared.startBackgroundDelivery { [weak self] in
                    Task { @MainActor in await self?.performHealthKitSync() }
                }
                await performHealthKitSync()
            } catch {
                await MainActor.run { isHealthKitEnabled = false }
            }
        }
    }

    func stopHealthKitSync() {
        HealthKitService.shared.stopBackgroundDelivery()
        isHealthKitEnabled = false
        persistHealthKitSettings()
    }

    // MARK: - Sync

    private static var isSyncing = false

    // Stashed while a first-sync confirmation is awaiting the user: the fetch's new anchor is committed
    // only after the whole flow finishes cleanly (see `commitPendingWorkoutAnchorIfClean`). Static because
    // Swift extensions can't add instance stored properties (there's a single `ProgramContext`).
    static var pendingWorkoutAnchor: HKQueryAnchor?
    static var pendingWorkoutHadRetryable = false
    // Set when an in-window workout was skipped because its target program is admin-locked for this
    // viewer. Holds the anchor (like the offline case) so the held workouts re-sync once unlocked.
    static var pendingWorkoutLockHeld = false

    @discardableResult
    @MainActor
    func performHealthKitSync() async -> HealthSyncResult {
        guard !ProgramContext.isSyncing,
              isHealthKitEnabled,
              HealthKitService.shared.isAvailable,
              let token = authToken, !token.isEmpty,
              let memberName = loggedInUserName, !memberName.isEmpty,
              !healthKitSyncProgramIds.isEmpty else { return .skipped }

        // A workout confirmation is already awaiting the user — don't recompute (it would clobber the
        // stashed anchor and reset the in-progress review). Resumes on the next trigger after it closes.
        if pendingSyncConfirmation?.flow == .workouts { return .skipped }

        ProgramContext.isSyncing = true
        defer { ProgramContext.isSyncing = false }

        HealthKitAppliedLedger.prune()

        let fetch: HealthKitService.FetchResult
        do {
            fetch = try await HealthKitService.shared.fetchNewWorkouts(firstSyncCutoff: healthKitConnectDate)
        } catch {
            // Couldn't read HealthKit (e.g. permission not granted) — leave the anchor, retry next
            // trigger. A local condition, not a server-reach failure: the persisted flag stays as-is.
            return .failed
        }

        if fetch.workouts.isEmpty {
            HealthKitService.shared.commitAnchor(fetch.newAnchor)   // advance past a clean scan
            lastHealthKitSyncDate = Date()
            lastHealthKitSyncFailed = false
            persistHealthKitSettings()
            return .synced(0)                                       // nothing new → silent (D7)
        }

        let aggregated = HealthKitService.shared.aggregate(fetch.workouts)
        let programIds = healthKitSyncProgramIds
        // Each workout only writes to a program whose [start, end] window covers its date — keeps
        // out-of-window ("eons ago") workouts from landing in a program that doesn't span them.
        let windows = await loadSyncWindows(for: programIds, token: token)
        if windows.isEmpty {
            // Couldn't resolve any program window (e.g. offline background trigger) — do NOT commit the
            // anchor, or these workouts would be dropped for good. Retry on the next trigger.
            lastHealthKitSyncFailed = true
            persistHealthKitSettings()
            return .failed
        }

        var synced = 0
        var hadRetryable = false
        var lockHeld = false                                          // an in-window workout hit an admin-locked program
        var pageRows: [String: [PendingSyncConfirmation.Row]] = [:]   // unconfirmed programs → review rows
        let confirmed = confirmedProgramIds(.workouts)
        let excluded = excludedKeys(.workouts)

        for workout in aggregated {
            for programId in programIds {
                guard let window = windows[programId],
                      ProgramContext.date(workout.date, isWithin: window) else { continue }
                let key = ProgramContext.workoutExclusionKey(
                    programId: programId, date: workout.date, workoutName: workout.workoutName)
                if excluded.contains(key) { continue }   // user un-checked this once — never write it

                // Program is admin-locked for this viewer → skip the write, don't collect a review
                // row, and hold the anchor so this in-window workout re-syncs once it's unlocked.
                if isDataEntryLocked(programId: programId) { lockHeld = true; continue }

                if confirmed.contains(programId) {
                    // Steady state: write only the samples not yet applied to THIS program (the
                    // idempotency ledger, D-SUM) — a replayed batch adds nothing twice, while genuinely
                    // new same-day samples sum on top via the backend's on_duplicate:"sum".
                    let unapplied = workout.samples.filter {
                        !HealthKitAppliedLedger.isApplied(uuid: $0.uuid, programId: programId)
                    }
                    guard !unapplied.isEmpty else { continue }
                    let outcome = await APIClient.shared.writeHealthKitWorkoutLog(
                        token: token, memberName: memberName, workoutName: workout.workoutName,
                        date: workout.date,
                        durationMinutes: HealthKitService.AggregatedWorkout.minutes(of: unapplied),
                        programId: programId, memberId: loggedInUserId)
                    switch outcome {
                    case .created, .summed:
                        synced += 1
                        HealthKitAppliedLedger.markApplied(uuids: unapplied.map(\.uuid),
                                                           programId: programId, date: workout.date)
                    case .duplicate, .skipped: break   // nothing was added → NOT ledger-marked
                    case .retryable: hadRetryable = true
                    }
                } else {
                    // First influx for this program → collect for the confirmation instead of writing.
                    pageRows[programId, default: []].append(PendingSyncConfirmation.Row(
                        title: workout.workoutName,
                        subtitle: "\(ProgramContext.displayDate(workout.date)) · \(workout.durationMinutes) min",
                        exclusionKey: key,
                        payload: .workout(workout)))
                }
            }
        }

        // Unconfirmed programs that produced no rows (0-row first sync) confirm silently — but never
        // a locked program (nothing was written to it; leave it to review when it unlocks).
        for programId in programIds
            where !confirmed.contains(programId)
               && pageRows[programId] == nil
               && !isDataEntryLocked(programId: programId) {
            markProgramConfirmed(programId, flow: .workouts)
        }

        lastHealthKitSyncCount += synced

        let pages = buildConfirmationPages(pageRows)
        if pages.isEmpty {
            // Nothing to confirm — commit unless something must replay (hold the anchor if a lock
            // deferred an in-window workout, so it re-syncs after the unlock). Failures are SILENT
            // for automatic triggers (D-SIL): the persisted flag drives the settings status line and
            // the manual Sync Now button consumes the returned result. Partial success still
            // announces the synced count (no-op at 0).
            if !hadRetryable && !lockHeld { HealthKitService.shared.commitAnchor(fetch.newAnchor) }
            lastHealthKitSyncDate = Date()
            lastHealthKitSyncFailed = hadRetryable
            persistHealthKitSettings()
            HealthKitSyncNotifier.notifySuccess(count: synced)
            return hadRetryable ? .failed : .synced(synced)
        }

        // Pending pages exist — stash the anchor + any silent-write failure and present the confirmation.
        // The anchor commits in `finishConfirmation` once the user taps through every program cleanly; a
        // deferred flow leaves the anchor uncommitted so the same batch is safely re-offered next trigger.
        ProgramContext.pendingWorkoutAnchor = fetch.newAnchor
        ProgramContext.pendingWorkoutHadRetryable = hadRetryable
        ProgramContext.pendingWorkoutLockHeld = lockHeld
        lastHealthKitSyncFailed = hadRetryable
        persistHealthKitSettings()
        enqueuePendingConfirmation(PendingSyncConfirmation(flow: .workouts, pages: pages))
        return hadRetryable ? .failed : .synced(synced)
    }

    /// Commit the stashed anchor iff the compute-time silent writes had no retryable failure. Called by
    /// `finishConfirmation` when the user finishes every workout page. Clears the stash either way.
    @MainActor
    func commitPendingWorkoutAnchorIfClean() {
        if !ProgramContext.pendingWorkoutHadRetryable, !ProgramContext.pendingWorkoutLockHeld,
           let anchor = ProgramContext.pendingWorkoutAnchor {
            HealthKitService.shared.commitAnchor(anchor)
            lastHealthKitSyncDate = Date()
            persistHealthKitSettings()
        }
        ProgramContext.pendingWorkoutAnchor = nil
        ProgramContext.pendingWorkoutHadRetryable = false
        ProgramContext.pendingWorkoutLockHeld = false
    }

    // MARK: - Persistence

    func persistHealthKitSettings() {
        let defaults = UserDefaults.standard
        defaults.set(isHealthKitEnabled, forKey: HealthKitDefaultsKeys.enabled)
        defaults.set(Array(healthKitSyncProgramIds), forKey: HealthKitDefaultsKeys.syncProgramIds)
        defaults.set(lastHealthKitSyncCount, forKey: HealthKitDefaultsKeys.lastSyncCount)
        defaults.set(lastHealthKitSyncFailed, forKey: HealthKitDefaultsKeys.lastSyncFailed)
        if let date = lastHealthKitSyncDate {
            defaults.set(date, forKey: HealthKitDefaultsKeys.lastSyncDate)
        } else {
            defaults.removeObject(forKey: HealthKitDefaultsKeys.lastSyncDate)
        }
    }

    func restoreHealthKitSettings() {
        let defaults = UserDefaults.standard
        isHealthKitEnabled = defaults.bool(forKey: HealthKitDefaultsKeys.enabled)
        if let ids = defaults.stringArray(forKey: HealthKitDefaultsKeys.syncProgramIds) {
            healthKitSyncProgramIds = Set(ids)
        }
        lastHealthKitSyncDate = defaults.object(forKey: HealthKitDefaultsKeys.lastSyncDate) as? Date
        lastHealthKitSyncCount = defaults.integer(forKey: HealthKitDefaultsKeys.lastSyncCount)
        lastHealthKitSyncFailed = defaults.bool(forKey: HealthKitDefaultsKeys.lastSyncFailed)

        if isHealthKitEnabled {
            HealthKitService.shared.startBackgroundDelivery { [weak self] in
                Task { @MainActor in await self?.performHealthKitSync() }
            }
        }
    }

    func clearHealthKitSettings() {
        HealthKitService.shared.stopBackgroundDelivery()
        HealthKitService.shared.clearAnchor()

        isHealthKitEnabled = false
        healthKitSyncProgramIds = []
        lastHealthKitSyncDate = nil
        lastHealthKitSyncCount = 0
        lastHealthKitSyncFailed = false

        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: HealthKitDefaultsKeys.enabled)
        defaults.removeObject(forKey: HealthKitDefaultsKeys.syncProgramIds)
        defaults.removeObject(forKey: HealthKitDefaultsKeys.lastSyncDate)
        defaults.removeObject(forKey: HealthKitDefaultsKeys.lastSyncCount)
        defaults.removeObject(forKey: HealthKitDefaultsKeys.lastSyncFailed)
        defaults.removeObject(forKey: HealthKitDefaultsKeys.connectDate)

        // Drop the sum-on-conflict idempotency ledger too — safe on reconnect: a fresh connect date
        // bounds the first fetch, so previously-synced samples are never re-fetched (no double-add).
        HealthKitAppliedLedger.clear()

        // Drop first-sync gating so a future reconnect reviews everything fresh.
        clearConfirmedPrograms(.workouts)
        clearExcludedKeys(.workouts)
        ProgramContext.pendingWorkoutAnchor = nil
        ProgramContext.pendingWorkoutHadRetryable = false
        ProgramContext.pendingWorkoutLockHeld = false
    }
}
