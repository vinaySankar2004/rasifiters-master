import Foundation

/// Apple Health on ProgramContext (health-sync §8 on iOS): the @Published mirror AppleHealthSettingsView binds to and
/// the connect / Sync Now / disconnect actions. The sync itself is `HealthSyncEngine` (a singleton, so a HealthKit
/// background wake syncs without a scene); settings live per member in `HealthSyncPrefs`. Workouts here;
/// `+HealthKitSleep` / `+HealthKitSteps` are the same four verbs for their kind.
extension ProgramContext {

    func configureHealthSyncHooks() {
        HealthSyncEngine.shared.onRunFinished = { [weak self] report in
            self?.reloadHealthSyncMirror()
            if report.workoutsChanged { self?.summaryRefreshToken += 1 }   // H5: workouts landed → Summary reloads
        }
        HealthSyncEngine.shared.onReviewNeeded = { [weak self] in self?.enqueuePendingConfirmation($0) }
    }

    /// Re-read the signed-in member's prefs into the mirror (everything off when signed out).
    func reloadHealthSyncMirror() {
        HealthSyncPrefs.migrateLegacyIfNeeded()
        let member = SessionStore.shared.memberId
        func enabled(_ kind: HealthSyncKind) -> Bool { member.map { HealthSyncPrefs.isEnabled(kind, member: $0) } ?? false }
        func ids(_ kind: HealthSyncKind) -> Set<String> { member.map { HealthSyncPrefs.programIds(kind, member: $0) } ?? [] }
        func last(_ kind: HealthSyncKind) -> Date? { member.flatMap { HealthSyncPrefs.lastSyncDate(kind, member: $0) } }
        func count(_ kind: HealthSyncKind) -> Int { member.map { HealthSyncPrefs.lastSyncCount(kind, member: $0) } ?? 0 }
        func failed(_ kind: HealthSyncKind) -> Bool { member.map { HealthSyncPrefs.lastSyncFailed(kind, member: $0) } ?? false }
        isHealthKitEnabled = enabled(.workout); healthKitSyncProgramIds = ids(.workout)
        lastHealthKitSyncDate = last(.workout); lastHealthKitSyncCount = count(.workout); lastHealthKitSyncFailed = failed(.workout)
        isSleepSyncEnabled = enabled(.sleep); sleepSyncProgramIds = ids(.sleep)
        lastSleepSyncDate = last(.sleep); lastSleepSyncCount = count(.sleep); lastSleepSyncFailed = failed(.sleep)
        isStepsSyncEnabled = enabled(.steps); stepsSyncProgramIds = ids(.steps)
        lastStepsSyncDate = last(.steps); lastStepsSyncCount = count(.steps); lastStepsSyncFailed = failed(.steps)
    }

    func startHealthKitSync() { connectHealthSync(.workout) }
    @discardableResult func performHealthKitSync() async -> HealthSyncOutcome { await syncNow(.workout) }
    func persistHealthKitSettings() { savePrefs(.workout, enabled: isHealthKitEnabled, programIds: healthKitSyncProgramIds) }
    func clearHealthKitSettings() { disconnectHealthSync(.workout) }

    // MARK: - Shared by the three kinds

    func connectHealthSync(_ kind: HealthSyncKind) {
        guard HealthKitService.shared.isAvailable, let member = SessionStore.shared.memberId else { return }
        HealthKitSyncNotifier.requestAuthorizationIfNeeded()
        Task {
            do {
                try await HealthKitService.shared.requestAuthorization(for: kind)
                HealthSyncPrefs.markConnected(kind, member: member)
                reloadHealthSyncMirror()
                HealthSyncEngine.shared.registerObservers()
                _ = await HealthSyncEngine.shared.run(.connect)
            } catch {
                reloadHealthSyncMirror()
            }
        }
    }

    /// Disconnect (D-IOS-SYNC-3 + amendment H2): this kind's connection prefs (+ the workout anchor) and its observer.
    /// Exclusions, local confirms and the server's review state are kept — a reconnect resumes without a review
    /// (health-sync rule 6) and reads nothing from before the reconnect.
    func disconnectHealthSync(_ kind: HealthSyncKind) {
        guard let member = SessionStore.shared.memberId else { return }
        HealthSyncPrefs.disconnect(kind, member: member)
        reloadHealthSyncMirror()
        HealthSyncEngine.shared.registerObservers()
    }

    /// Sync Now = the `manual` trigger (one run for every active kind); returns this kind's outcome.
    func syncNow(_ kind: HealthSyncKind) async -> HealthSyncOutcome {
        await HealthSyncEngine.shared.run(.manual).result(for: kind)
    }

    func savePrefs(_ kind: HealthSyncKind, enabled: Bool, programIds: Set<String>) {
        guard let member = SessionStore.shared.memberId else { return }
        HealthSyncPrefs.save(kind, member: member, enabled: enabled, programIds: programIds)
        HealthSyncEngine.shared.registerObservers()            // a kind gains / loses its first program
    }
}
