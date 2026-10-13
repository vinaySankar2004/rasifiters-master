import Foundation

/// First-sync review on ProgramContext (D-CONF on health-sync §8 rule 6): the presentation queue (one flow at a time,
/// workouts > sleep > steps), the per-page commit HealthSyncConfirmationView calls, and display helpers. Review state is
/// server-side (`review_done_at`, any integration — D-C9); exclusions are local per member (`HealthSyncPrefs`).
extension ProgramContext {

    @MainActor func commitWorkoutPage(_ page: PendingSyncConfirmation.ProgramPage) async -> Bool { await commitReviewPage(page, kind: .workout) }
    @MainActor func commitSleepPage(_ page: PendingSyncConfirmation.ProgramPage) async -> Bool { await commitReviewPage(page, kind: .sleep) }
    @MainActor func commitStepsPage(_ page: PendingSyncConfirmation.ProgramPage) async -> Bool { await commitReviewPage(page, kind: .steps) }

    /// `PUT review_done: true` for the (program, kind) — the user confirmed (H1) — and only once it landed, record this
    /// page's unchecked rows as excluded (never sent — rule 3; C2#10: a failed commit excludes nothing). `false` =
    /// couldn't reach the server (the view's retry notice). The checked rows upload in the follow-up run
    /// `finishConfirmation` starts (the workout anchor was held for them — D-IOS-SYNC-2).
    @MainActor private func commitReviewPage(_ page: PendingSyncConfirmation.ProgramPage, kind: HealthSyncKind) async -> Bool {
        guard let member = SessionStore.shared.memberId else { return false }
        guard await HealthSyncEngine.shared.markReviewed(programId: page.id, kind: kind) else { return false }
        HealthSyncPrefs.addExcluded(page.rows.filter { !$0.isChecked }.map(\.exclusionKey), kind, member: member)
        return true
    }

    /// Called by the view when it finishes (committed) or is dismissed (deferred — re-offered next trigger).
    @MainActor
    func finishConfirmation(_ flow: PendingSyncConfirmation.Flow, committed: Bool) {
        promoteDeferredConfirmation()
        if committed { HealthSyncEngine.shared.trigger(.manual) }    // upload what was just reviewed
    }

    // MARK: - Presentation queue (one flow at a time; workouts > sleep > steps)

    /// Enqueue a freshly-computed confirmation. Only one is presented at a time; priority is
    /// workouts > sleep > steps — a workouts arrival defers whichever flow is showing, while sleep
    /// and steps wait in their own deferred slots. A same-flow copy that is already presented is
    /// kept (so a background recompute can't reset the user's in-progress review).
    @MainActor
    func enqueuePendingConfirmation(_ confirmation: PendingSyncConfirmation) {
        guard !confirmation.pages.isEmpty else { return }

        guard let current = pendingSyncConfirmation else {
            if confirmation.flow == .sleep, deferredSleepConfirmation != nil {
                deferredSleepConfirmation = confirmation      // replace a stale deferred sleep flow
            } else if confirmation.flow == .steps, deferredStepsConfirmation != nil {
                deferredStepsConfirmation = confirmation      // replace a stale deferred steps flow
            } else {
                pendingSyncConfirmation = confirmation
            }
            return
        }

        if confirmation.flow == current.flow {
            return                                            // already showing this flow — keep it
        }

        switch confirmation.flow {
        case .workouts:
            // Workouts win; whichever flow is showing waits in its deferred slot.
            if current.flow == .sleep {
                deferredSleepConfirmation = current
            } else if current.flow == .steps {
                deferredStepsConfirmation = current
            }
            pendingSyncConfirmation = confirmation
        case .sleep:
            deferredSleepConfirmation = confirmation           // sleep waits behind the showing flow
        case .steps:
            deferredStepsConfirmation = confirmation           // steps waits behind everything
        }
    }

    @MainActor
    private func promoteDeferredConfirmation() {
        if let sleep = deferredSleepConfirmation {
            deferredSleepConfirmation = nil
            let pages = sleep.pages.filter { sleepSyncProgramIds.contains($0.id) }
            if !pages.isEmpty {
                pendingSyncConfirmation = PendingSyncConfirmation(flow: .sleep, pages: pages)
                return
            }
        }
        if let steps = deferredStepsConfirmation {
            deferredStepsConfirmation = nil
            let pages = steps.pages.filter { stepsSyncProgramIds.contains($0.id) }
            if !pages.isEmpty {
                pendingSyncConfirmation = PendingSyncConfirmation(flow: .steps, pages: pages)
                return
            }
        }
        pendingSyncConfirmation = nil
    }

    // MARK: - Display helpers (review rows)

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

    static func formatSteps(_ n: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        let grouped = formatter.string(from: NSNumber(value: n)) ?? "\(n)"
        return "\(grouped) steps"
    }
}
