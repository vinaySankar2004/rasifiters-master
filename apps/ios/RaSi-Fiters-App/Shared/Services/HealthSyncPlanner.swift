import Foundation
import HealthKit

/// Builds one run's plan: windows (D-S5) + admin locks (D-LOCK) from GET /programs, review + catch-up state from
/// GET /state, the member's prefs, then the HealthKit reads. Self-contained, so a background wake needs no UI.
struct HealthSyncPlanner {
    let member: String
    let states: [APIClient.HealthSyncStateRow]
    private let windows: [String: (start: String, end: String)]
    private let locked: Set<String>

    init(member: String, programs: [APIClient.ProgramDTO], states: [APIClient.HealthSyncStateRow], isGlobalAdmin: Bool) {
        self.member = member
        self.states = states
        let today = HealthSyncItems.ymd(Date())
        var windows: [String: (start: String, end: String)] = [:]
        for program in programs {
            guard let start = program.start_date, !start.isEmpty else { continue }
            let end = min(program.end_date ?? today, today)
            if start <= end { windows[program.id] = (start, end) }
        }
        self.windows = windows
        self.locked = Set(programs.filter { $0.isDataEntryLocked(globalAdmin: isGlobalAdmin) }.map(\.id))
    }

    private struct DayValue {
        let date: String; let value: Double; let title: String; let detail: String
        let payload: PendingSyncConfirmation.Payload
    }

    func plan(kinds: [HealthSyncKind]) async -> HealthSyncPlan {
        var plan = HealthSyncPlan()
        let service = HealthKitService.shared
        for kind in kinds {
            let start = catchUpStart(kind)
            do {
                switch kind {
                case .workout:
                    let anchor = HealthSyncPrefs.anchor(member: member)
                    let changes = try await service.fetchWorkoutChanges(anchor: anchor, since: start)
                    if anchor == nil { plan.catchUpDays = max(plan.catchUpDays, HealthSyncItems.days(since: start)) }
                    addWorkouts(changes, to: &plan)
                case .sleep:
                    let samples = try await service.fetchSleepSamples(from: start)
                    plan.catchUpDays = max(plan.catchUpDays, HealthSyncItems.days(since: start))
                    addDays(.sleep, service.aggregateSleep(samples).map {
                        DayValue(date: $0.date, value: $0.hours, title: "Sleep", detail: ProgramContext.formatHours($0.hours), payload: .sleep($0))
                    }, to: &plan)
                case .steps:
                    let totals = try await service.fetchStepsDailyTotals(from: start)
                    plan.catchUpDays = max(plan.catchUpDays, HealthSyncItems.days(since: start))
                    addDays(.steps, totals.map {
                        DayValue(date: $0.date, value: Double($0.count), title: "Steps", detail: ProgramContext.formatSteps($0.count), payload: .steps($0))
                    }, to: &plan)
                }
            } catch {
                plan.readFailed.insert(kind)
                if kind == .workout { plan.holdWorkoutAnchor = true }
            }
        }
        return plan
    }

    private func addWorkouts(_ changes: HealthKitService.WorkoutChanges, to plan: inout HealthSyncPlan) {
        plan.newWorkoutAnchor = changes.newAnchor
        let deleted = Set(changes.deletedIds)
        plan.items += changes.deletedIds.map { APIClient.HealthSyncItem(kind: "workout", sample_id: $0, deleted: true) }
        let workouts = changes.workouts.filter { !deleted.contains($0.uuid.uuidString) }   // never add + delete one id
        let selected = HealthSyncPrefs.programIds(.workout, member: member)
        if !workouts.isEmpty, !selected.contains(where: { windows[$0] != nil }) {
            plan.noWindow.insert(.workout)                   // faithful to 1.4: hold the anchor, status "failed"
            plan.holdWorkoutAnchor = true
            return
        }
        let excluded = HealthSyncPrefs.excluded(.workout, member: member)
        for programId in selected {
            guard let window = windows[programId] else { continue }
            let rows = workouts.filter { workout in
                let date = HealthSyncItems.ymd(workout.startDate)
                let name = HealthKitWorkoutTypeMap.workoutName(for: workout.workoutActivityType)
                return HealthSyncItems.isWithin(date, window)
                    && !excluded.contains(HealthSyncPrefs.exclusionKey(.workout, programId: programId, date: date, workoutName: name))
            }
            distribute(HealthSyncKey(programId: programId, kind: .workout), hasRows: !rows.isEmpty, to: &plan,
                       items: { rows.map { HealthSyncItems.workoutItem($0, programId: programId, date: HealthSyncItems.ymd($0.startDate)) } },
                       review: {
                           HealthKitService.shared.aggregate(rows).map { group in
                               PendingSyncConfirmation.Row(
                                   title: group.workoutName,
                                   subtitle: "\(ProgramContext.displayDate(group.date)) · \(group.durationMinutes) min",
                                   exclusionKey: HealthSyncPrefs.exclusionKey(.workout, programId: programId, date: group.date,
                                                                              workoutName: group.workoutName),
                                   payload: .workout(group))
                           }
                       })
        }
    }

    private func addDays(_ kind: HealthSyncKind, _ days: [DayValue], to plan: inout HealthSyncPlan) {
        let selected = HealthSyncPrefs.programIds(kind, member: member)
        if !days.isEmpty, !selected.contains(where: { windows[$0] != nil }) { plan.noWindow.insert(kind); return }
        let excluded = HealthSyncPrefs.excluded(kind, member: member)
        for programId in selected {
            guard let window = windows[programId] else { continue }
            let rows = days.filter {
                HealthSyncItems.isWithin($0.date, window)
                    && !excluded.contains(HealthSyncPrefs.exclusionKey(kind, programId: programId, date: $0.date))
            }
            distribute(HealthSyncKey(programId: programId, kind: kind), hasRows: !rows.isEmpty, to: &plan,
                       items: { rows.map { APIClient.HealthSyncItem(kind: kind.rawValue, program_id: programId, date: $0.date, value: $0.value) } },
                       review: {
                           rows.map {
                               PendingSyncConfirmation.Row(title: $0.title, subtitle: "\(ProgramContext.displayDate($0.date)) · \($0.detail)",
                                                           exclusionKey: HealthSyncPrefs.exclusionKey(kind, programId: programId, date: $0.date),
                                                           payload: $0.payload)
                           }
                       })
        }
    }

    private func distribute(_ key: HealthSyncKey, hasRows: Bool, to plan: inout HealthSyncPlan,
                            items: () -> [APIClient.HealthSyncItem], review: () -> [PendingSyncConfirmation.Row]) {
        if locked.contains(key.programId) {                                   // D-LOCK: filtered before sending → hold
            if hasRows { plan.lockHeld = true; hold(key.kind, in: &plan) }
            return
        }
        guard isReviewed(key) else {                                          // rule 6: review before the first upload
            if hasRows {
                plan.reviewRows[key.kind, default: [:]][key.programId] = review()
                hold(key.kind, in: &plan)
            } else {
                plan.localConfirms.insert(key)                                // H1: 0 rows → a local confirm only
                plan.eligible.insert(key)
            }
            return
        }
        plan.items += items()
        plan.eligible.insert(key)
    }

    private func hold(_ kind: HealthSyncKind, in plan: inout HealthSyncPlan) {
        plan.held.insert(kind)
        if kind == .workout { plan.holdWorkoutAnchor = true }
    }

    /// Rule 4: from max(start of the local day of the oldest last_success_at − 1 day, today − 30 d). A never-synced
    /// program adds the first-sync rule (workouts: connect date, or today − 30 d with the upgrade marker; sleep/steps:
    /// the last 14 days). Only selected programs this run can write to (in-window, unlocked) count. Workouts never
    /// read before the (re)connect date unless the upgrade marker is set (amendment H2).
    private func catchUpStart(_ kind: HealthSyncKind) -> Date {
        let cal = Calendar.current
        let startOfToday = cal.startOfDay(for: Date())
        let floor = cal.date(byAdding: .day, value: -30, to: startOfToday) ?? startOfToday
        let writable = HealthSyncPrefs.programIds(kind, member: member).filter { windows[$0] != nil && !locked.contains($0) }
        let successes = writable.map { lastSuccess(HealthSyncKey(programId: $0, kind: kind)) }
        var candidates: [Date] = []
        if let oldest = successes.compactMap({ $0 }).min() {
            candidates.append(cal.date(byAdding: .day, value: -1, to: cal.startOfDay(for: oldest)) ?? floor)
        }
        let upgraded = kind == .workout && HealthSyncPrefs.hasUpgradeMarker(member: member)
        if successes.isEmpty || successes.contains(where: { $0 == nil }) {
            switch kind {
            case .workout:
                candidates.append(upgraded ? floor : (HealthSyncPrefs.connectDate(.workout, member: member) ?? startOfToday))
            case .sleep, .steps:
                candidates.append(cal.date(byAdding: .day, value: -14, to: startOfToday) ?? startOfToday)
            }
        }
        var start = max(candidates.min() ?? floor, floor)
        if kind == .workout, !upgraded, let connected = HealthSyncPrefs.connectDate(.workout, member: member) {
            start = max(start, connected)
        }
        return start
    }

    /// Rule 6 / D-C9 + amendment H1: reviewed when ANY integration's row has review_done_at, this member confirmed it
    /// locally (a 0-row first sync), or the `healthkit` row already has a last_success_at (a reinstall never re-asks).
    private func isReviewed(_ key: HealthSyncKey) -> Bool {
        if states.contains(where: { $0.program_id == key.programId && $0.kind == key.kind.rawValue && $0.review_done_at != nil }) {
            return true
        }
        return HealthSyncPrefs.isLocallyConfirmed(key.kind, programId: key.programId, member: member) || lastSuccess(key) != nil
    }

    /// Rule 4: last_success_at is per integration — the `healthkit` row only.
    private func lastSuccess(_ key: HealthSyncKey) -> Date? {
        states.first { $0.integration == "healthkit" && $0.program_id == key.programId && $0.kind == key.kind.rawValue }
            .flatMap { HealthSyncItems.instant($0.last_success_at) }
    }

    /// Review pages, A→Z by program, newest rows first (the former `buildConfirmationPages`).
    static func pages(_ rows: [String: [PendingSyncConfirmation.Row]], programs: [APIClient.ProgramDTO]) -> [PendingSyncConfirmation.ProgramPage] {
        let names = Dictionary(programs.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
        return rows.compactMap { programId, rows -> PendingSyncConfirmation.ProgramPage? in
            guard !rows.isEmpty else { return nil }
            return PendingSyncConfirmation.ProgramPage(id: programId, programName: names[programId] ?? "Program",
                                                       rows: rows.sorted { $0.payload.ymd > $1.payload.ymd })
        }.sorted { $0.programName.localizedCaseInsensitiveCompare($1.programName) == .orderedAscending }
    }
}
