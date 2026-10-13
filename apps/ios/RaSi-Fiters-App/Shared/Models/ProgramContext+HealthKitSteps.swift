import Foundation

/// Apple Health STEPS — the workouts verbs for `.steps` over HealthSyncEngine (see ProgramContext+HealthKit).
extension ProgramContext {
    func startStepsSync() { connectHealthSync(.steps) }
    @discardableResult func performStepsSync() async -> HealthSyncOutcome { await syncNow(.steps) }
    func persistStepsSyncSettings() { savePrefs(.steps, enabled: isStepsSyncEnabled, programIds: stepsSyncProgramIds) }
    func clearStepsSyncSettings() { disconnectHealthSync(.steps) }
}
