import Foundation
import HealthKit
import UIKit

/// health-sync §8 on iOS — ONE engine per device, a singleton (not the view-owned ProgramContext), so a HealthKit
/// background wake syncs without a scene (W3 F1). One run in flight (rule 1). A run = the rule-9 upgrade (once) →
/// GET /programs + GET /state → HealthKit reads → POST /batch → PUT /state → advance or hold (rule 5) → `sync.run`.
final class HealthSyncEngine {
    static let shared = HealthSyncEngine()
    private init() {}

    enum Trigger: String {
        case launch, foreground, background, connect, manual
        case pullToRefresh = "pull_to_refresh"
        case programEntry = "program_entry"
        /// Screen triggers fold into a run in flight and are spaced ≥ 60 s (member rate limiter). User actions wait
        /// for a run in flight and then run (amendment H4); a HealthKit wake is spaced only while the app is active (H5).
        var isScreenTrigger: Bool { self == .launch || self == .foreground || self == .programEntry }
    }

    /// UI hooks, set by ProgramContext (nil on a scene-less background launch — the run still works).
    var onRunFinished: ((HealthSyncReport) -> Void)?
    var onReviewNeeded: ((PendingSyncConfirmation) -> Void)?

    private var inFlight: Task<HealthSyncReport, Never>?
    private var runId = 0
    private var lastStart: Date?
    private var notBefore: Date?                                   // Retry-After of a 429 / 503 (rule 8)
    private var lastReport = HealthSyncReport()
    private var observedMember: String?
    private var observedKinds: Set<HealthSyncKind>?
    private var backgroundTask = UIBackgroundTaskIdentifier.invalid
    private static let spacing: TimeInterval = 60

    // MARK: - Observers (rule 1: at launch, every launch; HealthKit's handler is called after the work — W3 F2)

    /// Needs a signed-in member (before the first unlock none is readable → retried on unlock / sign-in). Sign-out stops
    /// the observers through `pause()`.
    func registerObservers() {
        guard let member = SessionStore.shared.memberId else { return }
        let kinds = Set(HealthSyncKind.allCases.filter { HealthSyncPrefs.isActive($0, member: member) })
        if observedKinds == kinds, observedMember == member { return }
        observedMember = member
        observedKinds = kinds
        HealthKitService.shared.observe(kinds) { done in
            Task { @MainActor in
                // A wake while the device is locked can't read Health — acknowledge; the next trigger catches up.
                guard UIApplication.shared.isProtectedDataAvailable else {
                    done()
                    return
                }
                _ = await HealthSyncEngine.shared.run(.background)
                done()
            }
        }
    }

    /// Any sign-out: the run in flight is cancelled, observers stop, spacing resets. Per-member prefs are kept (rule 7).
    func pause() {
        inFlight?.cancel()
        inFlight = nil
        runId += 1
        lastStart = nil
        notBefore = nil
        lastReport = HealthSyncReport()
        observedMember = nil
        observedKinds = []
        HealthKitService.shared.observe([]) { done in done() }
    }

    func trigger(_ trigger: Trigger) { Task { _ = await run(trigger) } }

    @discardableResult
    func run(_ trigger: Trigger) async -> HealthSyncReport {
        let spaced = trigger.isScreenTrigger || (trigger == .background && UIApplication.shared.applicationState == .active)
        if let current = inFlight {
            let report = await current.value
            if spaced { return report }
            if let newer = inFlight { return await newer.value }      // began after this trigger → it already covers it
        }
        if spaced, let lastStart, Date().timeIntervalSince(lastStart) < Self.spacing { return lastReport }
        if spaced || trigger == .background, let notBefore, Date() < notBefore { return lastReport }
        lastStart = Date()
        runId += 1
        let id = runId
        let task = Task { () -> HealthSyncReport in
            let report = await self.perform(trigger)
            if self.runId == id {                                     // not superseded by pause()
                self.inFlight = nil
                self.lastReport = report
            }
            return report
        }
        inFlight = task
        return await task.value
    }

    /// Review page commit (D-CONF, amendment H1): `PUT review_done: true` for one (program, kind) — the only path that
    /// ever sends it.
    func markReviewed(programId: String, kind: HealthSyncKind) async -> Bool {
        (try? await APIClient.shared.putHealthSyncState([.init(program_id: programId, kind: kind.rawValue, review_done: true)])) != nil
    }

    // MARK: - The run

    private func perform(_ trigger: Trigger) async -> HealthSyncReport {
        guard HealthKitService.shared.isAvailable, SessionStore.shared.accessToken != nil,
              let member = SessionStore.shared.memberId else { return HealthSyncReport() }
        let kinds = HealthSyncKind.allCases.filter { HealthSyncPrefs.isActive($0, member: member) }
        guard !kinds.isEmpty else { return HealthSyncReport() }
        let began = beginBackgroundTask()
        defer { if began { endBackgroundTask() } }
        HealthSyncPrefs.pruneExcluded(member: member)
        var run = HealthSyncRunSummary(trigger: trigger, kinds: kinds, started: Date())
        let api = APIClient.shared

        // Rule 9 FIRST — the state read below then already holds the reviews the upgrade carried over.
        let upgrade = await HealthSyncUpgrade.runIfPending(member: member)
        run.legacyRecorded = upgrade.recorded
        if let error = upgrade.error { run.error = error; return finish(run, member: member) }

        let token = SessionStore.shared.accessToken ?? ""          // read here: async-let children never touch the store
        async let programsCall = api.fetchPrograms(token: token)
        async let stateCall = api.fetchHealthSyncState()
        let programs: [APIClient.ProgramDTO]
        let stateResponse: APIClient.HealthSyncStateResponse
        do {
            programs = try await programsCall
            stateResponse = try await stateCall
        } catch {
            run.error = error
            return finish(run, member: member)
        }
        let planner = HealthSyncPlanner(member: member, programs: programs, states: stateResponse.states,
                                        isGlobalAdmin: SessionStore.shared.isGlobalAdmin)
        var plan = await planner.plan(kinds: kinds)
        let upload = await api.uploadHealthSync(plan.items)
        run.upload = upload
        run.plan = plan
        if SessionStore.shared.memberId != member || SessionStore.shared.accessToken == nil {
            run.sessionEnded = true                                    // signed out mid-run: touch nothing else
            return finish(run, member: member)
        }
        if Task.isCancelled { run.error = CancellationError(); return finish(run, member: member) }   // out of bg time: hold
        let serverHeld = plan.applyServerHolds(upload)
        run.plan = plan
        run.error = upload.error
        if upload.error == nil {
            _ = try? await api.putHealthSyncState(plan.stateEntries(excluding: serverHeld))
            // A Disconnect while this run was in flight writes nothing back for that kind (C2#13).
            if kinds.contains(.workout), HealthSyncPrefs.isEnabled(.workout, member: member), !plan.holdWorkoutAnchor,
               let anchor = plan.newWorkoutAnchor {
                HealthSyncPrefs.setAnchor(anchor, member: member)
            }
            for kind in kinds {
                let keys = plan.localConfirms.subtracting(serverHeld).filter { $0.kind == kind }
                HealthSyncPrefs.addLocallyConfirmed(Set(keys.map(\.programId)), kind, member: member)
            }
        }
        for (kind, rows) in plan.reviewRows where HealthSyncPrefs.isEnabled(kind, member: member) {   // not if disconnected mid-run
            let pages = HealthSyncPlanner.pages(rows, programs: programs)
            if !pages.isEmpty { onReviewNeeded?(PendingSyncConfirmation(flow: kind.flow, pages: pages)) }
        }
        if let retryAfter = (upload.error as? APIHTTPError)?.retryAfter {
            notBefore = Date().addingTimeInterval(TimeInterval(retryAfter))
        }
        return finish(run, member: member)
    }

    /// Local status (D-SIL), the success notification (D7 / D-S4), the UI hook and the `sync.run` event. A run whose
    /// session ended only reports `signedOut`; a kind disconnected mid-run records nothing.
    private func finish(_ run: HealthSyncRunSummary, member: String) -> HealthSyncReport {
        var run = run
        if SessionStore.shared.memberId != member { run.sessionEnded = true }
        var report = HealthSyncReport()
        if !run.sessionEnded {
            for kind in run.kinds where HealthSyncPrefs.isEnabled(kind, member: member) {
                let status = run.status(kind)
                HealthSyncPrefs.recordRun(kind, member: member, status)
                report.kinds[kind] = status.outcome
                switch status {
                case .success(let count), .held(let count):
                    switch kind {
                    case .workout: HealthKitSyncNotifier.notifySuccess(count: count)
                    case .sleep: HealthKitSyncNotifier.notifySleepSuccess(count: count)
                    case .steps: HealthKitSyncNotifier.notifyStepsSuccess(count: count)
                    }
                case .failed, .readFailed:
                    break
                }
            }
            report.workoutsChanged = run.workoutsChanged
            onRunFinished?(report)
        }
        ClientEventQueue.shared.recordSyncRun(run.eventProps)
        return report
    }

    /// true = this run began the background task (and must end it).
    private func beginBackgroundTask() -> Bool {
        guard backgroundTask == .invalid else { return false }
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "health-sync") { [weak self] in
            self?.inFlight?.cancel()                 // out of background time: the run holds, retried next trigger
            self?.endBackgroundTask()
        }
        return true
    }

    private func endBackgroundTask() {
        guard backgroundTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTask)
        backgroundTask = .invalid
    }
}
