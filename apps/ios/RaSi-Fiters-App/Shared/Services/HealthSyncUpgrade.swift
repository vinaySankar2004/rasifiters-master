import Foundation
import HealthKit

/// health-sync §8 rule 9 — once per member, before any normal batch and before the run's GET /state: send the old
/// build's "already sent" workouts as `legacy: true` (re-read by UUID; skipped when Health no longer has them), carry its
/// confirmed reviews over (`PUT review_done: true`), then delete the old ledger. The old anchor was already discarded and
/// the upgrade marker set by `HealthSyncPrefs.migrateLegacyIfNeeded()`; the marker stays.
enum HealthSyncUpgrade {
    static let legacyLedgerKey = "healthkit.appliedWorkoutUUIDs"
    static let legacyConfirmedKeys: [HealthSyncKind: String] = [
        .workout: "healthkit.confirmedProgramIds",
        .sleep: "healthkit.sleep.confirmedProgramIds",
        .steps: "healthkit.steps.confirmedProgramIds"
    ]

    private struct LegacyEntry { let uuid: UUID; let programId: String; let date: String }

    /// `error` non-nil fails the run (retried next trigger — idempotent). `recorded` → `legacy_recorded`.
    static func runIfPending(member: String) async -> (recorded: Int, error: Error?) {
        guard HealthSyncPrefs.upgradePending(member: member) else { return (0, nil) }
        let defaults = UserDefaults.standard
        let ledger = (defaults.dictionary(forKey: legacyLedgerKey) as? [String: String]) ?? [:]
        let entries = ledger.compactMap { key, date -> LegacyEntry? in
            let parts = key.split(separator: "|", maxSplits: 1).map(String.init)       // "uuid|programId" → stored day
            guard parts.count == 2, let uuid = UUID(uuidString: parts[0]) else { return nil }
            return LegacyEntry(uuid: uuid, programId: parts[1], date: date)
        }
        var recorded = 0
        do {
            let workouts = try await HealthKitService.shared.fetchWorkouts(uuids: Set(entries.map { $0.uuid }))
            let byId = Dictionary(workouts.map { ($0.uuid, $0) }, uniquingKeysWith: { first, _ in first })
            let items: [APIClient.HealthSyncItem] = entries.compactMap { entry in
                byId[entry.uuid].map { HealthSyncItems.workoutItem($0, programId: entry.programId, date: entry.date, legacy: true) }
            }
            let upload = await APIClient.shared.uploadHealthSync(items)        // every legacy status is final
            if let error = upload.error { throw error }
            recorded = upload.results.filter { $0?.status == "recorded" }.count
            let reviews: [APIClient.HealthSyncStateEntry] = legacyConfirmedKeys.flatMap { kind, key in
                (defaults.stringArray(forKey: key) ?? []).map {
                    APIClient.HealthSyncStateEntry(program_id: $0, kind: kind.rawValue, review_done: true)
                }
            }
            try await APIClient.shared.putHealthSyncState(reviews)
        } catch {
            return (recorded, error)
        }
        defaults.removeObject(forKey: legacyLedgerKey)
        legacyConfirmedKeys.values.forEach { defaults.removeObject(forKey: $0) }
        HealthSyncPrefs.setUpgradePending(false, member: member)
        return (recorded, nil)
    }
}
