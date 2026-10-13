import Foundation
import HealthKit

/// One run's plan (health-sync §8 rules 3–6), built by `HealthSyncPlanner`.
struct HealthSyncPlan {
    var items: [APIClient.HealthSyncItem] = []
    var eligible = Set<HealthSyncKey>()              // may get `sync_success` if every item comes back final (rule 2)
    var localConfirms = Set<HealthSyncKey>()         // unreviewed with 0 rows → a LOCAL confirm (amendment H1)
    var reviewRows: [HealthSyncKind: [String: [PendingSyncConfirmation.Row]]] = [:]
    var held = Set<HealthSyncKind>()                 // lock / pending review / server skipped_locked (rule 5)
    var lockHeld = false                             // an admin lock held data → event outcome `partial`
    var noWindow = Set<HealthSyncKind>()             // data, but no selected program resolves a window → hold + failed
    var readFailed = Set<HealthSyncKind>()
    var holdWorkoutAnchor = false                    // rule 5 — any hold / failure touching workouts
    var newWorkoutAnchor: HKQueryAnchor?
    var catchUpDays = 0

    /// Rule 5: a server `skipped_locked` (the only non-final status) holds that (program, kind) like a client-side skip.
    mutating func applyServerHolds(_ upload: APIClient.HealthSyncUpload) -> Set<HealthSyncKey> {
        var keys = Set<HealthSyncKey>()
        for (index, item) in items.enumerated() where upload.results[index]?.status == "skipped_locked" {
            guard let kind = HealthSyncKind(rawValue: item.kind) else { continue }
            if let programId = item.program_id { keys.insert(HealthSyncKey(programId: programId, kind: kind)) }
            held.insert(kind)
            lockHeld = true
            if kind == .workout { holdWorkoutAnchor = true }
        }
        return keys
    }

    /// Rule 2: `sync_success` for every eligible (program, kind) not held. `review_done` is never sent from a run —
    /// only after the user confirms a review (H1).
    func stateEntries(excluding heldKeys: Set<HealthSyncKey>) -> [APIClient.HealthSyncStateEntry] {
        eligible.subtracting(heldKeys).map {
            APIClient.HealthSyncStateEntry(program_id: $0.programId, kind: $0.kind.rawValue, sync_success: true)
        }
    }
}

/// One finished run → each kind's local status, the Sync Now outcome and the `sync.run` props (observability §8.1).
struct HealthSyncRunSummary {
    let trigger: HealthSyncEngine.Trigger
    let kinds: [HealthSyncKind]
    let started: Date
    var plan: HealthSyncPlan? = nil
    var upload: APIClient.HealthSyncUpload? = nil
    var error: Error? = nil
    var legacyRecorded = 0
    var sessionEnded = false

    /// `{ sent, applied, unchanged, duplicate, skipped, removed, invalid }` + `created` (stripped before sending).
    func counts(_ kind: HealthSyncKind) -> [String: Int] {
        var counts: [String: Int] = [:]
        guard let plan, let upload else { return counts }
        for (index, item) in plan.items.enumerated() where item.kind == kind.rawValue {
            guard let status = upload.results[index]?.status else { continue }
            counts["sent", default: 0] += 1
            switch status {
            case "created": counts["applied", default: 0] += 1; counts["created", default: 0] += 1
            case "updated": counts["applied", default: 0] += 1
            case "unchanged", "duplicate", "removed", "invalid": counts[status, default: 0] += 1
            case let other where other.hasPrefix("skipped_"): counts["skipped", default: 0] += 1
            default: break                                                    // recorded / not_found
            }
        }
        return counts
    }

    /// Workouts count every applied sample; sleep / steps only brand-new days (D-S4 "notify on new").
    func newCount(_ kind: HealthSyncKind) -> Int {
        let c = counts(kind)
        return kind == .workout ? c["applied", default: 0] : c["created", default: 0]
    }

    func status(_ kind: HealthSyncKind) -> HealthSyncPrefs.RunStatus {
        guard let plan, error == nil else { return .failed }
        if plan.readFailed.contains(kind) { return .readFailed }
        if plan.noWindow.contains(kind) { return .failed }                    // faithful to 1.4's `windows.isEmpty`
        return plan.held.contains(kind) ? .held(newCount(kind)) : .success(newCount(kind))
    }

    /// H5: only workout changes reload the Summary (it shows no sleep / steps).
    var workoutsChanged: Bool {
        let c = counts(.workout)
        return c["applied", default: 0] + c["removed", default: 0] > 0
    }

    var eventProps: [String: Any] {
        var props: [String: Any] = ["integration": "healthkit", "trigger": trigger.rawValue, "outcome": "failed",
                                    "duration_ms": Int(Date().timeIntervalSince(started) * 1000),
                                    "catch_up_days": plan?.catchUpDays ?? 0, "batches": upload?.batches ?? 0]
        for kind in kinds {
            var c = counts(kind)
            c.removeValue(forKey: "created")
            if (c["sent"] ?? 0) > 0 { props[kind.rawValue] = c }
        }
        var errorClass: Any = NSNull()
        let readFailed = plan?.readFailed ?? []
        if sessionEnded || error != nil {
            props["outcome"] = (upload?.batches ?? 0) > 0 ? "partial" : "failed"
            errorClass = sessionEnded ? "signedOut" : Self.errorClass(error)
        } else if let plan {
            if readFailed.count == kinds.count { props["outcome"] = "failed" }
            else if plan.lockHeld || !plan.noWindow.isEmpty || !readFailed.isEmpty { props["outcome"] = "partial" }
            else if plan.items.isEmpty && plan.reviewRows.isEmpty { props["outcome"] = "skipped" }
            else { props["outcome"] = "success" }
            if !readFailed.isEmpty { errorClass = "health_read_failed" }
        }
        props["error_class"] = errorClass
        if legacyRecorded > 0 { props["legacy_recorded"] = legacyRecorded }
        return props
    }

    /// §8.1 allows only these kit kinds; forbidden / notFound / conflict / a cancellation → `unknown`.
    private static func errorClass(_ error: Error?) -> String {
        guard let kind = error.flatMap({ AppError($0)?.kind }) else { return "unknown" }
        switch kind {
        case .offline, .timeout, .signedOut, .unavailable, .server, .invalidInput, .updateRequired: return kind.rawValue
        case .forbidden, .notFound, .conflict, .unknown: return "unknown"
        }
    }
}

/// Item + date helpers shared by the planner and the upgrade run.
enum HealthSyncItems {
    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
    private static let instantFormatter = ISO8601DateFormatter()
    private static let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    /// `yyyy-MM-dd` in the device's local time zone (§3.2 `date`).
    static func ymd(_ date: Date) -> String { dayFormatter.string(from: date) }
    static func isWithin(_ ymd: String, _ window: (start: String, end: String)) -> Bool { ymd >= window.start && ymd <= window.end }
    static func days(since start: Date) -> Int { max(0, Calendar.current.dateComponents([.day], from: start, to: Date()).day ?? 0) }
    static func instant(_ text: String?) -> Date? {
        guard let text else { return nil }
        return fractionalFormatter.date(from: text) ?? instantFormatter.date(from: text)
    }

    /// One workout sample → one item (§3.2; per-sample minutes, no client grouping).
    static func workoutItem(_ workout: HKWorkout, programId: String, date: String, legacy: Bool = false) -> APIClient.HealthSyncItem {
        APIClient.HealthSyncItem(kind: "workout", program_id: programId, date: date, sample_id: workout.uuid.uuidString,
                                 origin: origin(workout),
                                 workout_name: HealthKitWorkoutTypeMap.workoutName(for: workout.workoutActivityType),
                                 value: Double(max(1, Int((workout.duration / 60).rounded()))),
                                 start_at: instantFormatter.string(from: workout.startDate),
                                 end_at: instantFormatter.string(from: workout.endDate),
                                 legacy: legacy ? true : nil)
    }

    /// `origin` = the recording app's bundle id, limited to `A-Z a-z 0-9 . _ : -`, ≤ 255 chars.
    static func origin(_ sample: HKSample) -> String {
        let cleaned = sample.sourceRevision.source.bundleIdentifier.filter {
            $0.isASCII && ($0.isLetter || $0.isNumber || "._:-".contains($0))
        }
        return cleaned.isEmpty ? "unknown" : String(cleaned.prefix(255))
    }
}

extension APIClient.ProgramDTO {
    /// D-LOCK predicate (also behind `ProgramContext.isDataEntryLocked`): admin-only data entry and the viewer is
    /// neither a global admin nor this program's admin.
    func isDataEntryLocked(globalAdmin: Bool) -> Bool {
        admin_only_data_entry == true && !(globalAdmin || my_role?.lowercased() == "admin")
    }
}
