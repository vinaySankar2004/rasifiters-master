import Foundation

/// Idempotency ledger for the Apple Health workout sync's sum-on-conflict writes (D-SUM).
///
/// The anchored fetch replays the WHOLE batch whenever the anchor is held (retryable failure,
/// admin lock, offline window resolution, deferred confirmation). With the backend now SUMMING
/// duplicate (type, day) writes (`on_duplicate:"sum"`), a naive replay would double-add minutes —
/// so every successfully written HKWorkout sample is recorded here, per program, and the write
/// sites send only the unapplied samples' minutes.
///
/// Keyed `"<sampleUUID>|<programId>"` (a batch can succeed for program A and fail for B; a plain
/// UUID key would wrongly skip B's retry). Value = the workout's local yyyy-MM-dd, kept solely so
/// `prune()` can drop entries older than `maxAgeDays` (well past any plausible replay horizon).
enum HealthKitAppliedLedger {
    private static let defaultsKey = "healthkit.appliedWorkoutUUIDs"
    static let maxAgeDays = 45

    private static func load() -> [String: String] {
        (UserDefaults.standard.dictionary(forKey: defaultsKey) as? [String: String]) ?? [:]
    }

    private static func save(_ entries: [String: String]) {
        UserDefaults.standard.set(entries, forKey: defaultsKey)
    }

    private static func entryKey(_ uuid: String, _ programId: String) -> String {
        "\(uuid)|\(programId)"
    }

    static func isApplied(uuid: String, programId: String) -> Bool {
        load()[entryKey(uuid, programId)] != nil
    }

    /// Record a group's contributing samples as applied to one program. Call ONLY after a
    /// successful write (`.created` or `.summed`) — never on `.duplicate`/`.skipped`/`.retryable`.
    static func markApplied(uuids: [String], programId: String, date: String) {
        guard !uuids.isEmpty else { return }
        var entries = load()
        for uuid in uuids { entries[entryKey(uuid, programId)] = date }
        save(entries)
    }

    /// Drop entries whose workout day is older than `maxAgeDays`. Called at the start of each sync.
    static func prune() {
        let entries = load()
        guard !entries.isEmpty else { return }
        let cal = Calendar.current
        guard let cutoff = cal.date(byAdding: .day, value: -maxAgeDays,
                                    to: cal.startOfDay(for: Date())) else { return }
        let cutoffYMD = ProgramContext.localYMD(cutoff)
        let kept = entries.filter { $0.value >= cutoffYMD }
        if kept.count != entries.count { save(kept) }
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: defaultsKey)
    }
}
