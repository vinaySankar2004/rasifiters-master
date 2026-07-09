import Foundation

/// A queued first-sync confirmation for ONE Apple Health flow (workouts, sleep, OR steps), one page per
/// program. Built by the compute half of a sync (see `ProgramContext+HealthKit` / `+HealthKitSleep` / `+HealthKitSteps`)
/// and consumed by `HealthSyncConfirmationView`, which calls back into `ProgramContext` to commit a
/// page's CHECKED rows before advancing to the next program.
///
/// Why it exists: a first connect / reconnect / newly-added program can produce a large influx of rows.
/// Rather than write them silently, the unconfirmed program's rows are collected here and reviewed one
/// program at a time; a program is "confirmed" only after the user taps the glass tick.
struct PendingSyncConfirmation: Identifiable {
    enum Flow: String { case workouts, sleep, steps }

    let id = UUID()
    let flow: Flow
    var pages: [ProgramPage]        // ordered; one per unconfirmed program with >= 1 new row

    struct ProgramPage: Identifiable {
        let id: String              // programId
        let programName: String
        var rows: [Row]
        var checkedCount: Int { rows.filter(\.isChecked).count }
    }

    /// One displayable, selectable item. Carries the underlying aggregate so commit re-uses the exact
    /// same write call the silent path uses — no re-fetch, no drift.
    struct Row: Identifiable {
        var id: String { exclusionKey }     // stable + unique within a page
        let title: String                   // workout name  OR  "Sleep"
        let subtitle: String                // "Tue, Jul 1 · 42 min"  OR  "Tue, Jul 1 · 7.5 h"
        let exclusionKey: String            // "programId|date|workoutName"  OR  "programId|date"
        var isChecked: Bool = true          // default checked
        let payload: Payload
    }

    enum Payload {
        case workout(HealthKitService.AggregatedWorkout)
        case sleep(HealthKitService.AggregatedSleep)
        case steps(HealthKitService.AggregatedSteps)

        /// `yyyy-MM-dd` of the underlying item — used to sort rows most-recent-first.
        var ymd: String {
            switch self {
            case .workout(let w): return w.date
            case .sleep(let s): return s.date
            case .steps(let s): return s.date
            }
        }
    }
}
