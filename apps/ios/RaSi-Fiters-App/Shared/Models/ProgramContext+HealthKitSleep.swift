import Foundation
import HealthKit

/// Apple Health SLEEP auto-sync lifecycle on `ProgramContext`: connect/disconnect, the sync run, and
/// UserDefaults persistence. Independent of the workout sync (its own toggle, permission, program
/// selection, and defaults keys) but shares the settings screen. HealthKit access + aggregation live in
/// `HealthKitService+Sleep`; the backend write is `APIClient.writeHealthKitSleepLog`.
///
/// Overwrite model: every sync re-reads a rolling window and upserts each night, so re-runs are
/// idempotent — an existing night comes back as `.updated` (silent) and only a brand-new night counts
/// as `.created` toward the sync notification, mirroring the workout path's "notify only on new".
extension ProgramContext {

    private enum SleepKitDefaultsKeys {
        static let enabled = "healthkit.sleep.enabled"
        static let syncProgramIds = "healthkit.sleep.syncProgramIds"
        static let lastSyncDate = "healthkit.sleep.lastSyncDate"
        static let lastSyncCount = "healthkit.sleep.lastSyncCount"
        static let lastSyncFailed = "healthkit.sleep.lastSyncFailed"
        static let connectDate = "healthkit.sleep.connectDate"
    }

    // MARK: - Connect date (first-sync cutoff)

    /// Set on first connect; floors the rolling look-back window so we never backfill arbitrary history.
    var sleepSyncConnectDate: Date? {
        UserDefaults.standard.object(forKey: SleepKitDefaultsKeys.connectDate) as? Date
    }

    // MARK: - Start / stop

    func startSleepSync() {
        guard HealthKitService.shared.isAvailable else { return }

        // Ask for notification permission (no-op if already authorized) so sync results can appear.
        HealthKitSyncNotifier.requestAuthorizationIfNeeded()

        Task {
            do {
                try await HealthKitService.shared.requestSleepAuthorization()
                await MainActor.run {
                    isSleepSyncEnabled = true
                    if sleepSyncConnectDate == nil {
                        UserDefaults.standard.set(Date(), forKey: SleepKitDefaultsKeys.connectDate)
                        // Fresh (re)connect: re-gate every program so this first sync is reviewed again.
                        clearConfirmedPrograms(.sleep)
                    }
                    persistSleepSyncSettings()
                }
                HealthKitService.shared.startSleepBackgroundDelivery { [weak self] in
                    Task { @MainActor in await self?.performSleepSync() }
                }
                await performSleepSync()
            } catch {
                await MainActor.run { isSleepSyncEnabled = false }
            }
        }
    }

    func stopSleepSync() {
        HealthKitService.shared.stopSleepBackgroundDelivery()
        isSleepSyncEnabled = false
        persistSleepSyncSettings()
    }

    // MARK: - Sync

    private static var isSleepSyncing = false

    @discardableResult
    @MainActor
    func performSleepSync() async -> HealthSyncResult {
        guard !ProgramContext.isSleepSyncing,
              isSleepSyncEnabled,
              HealthKitService.shared.isAvailable,
              let token = authToken, !token.isEmpty,
              !sleepSyncProgramIds.isEmpty else { return .skipped }

        // A sleep confirmation (presented or queued behind workouts) is already awaiting the user — don't
        // recompute; resume on the next trigger after it closes.
        if pendingSyncConfirmation?.flow == .sleep || deferredSleepConfirmation != nil { return .skipped }

        ProgramContext.isSleepSyncing = true
        defer { ProgramContext.isSleepSyncing = false }

        pruneSleepExcludedKeys()   // drop excluded nights that have aged out of the rolling window

        let samples: [HKCategorySample]
        do {
            samples = try await HealthKitService.shared.fetchSleepSamples()
        } catch {
            // Couldn't read HealthKit (e.g. permission not granted) — retry on the next trigger. A
            // local condition, not a server-reach failure: the persisted flag stays as-is.
            return .failed
        }

        let aggregated = HealthKitService.shared.aggregateSleep(samples)
        if aggregated.isEmpty {
            lastSleepSyncDate = Date()
            lastSleepSyncFailed = false
            persistSleepSyncSettings()
            return .synced(0)                           // nothing to write → silent
        }

        let programIds = sleepSyncProgramIds
        // Each night only writes to a program whose [start, end] window covers it (no cross-program bleed).
        let windows = await loadSyncWindows(for: programIds, token: token)
        if windows.isEmpty {
            // Couldn't resolve any window (offline) — don't fall through to silent-confirm the programs.
            lastSleepSyncFailed = true
            persistSleepSyncSettings()
            return .failed
        }

        var created = 0
        var hadRetryable = false
        var pageRows: [String: [PendingSyncConfirmation.Row]] = [:]
        let confirmed = confirmedProgramIds(.sleep)
        let excluded = excludedKeys(.sleep)

        for night in aggregated {
            for programId in programIds {
                guard let window = windows[programId],
                      ProgramContext.date(night.date, isWithin: window) else { continue }
                let key = ProgramContext.sleepExclusionKey(programId: programId, date: night.date)
                if excluded.contains(key) { continue }   // user un-checked this once — never write it

                // Program is admin-locked for this viewer → skip. No anchor to hold; the rolling
                // look-back window re-fetches this night once the program is unlocked.
                if isDataEntryLocked(programId: programId) { continue }

                if confirmed.contains(programId) {
                    let outcome = await APIClient.shared.writeHealthKitSleepLog(
                        token: token, logDate: night.date, sleepHours: night.hours,
                        programId: programId, memberId: loggedInUserId)
                    switch outcome {
                    case .created: created += 1
                    case .updated, .skipped: break
                    case .retryable: hadRetryable = true
                    }
                } else {
                    pageRows[programId, default: []].append(PendingSyncConfirmation.Row(
                        title: "Sleep",
                        subtitle: "\(ProgramContext.displayDate(night.date)) · \(ProgramContext.formatHours(night.hours))",
                        exclusionKey: key,
                        payload: .sleep(night)))
                }
            }
        }

        for programId in programIds
            where !confirmed.contains(programId)
               && pageRows[programId] == nil
               && !isDataEntryLocked(programId: programId) {
            markProgramConfirmed(programId, flow: .sleep)
        }

        lastSleepSyncDate = Date()
        lastSleepSyncCount += created
        lastSleepSyncFailed = hadRetryable
        persistSleepSyncSettings()

        let pages = buildConfirmationPages(pageRows)
        if pages.isEmpty {
            // Failures are SILENT for automatic triggers (D-SIL): the persisted flag drives the
            // settings status line and the manual Sync Now button consumes the returned result.
            // New nights are still announced (no-op when created == 0).
            HealthKitSyncNotifier.notifySleepSuccess(count: created)
            return hadRetryable ? .failed : .synced(created)
        }
        enqueuePendingConfirmation(PendingSyncConfirmation(flow: .sleep, pages: pages))
        return hadRetryable ? .failed : .synced(created)
    }

    // MARK: - Persistence

    func persistSleepSyncSettings() {
        let defaults = UserDefaults.standard
        defaults.set(isSleepSyncEnabled, forKey: SleepKitDefaultsKeys.enabled)
        defaults.set(Array(sleepSyncProgramIds), forKey: SleepKitDefaultsKeys.syncProgramIds)
        defaults.set(lastSleepSyncCount, forKey: SleepKitDefaultsKeys.lastSyncCount)
        defaults.set(lastSleepSyncFailed, forKey: SleepKitDefaultsKeys.lastSyncFailed)
        if let date = lastSleepSyncDate {
            defaults.set(date, forKey: SleepKitDefaultsKeys.lastSyncDate)
        } else {
            defaults.removeObject(forKey: SleepKitDefaultsKeys.lastSyncDate)
        }
    }

    func restoreSleepSyncSettings() {
        let defaults = UserDefaults.standard
        isSleepSyncEnabled = defaults.bool(forKey: SleepKitDefaultsKeys.enabled)
        if let ids = defaults.stringArray(forKey: SleepKitDefaultsKeys.syncProgramIds) {
            sleepSyncProgramIds = Set(ids)
        }
        lastSleepSyncDate = defaults.object(forKey: SleepKitDefaultsKeys.lastSyncDate) as? Date
        lastSleepSyncCount = defaults.integer(forKey: SleepKitDefaultsKeys.lastSyncCount)
        lastSleepSyncFailed = defaults.bool(forKey: SleepKitDefaultsKeys.lastSyncFailed)

        if isSleepSyncEnabled {
            HealthKitService.shared.startSleepBackgroundDelivery { [weak self] in
                Task { @MainActor in await self?.performSleepSync() }
            }
        }
    }

    func clearSleepSyncSettings() {
        HealthKitService.shared.stopSleepBackgroundDelivery()

        isSleepSyncEnabled = false
        sleepSyncProgramIds = []
        lastSleepSyncDate = nil
        lastSleepSyncCount = 0
        lastSleepSyncFailed = false

        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: SleepKitDefaultsKeys.enabled)
        defaults.removeObject(forKey: SleepKitDefaultsKeys.syncProgramIds)
        defaults.removeObject(forKey: SleepKitDefaultsKeys.lastSyncDate)
        defaults.removeObject(forKey: SleepKitDefaultsKeys.lastSyncCount)
        defaults.removeObject(forKey: SleepKitDefaultsKeys.lastSyncFailed)
        defaults.removeObject(forKey: SleepKitDefaultsKeys.connectDate)

        // Drop first-sync gating so a future reconnect reviews everything fresh.
        clearConfirmedPrograms(.sleep)
        clearExcludedKeys(.sleep)
    }
}
