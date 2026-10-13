import Foundation
import HealthKit

/// The three health-sync kinds (§3.2 `kind`).
enum HealthSyncKind: String, CaseIterable {
    case workout, sleep, steps

    var flow: PendingSyncConfirmation.Flow {
        switch self { case .workout: return .workouts; case .sleep: return .sleep; case .steps: return .steps }
    }

    /// Pre-1.5 global UserDefaults prefix (moved per member once by `HealthSyncPrefs.migrateLegacyIfNeeded`).
    var legacyPrefix: String {
        switch self { case .workout: return "healthkit."; case .sleep: return "healthkit.sleep."; case .steps: return "healthkit.steps." }
    }
}

struct HealthSyncKey: Hashable {
    let programId: String
    let kind: HealthSyncKind
}

/// Manual Sync Now result per kind (automatic triggers ignore it — D-SIL).
enum HealthSyncOutcome { case synced(Int), failed, skipped }

struct HealthSyncReport {
    var kinds: [HealthSyncKind: HealthSyncOutcome] = [:]
    /// Workouts were applied or removed server-side → the Summary reloads (amendment H5: workouts only).
    var workoutsChanged = false
    func result(for kind: HealthSyncKind) -> HealthSyncOutcome { kinds[kind] ?? .skipped }
}

/// Per-member Apple Health sync settings (health-sync §8 rule 7: local sync state is per member — the same member
/// resumes after any sign-in, another account never inherits it). Disconnect clears the connection prefs only.
enum HealthSyncPrefs {
    /// One run's local outcome for one kind (D-SIL status line; rule 5 for "Last Synced").
    enum RunStatus {
        case success(Int)       // N new (workouts: applied samples; sleep / steps: created days)
        case held(Int)          // lock / pending review / skipped_locked: count lands, "Last Synced" doesn't move
        case failed             // server / request failure, or data with no resolvable program window
        case readFailed         // HealthKit read failed: a local condition, the status line is untouched
        var outcome: HealthSyncOutcome {
            switch self { case .success(let n), .held(let n): return .synced(n); case .failed, .readFailed: return .failed }
        }
    }

    private static var defaults: UserDefaults { .standard }
    /// Cleared by Disconnect. Exclusions + local review confirms survive it (rule 6 — amendment H2).
    private static let connectionNames = ["enabled", "syncProgramIds", "lastSyncDate", "lastSyncCount", "lastSyncFailed", "connectDate"]
    private static let migratedKey = "healthsync.migratedV2"

    private static func key(_ member: String, _ kind: HealthSyncKind, _ name: String) -> String {
        "healthsync.\(member).\(kind.rawValue).\(name)"
    }

    static func isEnabled(_ kind: HealthSyncKind, member: String) -> Bool { defaults.bool(forKey: key(member, kind, "enabled")) }
    static func programIds(_ kind: HealthSyncKind, member: String) -> Set<String> {
        Set(defaults.stringArray(forKey: key(member, kind, "syncProgramIds")) ?? [])
    }
    /// Connected AND at least one program selected (faithful to 1.4's `!syncProgramIds.isEmpty` guard).
    static func isActive(_ kind: HealthSyncKind, member: String) -> Bool {
        isEnabled(kind, member: member) && !programIds(kind, member: member).isEmpty
    }
    static func save(_ kind: HealthSyncKind, member: String, enabled: Bool, programIds: Set<String>) {
        defaults.set(enabled, forKey: key(member, kind, "enabled"))
        defaults.set(Array(programIds), forKey: key(member, kind, "syncProgramIds"))
    }
    static func markConnected(_ kind: HealthSyncKind, member: String) {
        defaults.set(true, forKey: key(member, kind, "enabled"))
        if connectDate(kind, member: member) == nil { defaults.set(Date(), forKey: key(member, kind, "connectDate")) }
    }
    static func connectDate(_ kind: HealthSyncKind, member: String) -> Date? { defaults.object(forKey: key(member, kind, "connectDate")) as? Date }

    static func lastSyncDate(_ kind: HealthSyncKind, member: String) -> Date? { defaults.object(forKey: key(member, kind, "lastSyncDate")) as? Date }
    static func lastSyncCount(_ kind: HealthSyncKind, member: String) -> Int { defaults.integer(forKey: key(member, kind, "lastSyncCount")) }
    static func lastSyncFailed(_ kind: HealthSyncKind, member: String) -> Bool { defaults.bool(forKey: key(member, kind, "lastSyncFailed")) }

    static func recordRun(_ kind: HealthSyncKind, member: String, _ status: RunStatus) {
        switch status {
        case .readFailed:
            return
        case .failed:
            defaults.set(true, forKey: key(member, kind, "lastSyncFailed"))
        case .success(let count), .held(let count):
            defaults.set(false, forKey: key(member, kind, "lastSyncFailed"))
            defaults.set(lastSyncCount(kind, member: member) + count, forKey: key(member, kind, "lastSyncCount"))
            if case .success = status { defaults.set(Date(), forKey: key(member, kind, "lastSyncDate")) }   // rule 5
        }
    }

    // Review exclusions (D-CONF; honored by rule 3): workouts "programId|date|workoutName", sleep/steps "programId|date".
    static func exclusionKey(_ kind: HealthSyncKind, programId: String, date: String, workoutName: String? = nil) -> String {
        kind == .workout ? "\(programId)|\(date)|\(workoutName ?? "")" : "\(programId)|\(date)"
    }
    static func excluded(_ kind: HealthSyncKind, member: String) -> Set<String> {
        Set(defaults.stringArray(forKey: key(member, kind, "excludedKeys")) ?? [])
    }
    static func addExcluded(_ keys: [String], _ kind: HealthSyncKind, member: String) {
        guard !keys.isEmpty else { return }
        defaults.set(Array(excluded(kind, member: member).union(keys)), forKey: key(member, kind, "excludedKeys"))
    }
    /// Drop exclusions older than the 30-day catch-up window (+1 day) — they can never be read again.
    static func pruneExcluded(member: String) {
        let cal = Calendar.current
        let cutoff = HealthSyncItems.ymd(cal.date(byAdding: .day, value: -31, to: cal.startOfDay(for: Date())) ?? Date())
        for kind in HealthSyncKind.allCases {
            let all = excluded(kind, member: member)
            let kept = all.filter { entry in
                let parts = entry.split(separator: "|")
                return parts.count >= 2 && String(parts[1]) >= cutoff
            }
            if kept.count != all.count { defaults.set(Array(kept), forKey: key(member, kind, "excludedKeys")) }
        }
    }

    /// Amendment H1: a first sync with 0 rows is a LOCAL confirm (never `review_done` on the server).
    static func isLocallyConfirmed(_ kind: HealthSyncKind, programId: String, member: String) -> Bool {
        (defaults.stringArray(forKey: key(member, kind, "confirmedProgramIds")) ?? []).contains(programId)
    }
    static func addLocallyConfirmed(_ programIds: Set<String>, _ kind: HealthSyncKind, member: String) {
        guard !programIds.isEmpty else { return }
        let current = Set(defaults.stringArray(forKey: key(member, kind, "confirmedProgramIds")) ?? [])
        defaults.set(Array(current.union(programIds)), forKey: key(member, kind, "confirmedProgramIds"))
    }

    // Workout anchor + rule 9 upgrade state.
    static func anchor(member: String) -> HKQueryAnchor? {
        guard let data = defaults.data(forKey: key(member, .workout, "anchor")) else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }
    static func setAnchor(_ anchor: HKQueryAnchor?, member: String) {
        guard let anchor, let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true) else { return }
        defaults.set(data, forKey: key(member, .workout, "anchor"))
    }
    /// Rule 4/9: this member's device held an old-build ledger → workouts first-read from today − 30 d, never the connect date.
    static func hasUpgradeMarker(member: String) -> Bool { defaults.bool(forKey: key(member, .workout, "upgradeMarker")) }
    static func upgradePending(member: String) -> Bool { defaults.bool(forKey: "healthsync.\(member).upgradePending") }
    static func setUpgradePending(_ pending: Bool, member: String) { defaults.set(pending, forKey: "healthsync.\(member).upgradePending") }

    /// Disconnect (D-IOS-SYNC-3 + amendment H2): this kind's connection prefs, and for workouts the anchor and the
    /// upgrade marker — a reconnect reads from max(last_success − 1 d, the reconnect date), never the disconnected
    /// period. Exclusions + local confirms stay; nothing is sent to the server.
    static func disconnect(_ kind: HealthSyncKind, member: String) {
        connectionNames.forEach { defaults.removeObject(forKey: key(member, kind, $0)) }
        if kind == .workout {
            defaults.removeObject(forKey: key(member, .workout, "anchor"))
            defaults.removeObject(forKey: key(member, .workout, "upgradeMarker"))
        }
    }

    /// One-time move of the pre-1.5 GLOBAL `healthkit.*` keys to the member signed in at upgrade time. Waits until a
    /// member is known (signed out / before the first unlock → retried at the next call; nothing is deleted). The old
    /// anchor is discarded (rule 9); the old ledger + confirmed lists stay for `HealthSyncUpgrade`. Idempotent.
    static func migrateLegacyIfNeeded() {
        guard !defaults.bool(forKey: migratedKey), let member = SessionStore.shared.memberId else { return }
        defaults.set(true, forKey: migratedKey)
        for kind in HealthSyncKind.allCases {
            for name in connectionNames + ["excludedKeys"] {
                let old = kind.legacyPrefix + name
                if let value = defaults.object(forKey: old) { defaults.set(value, forKey: key(member, kind, name)) }
                defaults.removeObject(forKey: old)
            }
        }
        defaults.removeObject(forKey: "healthkit.workoutAnchor")
        let hadLedger = !(defaults.dictionary(forKey: HealthSyncUpgrade.legacyLedgerKey) ?? [:]).isEmpty
        let hadConfirmed = HealthSyncUpgrade.legacyConfirmedKeys.values.contains { !(defaults.stringArray(forKey: $0) ?? []).isEmpty }
        if hadLedger { defaults.set(true, forKey: key(member, .workout, "upgradeMarker")) }      // H3: ledger holders only
        if hadLedger || hadConfirmed { setUpgradePending(true, member: member) }
    }
}
