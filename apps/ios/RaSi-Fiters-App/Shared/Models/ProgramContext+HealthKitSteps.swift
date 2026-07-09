import Foundation

/// Apple Health STEPS auto-sync lifecycle on `ProgramContext`: connect/disconnect, the sync run, and
/// UserDefaults persistence. A 1:1 clone of the sleep integration (`+HealthKitSleep`) — its own
/// toggle, permission, program selection, and defaults keys, sharing the settings screen. HealthKit
/// access + per-day aggregation live in `HealthKitService+Steps`; the backend write is
/// `APIClient.writeHealthKitStepsLog`.
///
/// Overwrite model: every sync re-reads a rolling window and upserts each day, so re-runs are
/// idempotent — an existing day comes back as `.updated` (silent) and only a brand-new day counts
/// as `.created` toward the sync notification, mirroring the sleep path's "notify only on new".
extension ProgramContext {

    private enum StepsKitDefaultsKeys {
        static let enabled = "healthkit.steps.enabled"
        static let syncProgramIds = "healthkit.steps.syncProgramIds"
        static let lastSyncDate = "healthkit.steps.lastSyncDate"
        static let lastSyncCount = "healthkit.steps.lastSyncCount"
        static let lastSyncFailed = "healthkit.steps.lastSyncFailed"
        static let connectDate = "healthkit.steps.connectDate"
    }

    // MARK: - Connect date (first-sync cutoff)

    /// Set on first connect; floors the rolling look-back window so we never backfill arbitrary history.
    var stepsSyncConnectDate: Date? {
        UserDefaults.standard.object(forKey: StepsKitDefaultsKeys.connectDate) as? Date
    }

    // MARK: - Start / stop

    func startStepsSync() {
        guard HealthKitService.shared.isAvailable else { return }

        // Ask for notification permission (no-op if already authorized) so sync results can appear.
        HealthKitSyncNotifier.requestAuthorizationIfNeeded()

        Task {
            do {
                try await HealthKitService.shared.requestStepsAuthorization()
                await MainActor.run {
                    isStepsSyncEnabled = true
                    if stepsSyncConnectDate == nil {
                        UserDefaults.standard.set(Date(), forKey: StepsKitDefaultsKeys.connectDate)
                        // Fresh (re)connect: re-gate every program so this first sync is reviewed again.
                        clearConfirmedPrograms(.steps)
                    }
                    persistStepsSyncSettings()
                }
                HealthKitService.shared.startStepsBackgroundDelivery { [weak self] in
                    Task { @MainActor in await self?.performStepsSync() }
                }
                await performStepsSync()
            } catch {
                await MainActor.run { isStepsSyncEnabled = false }
            }
        }
    }

    func stopStepsSync() {
        HealthKitService.shared.stopStepsBackgroundDelivery()
        isStepsSyncEnabled = false
        persistStepsSyncSettings()
    }

    // MARK: - Sync

    private static var isStepsSyncing = false

    @discardableResult
    @MainActor
    func performStepsSync() async -> HealthSyncResult {
        guard !ProgramContext.isStepsSyncing,
              isStepsSyncEnabled,
              HealthKitService.shared.isAvailable,
              let token = authToken, !token.isEmpty,
              !stepsSyncProgramIds.isEmpty else { return .skipped }

        // A steps confirmation (presented or queued behind workouts/sleep) is already awaiting the
        // user — don't recompute; resume on the next trigger after it closes.
        if pendingSyncConfirmation?.flow == .steps || deferredStepsConfirmation != nil { return .skipped }

        ProgramContext.isStepsSyncing = true
        defer { ProgramContext.isStepsSyncing = false }

        pruneStepsExcludedKeys()   // drop excluded days that have aged out of the rolling window

        let aggregated: [HealthKitService.AggregatedSteps]
        do {
            aggregated = try await HealthKitService.shared.fetchStepsDailyTotals()
        } catch {
            // Couldn't read HealthKit (e.g. permission not granted) — retry on the next trigger. A
            // local condition, not a server-reach failure: the persisted flag stays as-is.
            return .failed
        }

        if aggregated.isEmpty {
            lastStepsSyncDate = Date()
            lastStepsSyncFailed = false
            persistStepsSyncSettings()
            return .synced(0)                           // nothing to write → silent
        }

        let programIds = stepsSyncProgramIds
        // Each day only writes to a program whose [start, end] window covers it (no cross-program bleed).
        let windows = await loadSyncWindows(for: programIds, token: token)
        if windows.isEmpty {
            // Couldn't resolve any window (offline) — don't fall through to silent-confirm the programs.
            lastStepsSyncFailed = true
            persistStepsSyncSettings()
            return .failed
        }

        var created = 0
        var hadRetryable = false
        var pageRows: [String: [PendingSyncConfirmation.Row]] = [:]
        let confirmed = confirmedProgramIds(.steps)
        let excluded = excludedKeys(.steps)

        for day in aggregated {
            for programId in programIds {
                guard let window = windows[programId],
                      ProgramContext.date(day.date, isWithin: window) else { continue }
                let key = ProgramContext.stepsExclusionKey(programId: programId, date: day.date)
                if excluded.contains(key) { continue }   // user un-checked this once — never write it

                // Program is admin-locked for this viewer → skip. No anchor to hold; the rolling
                // look-back window re-fetches this day once the program is unlocked.
                if isDataEntryLocked(programId: programId) { continue }

                if confirmed.contains(programId) {
                    let outcome = await APIClient.shared.writeHealthKitStepsLog(
                        token: token, logDate: day.date, steps: day.count,
                        programId: programId, memberId: loggedInUserId)
                    switch outcome {
                    case .created: created += 1
                    case .updated, .skipped: break
                    case .retryable: hadRetryable = true
                    }
                } else {
                    pageRows[programId, default: []].append(PendingSyncConfirmation.Row(
                        title: "Steps",
                        subtitle: "\(ProgramContext.displayDate(day.date)) · \(ProgramContext.formatSteps(day.count))",
                        exclusionKey: key,
                        payload: .steps(day)))
                }
            }
        }

        for programId in programIds
            where !confirmed.contains(programId)
               && pageRows[programId] == nil
               && !isDataEntryLocked(programId: programId) {
            markProgramConfirmed(programId, flow: .steps)
        }

        lastStepsSyncDate = Date()
        lastStepsSyncCount += created
        lastStepsSyncFailed = hadRetryable
        persistStepsSyncSettings()

        let pages = buildConfirmationPages(pageRows)
        if pages.isEmpty {
            // Failures are SILENT for automatic triggers (D-SIL): the persisted flag drives the
            // settings status line and the manual Sync Now button consumes the returned result.
            // New days are still announced (no-op when created == 0).
            HealthKitSyncNotifier.notifyStepsSuccess(count: created)
            return hadRetryable ? .failed : .synced(created)
        }
        enqueuePendingConfirmation(PendingSyncConfirmation(flow: .steps, pages: pages))
        return hadRetryable ? .failed : .synced(created)
    }

    // MARK: - Persistence

    func persistStepsSyncSettings() {
        let defaults = UserDefaults.standard
        defaults.set(isStepsSyncEnabled, forKey: StepsKitDefaultsKeys.enabled)
        defaults.set(Array(stepsSyncProgramIds), forKey: StepsKitDefaultsKeys.syncProgramIds)
        defaults.set(lastStepsSyncCount, forKey: StepsKitDefaultsKeys.lastSyncCount)
        defaults.set(lastStepsSyncFailed, forKey: StepsKitDefaultsKeys.lastSyncFailed)
        if let date = lastStepsSyncDate {
            defaults.set(date, forKey: StepsKitDefaultsKeys.lastSyncDate)
        } else {
            defaults.removeObject(forKey: StepsKitDefaultsKeys.lastSyncDate)
        }
    }

    func restoreStepsSyncSettings() {
        let defaults = UserDefaults.standard
        isStepsSyncEnabled = defaults.bool(forKey: StepsKitDefaultsKeys.enabled)
        if let ids = defaults.stringArray(forKey: StepsKitDefaultsKeys.syncProgramIds) {
            stepsSyncProgramIds = Set(ids)
        }
        lastStepsSyncDate = defaults.object(forKey: StepsKitDefaultsKeys.lastSyncDate) as? Date
        lastStepsSyncCount = defaults.integer(forKey: StepsKitDefaultsKeys.lastSyncCount)
        lastStepsSyncFailed = defaults.bool(forKey: StepsKitDefaultsKeys.lastSyncFailed)

        if isStepsSyncEnabled {
            HealthKitService.shared.startStepsBackgroundDelivery { [weak self] in
                Task { @MainActor in await self?.performStepsSync() }
            }
        }
    }

    func clearStepsSyncSettings() {
        HealthKitService.shared.stopStepsBackgroundDelivery()

        isStepsSyncEnabled = false
        stepsSyncProgramIds = []
        lastStepsSyncDate = nil
        lastStepsSyncCount = 0
        lastStepsSyncFailed = false

        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: StepsKitDefaultsKeys.enabled)
        defaults.removeObject(forKey: StepsKitDefaultsKeys.syncProgramIds)
        defaults.removeObject(forKey: StepsKitDefaultsKeys.lastSyncDate)
        defaults.removeObject(forKey: StepsKitDefaultsKeys.lastSyncCount)
        defaults.removeObject(forKey: StepsKitDefaultsKeys.lastSyncFailed)
        defaults.removeObject(forKey: StepsKitDefaultsKeys.connectDate)

        // Drop first-sync gating so a future reconnect reviews everything fresh.
        clearConfirmedPrograms(.steps)
        clearExcludedKeys(.steps)
    }
}
