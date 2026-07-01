import Foundation

/// First-time Apple Health sync confirmation on `ProgramContext`: per-program "confirmed" gating,
/// per-row exclusions, the queue that presents one flow at a time (workouts before sleep), the per-page
/// commit the confirmation view calls, and the display helpers used to build the review rows.
///
/// The gating state is client-side `UserDefaults` (mirrors the rest of the Apple Health integration).
/// A program is gated until it is confirmed; a row the user unchecks is recorded as excluded so later
/// SILENT syncs never re-add it. See `PendingSyncConfirmation` for the model and
/// `HealthSyncConfirmationView` for the UI.
extension ProgramContext {

    private enum HealthGatingKeys {
        static let workoutConfirmedProgramIds = "healthkit.confirmedProgramIds"
        static let sleepConfirmedProgramIds   = "healthkit.sleep.confirmedProgramIds"
        static let workoutExcludedKeys        = "healthkit.excludedKeys"
        static let sleepExcludedKeys          = "healthkit.sleep.excludedKeys"
    }

    private func confirmedKey(_ flow: PendingSyncConfirmation.Flow) -> String {
        flow == .workouts ? HealthGatingKeys.workoutConfirmedProgramIds
                          : HealthGatingKeys.sleepConfirmedProgramIds
    }
    private func excludedDefaultsKey(_ flow: PendingSyncConfirmation.Flow) -> String {
        flow == .workouts ? HealthGatingKeys.workoutExcludedKeys
                          : HealthGatingKeys.sleepExcludedKeys
    }

    // MARK: - Confirmed programs

    func confirmedProgramIds(_ flow: PendingSyncConfirmation.Flow) -> Set<String> {
        Set(UserDefaults.standard.stringArray(forKey: confirmedKey(flow)) ?? [])
    }
    func markProgramConfirmed(_ id: String, flow: PendingSyncConfirmation.Flow) {
        var set = confirmedProgramIds(flow)
        set.insert(id)
        UserDefaults.standard.set(Array(set), forKey: confirmedKey(flow))
    }
    /// Re-gate every program for a flow — used on reconnect so a fresh connect re-confirms all programs.
    func clearConfirmedPrograms(_ flow: PendingSyncConfirmation.Flow) {
        UserDefaults.standard.removeObject(forKey: confirmedKey(flow))
    }

    // MARK: - Excluded rows

    func excludedKeys(_ flow: PendingSyncConfirmation.Flow) -> Set<String> {
        Set(UserDefaults.standard.stringArray(forKey: excludedDefaultsKey(flow)) ?? [])
    }
    func addExcludedKeys(_ keys: [String], flow: PendingSyncConfirmation.Flow) {
        guard !keys.isEmpty else { return }
        var set = excludedKeys(flow)
        set.formUnion(keys)
        UserDefaults.standard.set(Array(set), forKey: excludedDefaultsKey(flow))
    }
    func setExcludedKeys(_ keys: Set<String>, flow: PendingSyncConfirmation.Flow) {
        UserDefaults.standard.set(Array(keys), forKey: excludedDefaultsKey(flow))
    }
    func clearExcludedKeys(_ flow: PendingSyncConfirmation.Flow) {
        UserDefaults.standard.removeObject(forKey: excludedDefaultsKey(flow))
    }

    /// Drop excluded SLEEP keys whose date has aged out of the rolling look-back window — those nights
    /// can never be re-fetched, so keeping them is dead weight. Called at the start of each sleep sync.
    func pruneSleepExcludedKeys() {
        let keys = excludedKeys(.sleep)
        guard !keys.isEmpty else { return }
        let cal = Calendar.current
        let cutoff = cal.date(byAdding: .day, value: -HealthKitService.sleepRecentDays,
                              to: cal.startOfDay(for: Date())) ?? Date()
        let cutoffYMD = ProgramContext.localYMD(cutoff)
        let kept = keys.filter { key in
            guard let date = key.split(separator: "|").last.map(String.init) else { return false }
            return date >= cutoffYMD
        }
        if kept.count != keys.count { setExcludedKeys(Set(kept), flow: .sleep) }
    }

    // MARK: - Exclusion-key builders

    static func workoutExclusionKey(programId: String, date: String, workoutName: String) -> String {
        "\(programId)|\(date)|\(workoutName)"
    }
    static func sleepExclusionKey(programId: String, date: String) -> String {
        "\(programId)|\(date)"
    }

    // MARK: - Page building + display

    /// Turn `programId → rows` into ordered pages (recent rows first within a page, programs A→Z).
    func buildConfirmationPages(_ pageRows: [String: [PendingSyncConfirmation.Row]]) -> [PendingSyncConfirmation.ProgramPage] {
        let nameById = Dictionary(programs.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
        return pageRows.compactMap { programId, rows -> PendingSyncConfirmation.ProgramPage? in
            guard !rows.isEmpty else { return nil }
            let sorted = rows.sorted { $0.payload.ymd > $1.payload.ymd }
            return PendingSyncConfirmation.ProgramPage(
                id: programId, programName: nameById[programId] ?? "Program", rows: sorted)
        }.sorted { $0.programName.localizedCaseInsensitiveCompare($1.programName) == .orderedAscending }
    }

    /// `yyyy-MM-dd` → e.g. "Tue, Jul 1" in the device locale; falls back to the raw string.
    static func displayDate(_ ymd: String) -> String {
        let input = DateFormatter()
        input.calendar = Calendar.current
        input.locale = Locale(identifier: "en_US_POSIX")
        input.dateFormat = "yyyy-MM-dd"
        guard let date = input.date(from: ymd) else { return ymd }
        let out = DateFormatter()
        out.calendar = Calendar.current
        out.locale = Locale.current
        out.dateFormat = "EEE, MMM d"
        return out.string(from: date)
    }

    static func formatHours(_ hours: Double) -> String {
        String(format: "%.1f h", hours)
    }

    // MARK: - Presentation queue (one flow at a time; workouts first)

    /// Enqueue a freshly-computed confirmation. Only one is presented at a time; workouts take priority
    /// over sleep, and a same-flow copy that is already presented is kept (so a background recompute
    /// can't reset the user's in-progress review).
    @MainActor
    func enqueuePendingConfirmation(_ confirmation: PendingSyncConfirmation) {
        guard !confirmation.pages.isEmpty else { return }

        guard let current = pendingSyncConfirmation else {
            if confirmation.flow == .sleep, deferredSleepConfirmation != nil {
                deferredSleepConfirmation = confirmation      // replace a stale deferred sleep flow
            } else {
                pendingSyncConfirmation = confirmation
            }
            return
        }

        if confirmation.flow == current.flow {
            return                                            // already showing this flow — keep it
        } else if confirmation.flow == .workouts {
            deferredSleepConfirmation = current               // workouts win; sleep waits
            pendingSyncConfirmation = confirmation
        } else {
            deferredSleepConfirmation = confirmation           // sleep waits behind workouts
        }
    }

    /// Called by the view when it finishes (committed) or is dismissed (deferred). Commits the stashed
    /// workout anchor only on a clean full completion, then promotes any deferred sleep flow.
    @MainActor
    func finishConfirmation(_ flow: PendingSyncConfirmation.Flow, committed: Bool) {
        if flow == .workouts {
            if committed {
                commitPendingWorkoutAnchorIfClean()
            } else {
                ProgramContext.pendingWorkoutAnchor = nil      // deferred — drop stash uncommitted
                ProgramContext.pendingWorkoutHadRetryable = false
                ProgramContext.pendingWorkoutLockHeld = false
            }
        }
        promoteDeferredConfirmation()
    }

    @MainActor
    private func promoteDeferredConfirmation() {
        if let sleep = deferredSleepConfirmation {
            deferredSleepConfirmation = nil
            let pages = sleep.pages.filter { sleepSyncProgramIds.contains($0.id) }
            pendingSyncConfirmation = pages.isEmpty ? nil
                : PendingSyncConfirmation(flow: .sleep, pages: pages)
        } else {
            pendingSyncConfirmation = nil
        }
    }

    // MARK: - Per-page commit (called by the confirmation view's glass tick)

    /// Commit ONE workout program's checked rows. Records unchecked rows as excluded first, then writes
    /// each checked, in-window row. Returns `false` (retry, program stays unconfirmed) on offline window
    /// resolution or a retryable write; `true` marks the program confirmed. Never touches the anchor —
    /// the anchor commits once the whole flow finishes (`finishConfirmation`).
    @MainActor
    func commitWorkoutPage(_ page: PendingSyncConfirmation.ProgramPage) async -> Bool {
        guard let token = authToken, !token.isEmpty,
              let memberName = loggedInUserName, !memberName.isEmpty else { return false }

        let windows = await loadSyncWindows(for: [page.id], token: token)
        guard let window = windows[page.id] else { return false }      // offline / unscopable → retry
        if isDataEntryLocked(programId: page.id) { return false }       // locked mid-review → retry, stay unconfirmed

        addExcludedKeys(page.rows.filter { !$0.isChecked }.map(\.exclusionKey), flow: .workouts)

        var hadRetryable = false
        var created = 0
        for row in page.rows where row.isChecked {
            guard case let .workout(w) = row.payload,
                  ProgramContext.date(w.date, isWithin: window) else { continue }
            let outcome = await APIClient.shared.writeHealthKitWorkoutLog(
                token: token, memberName: memberName, workoutName: w.workoutName,
                date: w.date, durationMinutes: w.durationMinutes,
                programId: page.id, memberId: loggedInUserId)
            switch outcome {
            case .created: created += 1
            case .duplicate, .skipped: break
            case .retryable: hadRetryable = true
            }
        }

        guard !hadRetryable else { return false }
        markProgramConfirmed(page.id, flow: .workouts)
        lastHealthKitSyncCount += created
        persistHealthKitSettings()
        return true
    }

    /// Commit ONE sleep program's checked nights (POST-then-PUT upsert). Same contract as the workout
    /// commit; sleep has no anchor, so each page commit is fully self-contained.
    @MainActor
    func commitSleepPage(_ page: PendingSyncConfirmation.ProgramPage) async -> Bool {
        guard let token = authToken, !token.isEmpty else { return false }

        let windows = await loadSyncWindows(for: [page.id], token: token)
        guard let window = windows[page.id] else { return false }
        if isDataEntryLocked(programId: page.id) { return false }       // locked mid-review → retry, stay unconfirmed

        addExcludedKeys(page.rows.filter { !$0.isChecked }.map(\.exclusionKey), flow: .sleep)

        var hadRetryable = false
        var created = 0
        for row in page.rows where row.isChecked {
            guard case let .sleep(night) = row.payload,
                  ProgramContext.date(night.date, isWithin: window) else { continue }
            let outcome = await APIClient.shared.writeHealthKitSleepLog(
                token: token, logDate: night.date, sleepHours: night.hours,
                programId: page.id, memberId: loggedInUserId)
            switch outcome {
            case .created: created += 1
            case .updated, .skipped: break
            case .retryable: hadRetryable = true
            }
        }

        guard !hadRetryable else { return false }
        markProgramConfirmed(page.id, flow: .sleep)
        lastSleepSyncCount += created
        persistSleepSyncSettings()
        return true
    }
}
