import Foundation

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

    @MainActor
    func performHealthKitSync() async {
        guard !ProgramContext.isSyncing,
              isHealthKitEnabled,
              HealthKitService.shared.isAvailable,
              let token = authToken, !token.isEmpty,
              let memberName = loggedInUserName, !memberName.isEmpty,
              !healthKitSyncProgramIds.isEmpty else { return }

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
        var created = 0
        var hadRetryable = false

        for workout in aggregated {
            for programId in programIds {
                let outcome = await APIClient.shared.writeHealthKitWorkoutLog(
                    token: token,
                    memberName: memberName,
                    workoutName: workout.workoutName,
                    date: workout.date,
                    durationMinutes: workout.durationMinutes,
                    programId: programId,
                    memberId: loggedInUserId
                )
                switch outcome {
                case .created:
                    created += 1
                case .duplicate, .skipped:
                    break                       // expected / permanent — skip, don't block the anchor
                case .retryable:
                    hadRetryable = true         // transient — keep the anchor so it retries
                }
            }
        }

        // Anchor integrity: only advance when nothing hit a retryable failure. Re-runs are idempotent —
        // already-written logs come back as 409 duplicates and are skipped.
        if !hadRetryable {
            HealthKitService.shared.commitAnchor(fetch.newAnchor)
        }

        lastHealthKitSyncDate = Date()
        lastHealthKitSyncCount += created
        persistHealthKitSettings()

        if hadRetryable {
            HealthKitSyncNotifier.notifyFailure()
        } else {
            HealthKitSyncNotifier.notifySuccess(count: created)     // no-op when created == 0
        }
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
    }
}
