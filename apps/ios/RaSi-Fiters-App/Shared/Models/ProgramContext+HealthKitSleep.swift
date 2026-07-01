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

    @MainActor
    func performSleepSync() async {
        guard !ProgramContext.isSleepSyncing,
              isSleepSyncEnabled,
              HealthKitService.shared.isAvailable,
              let token = authToken, !token.isEmpty,
              !sleepSyncProgramIds.isEmpty else { return }

        ProgramContext.isSleepSyncing = true
        defer { ProgramContext.isSleepSyncing = false }

        let samples: [HKCategorySample]
        do {
            samples = try await HealthKitService.shared.fetchSleepSamples(firstSyncCutoff: sleepSyncConnectDate)
        } catch {
            // Couldn't read HealthKit (e.g. permission not granted) — retry on the next trigger.
            return
        }

        let aggregated = HealthKitService.shared.aggregateSleep(samples)
        if aggregated.isEmpty {
            lastSleepSyncDate = Date()
            persistSleepSyncSettings()
            return                                      // nothing to write → silent
        }

        let programIds = sleepSyncProgramIds
        var created = 0
        var hadRetryable = false

        for night in aggregated {
            for programId in programIds {
                let outcome = await APIClient.shared.writeHealthKitSleepLog(
                    token: token,
                    logDate: night.date,
                    sleepHours: night.hours,
                    programId: programId,
                    memberId: loggedInUserId
                )
                switch outcome {
                case .created:
                    created += 1
                case .updated, .skipped:
                    break                               // overwrite / permanent — success but silent
                case .retryable:
                    hadRetryable = true
                }
            }
        }

        lastSleepSyncDate = Date()
        lastSleepSyncCount += created
        persistSleepSyncSettings()

        if hadRetryable {
            HealthKitSyncNotifier.notifyFailure()
        } else {
            HealthKitSyncNotifier.notifySleepSuccess(count: created)    // no-op when created == 0
        }
    }

    // MARK: - Persistence

    func persistSleepSyncSettings() {
        let defaults = UserDefaults.standard
        defaults.set(isSleepSyncEnabled, forKey: SleepKitDefaultsKeys.enabled)
        defaults.set(Array(sleepSyncProgramIds), forKey: SleepKitDefaultsKeys.syncProgramIds)
        defaults.set(lastSleepSyncCount, forKey: SleepKitDefaultsKeys.lastSyncCount)
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

        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: SleepKitDefaultsKeys.enabled)
        defaults.removeObject(forKey: SleepKitDefaultsKeys.syncProgramIds)
        defaults.removeObject(forKey: SleepKitDefaultsKeys.lastSyncDate)
        defaults.removeObject(forKey: SleepKitDefaultsKeys.lastSyncCount)
        defaults.removeObject(forKey: SleepKitDefaultsKeys.connectDate)
    }
}
