import Foundation

/// Apple Health SLEEP — the workouts verbs for `.sleep` over HealthSyncEngine (see ProgramContext+HealthKit).
extension ProgramContext {
    func startSleepSync() { connectHealthSync(.sleep) }
    @discardableResult func performSleepSync() async -> HealthSyncOutcome { await syncNow(.sleep) }
    func persistSleepSyncSettings() { savePrefs(.sleep, enabled: isSleepSyncEnabled, programIds: sleepSyncProgramIds) }
    func clearSleepSyncSettings() { disconnectHealthSync(.sleep) }
}
