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
        static let connectDate = "healthkit.connectDate"
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

    @MainActor
    func performHealthKitSync() async {
        guard !ProgramContext.isSyncing,
              isHealthKitEnabled,
              HealthKitService.shared.isAvailable,
              let token = authToken, !token.isEmpty,
              let memberName = loggedInUserName, !memberName.isEmpty,
              !healthKitSyncProgramIds.isEmpty else { return }

        // A workout confirmation is already awaiting the user — don't recompute (it would clobber the
        // stashed anchor and reset the in-progress review). Resumes on the next trigger after it closes.
        if pendingSyncConfirmation?.flow == .workouts { return }

        ProgramContext.isSyncing = true
        defer { ProgramContext.isSyncing = false }

        let fetch: HealthKitService.FetchResult
        do {
            fetch = try await HealthKitService.shared.fetchNewWorkouts(firstSyncCutoff: healthKitConnectDate)
        } catch {
            // Couldn't read HealthKit (e.g. permission not granted) — leave the anchor, retry next trigger.
            return
        }

        if fetch.workouts.isEmpty {
            HealthKitService.shared.commitAnchor(fetch.newAnchor)   // advance past a clean scan
            lastHealthKitSyncDate = Date()
            persistHealthKitSettings()
            return                                                  // nothing new → silent (D7)
        }

        let aggregated = HealthKitService.shared.aggregate(fetch.workouts)
        let programIds = healthKitSyncProgramIds
        // Each workout only writes to a program whose [start, end] window covers its date — keeps
        // out-of-window ("eons ago") workouts from landing in a program that doesn't span them.
        let windows = await loadSyncWindows(for: programIds, token: token)
        if windows.isEmpty {
            // Couldn't resolve any program window (e.g. offline background trigger) — do NOT commit the
            // anchor, or these workouts would be dropped for good. Retry on the next trigger.
            return
        }

        var created = 0
        var hadRetryable = false
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

                if confirmed.contains(programId) {
                    // Steady state: this program was already confirmed → write silently as before.
                    let outcome = await APIClient.shared.writeHealthKitWorkoutLog(
                        token: token, memberName: memberName, workoutName: workout.workoutName,
                        date: workout.date, durationMinutes: workout.durationMinutes,
                        programId: programId, memberId: loggedInUserId)
                    switch outcome {
                    case .created: created += 1
                    case .duplicate, .skipped: break
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

        // Unconfirmed programs that produced no rows (0-row first sync) confirm silently.
        for programId in programIds where !confirmed.contains(programId) && pageRows[programId] == nil {
            markProgramConfirmed(programId, flow: .workouts)
        }

        lastHealthKitSyncCount += created

        let pages = buildConfirmationPages(pageRows)
        if pages.isEmpty {
            // Nothing to confirm — behave exactly like the steady-state sync (commit + notify).
            if !hadRetryable { HealthKitService.shared.commitAnchor(fetch.newAnchor) }
            lastHealthKitSyncDate = Date()
            persistHealthKitSettings()
            if hadRetryable { HealthKitSyncNotifier.notifyFailure() }
            else { HealthKitSyncNotifier.notifySuccess(count: created) }   // no-op when created == 0
            return
        }

        // Pending pages exist — stash the anchor + any silent-write failure and present the confirmation.
        // The anchor commits in `finishConfirmation` once the user taps through every program cleanly; a
        // deferred flow leaves the anchor uncommitted so the same batch is safely re-offered next trigger.
        ProgramContext.pendingWorkoutAnchor = fetch.newAnchor
        ProgramContext.pendingWorkoutHadRetryable = hadRetryable
        persistHealthKitSettings()
        enqueuePendingConfirmation(PendingSyncConfirmation(flow: .workouts, pages: pages))
    }

    /// Commit the stashed anchor iff the compute-time silent writes had no retryable failure. Called by
    /// `finishConfirmation` when the user finishes every workout page. Clears the stash either way.
    @MainActor
    func commitPendingWorkoutAnchorIfClean() {
        if !ProgramContext.pendingWorkoutHadRetryable, let anchor = ProgramContext.pendingWorkoutAnchor {
            HealthKitService.shared.commitAnchor(anchor)
            lastHealthKitSyncDate = Date()
            persistHealthKitSettings()
        }
        ProgramContext.pendingWorkoutAnchor = nil
        ProgramContext.pendingWorkoutHadRetryable = false
    }

    // MARK: - Persistence

    func persistHealthKitSettings() {
        let defaults = UserDefaults.standard
        defaults.set(isHealthKitEnabled, forKey: HealthKitDefaultsKeys.enabled)
        defaults.set(Array(healthKitSyncProgramIds), forKey: HealthKitDefaultsKeys.syncProgramIds)
        defaults.set(lastHealthKitSyncCount, forKey: HealthKitDefaultsKeys.lastSyncCount)
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

        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: HealthKitDefaultsKeys.enabled)
        defaults.removeObject(forKey: HealthKitDefaultsKeys.syncProgramIds)
        defaults.removeObject(forKey: HealthKitDefaultsKeys.lastSyncDate)
        defaults.removeObject(forKey: HealthKitDefaultsKeys.lastSyncCount)
        defaults.removeObject(forKey: HealthKitDefaultsKeys.connectDate)

        // Drop first-sync gating so a future reconnect reviews everything fresh.
        clearConfirmedPrograms(.workouts)
        clearExcludedKeys(.workouts)
        ProgramContext.pendingWorkoutAnchor = nil
        ProgramContext.pendingWorkoutHadRetryable = false
    }
}
