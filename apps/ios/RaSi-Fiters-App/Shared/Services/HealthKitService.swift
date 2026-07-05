import Foundation
import HealthKit

/// HealthKit access for Apple Health workout auto-sync: authorization, incremental (anchored) fetch,
/// background delivery, and same-type/same-day aggregation.
///
/// Anchor integrity: unlike a naive anchored query, this does NOT persist the new anchor inside the
/// fetch. `fetchNewWorkouts()` returns the new anchor to the caller, which persists it via
/// `commitAnchor(_:)` only AFTER the backend sync succeeds — so a failed upload is retried on the next
/// trigger instead of being silently skipped.
final class HealthKitService {
    static let shared = HealthKitService()
    private init() {}

    private let healthStore = HKHealthStore()
    private var observerQuery: HKObserverQuery?
    private let anchorKey = "healthkit.workoutAnchor"

    var isAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    // MARK: - Authorization

    func requestAuthorization() async throws {
        guard isAvailable else {
            throw APIError(message: "Apple Health is not available on this device.")
        }
        let workoutType = HKObjectType.workoutType()
        try await healthStore.requestAuthorization(toShare: [], read: [workoutType])
    }

    // MARK: - Anchor persistence

    private func loadAnchor() -> HKQueryAnchor? {
        guard let data = UserDefaults.standard.data(forKey: anchorKey) else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }

    /// Persist the anchor. Call ONLY after the corresponding workouts have been successfully synced.
    func commitAnchor(_ anchor: HKQueryAnchor?) {
        guard let anchor,
              let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true)
        else { return }
        UserDefaults.standard.set(data, forKey: anchorKey)
    }

    func clearAnchor() {
        UserDefaults.standard.removeObject(forKey: anchorKey)
    }

    // MARK: - Fetch new workouts (anchored query)

    struct FetchResult {
        let workouts: [HKWorkout]
        let newAnchor: HKQueryAnchor?
    }

    /// Fetch workouts added/changed since the persisted anchor. On the first sync (nil anchor) only
    /// workouts from the connect date forward are considered, so we never backfill arbitrary history.
    /// Does NOT persist the anchor — the caller commits it after a successful sync.
    func fetchNewWorkouts(firstSyncCutoff: Date?) async throws -> FetchResult {
        let workoutType = HKObjectType.workoutType()
        let anchor = loadAnchor()

        var predicate: NSPredicate?
        if anchor == nil, let cutoff = firstSyncCutoff {
            predicate = HKQuery.predicateForSamples(withStart: cutoff, end: nil, options: .strictStartDate)
        }

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKAnchoredObjectQuery(
                type: workoutType,
                predicate: predicate,
                anchor: anchor,
                limit: HKObjectQueryNoLimit
            ) { _, samples, _, newAnchor, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let workouts = (samples ?? []).compactMap { $0 as? HKWorkout }
                continuation.resume(returning: FetchResult(workouts: workouts, newAnchor: newAnchor))
            }
            healthStore.execute(query)
        }
    }

    // MARK: - Background delivery

    func startBackgroundDelivery(onUpdate: @escaping () -> Void) {
        guard isAvailable else { return }

        if let existing = observerQuery {
            healthStore.stop(existing)
            observerQuery = nil
        }

        let workoutType = HKObjectType.workoutType()
        let query = HKObserverQuery(sampleType: workoutType, predicate: nil) { _, completionHandler, error in
            if error == nil {
                onUpdate()
            }
            completionHandler()
        }
        observerQuery = query
        healthStore.execute(query)
        healthStore.enableBackgroundDelivery(for: workoutType, frequency: .immediate) { _, _ in }
    }

    func stopBackgroundDelivery() {
        if let query = observerQuery {
            healthStore.stop(query)
            observerQuery = nil
        }
        let workoutType = HKObjectType.workoutType()
        healthStore.disableBackgroundDelivery(for: workoutType) { _, _ in }
    }

    // MARK: - Aggregation

    struct AggregatedWorkout {
        struct Sample {
            let uuid: String        // HKWorkout.uuid — the idempotency-ledger identity (D-SUM)
            let minutes: Double     // raw (unrounded) duration of this one sample
        }

        let workoutName: String
        let date: String            // yyyy-MM-dd
        let samples: [Sample]       // contributing HK samples for this (name, day) group

        /// Whole-group minutes (min 1) — used for confirmation-row display.
        var durationMinutes: Int { AggregatedWorkout.minutes(of: samples) }

        /// Rounded, floored-at-1 minutes for a subset (the per-program unapplied slice).
        static func minutes(of samples: [Sample]) -> Int {
            max(Int(samples.map(\.minutes).reduce(0, +).rounded()), 1)
        }
    }

    /// Group workouts by (mapped library name, calendar day), so multiple Apple workouts of the same
    /// type on one day collapse into a single log matching the backend's composite primary key. Each
    /// group keeps its contributing samples (uuid + minutes) so the write sites can filter out samples
    /// already applied to a given program (see `HealthKitAppliedLedger`) and send only the unapplied
    /// remainder. Uses the local calendar for the date bucket.
    func aggregate(_ workouts: [HKWorkout]) -> [AggregatedWorkout] {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"

        var grouped: [String: [AggregatedWorkout.Sample]] = [:]
        for workout in workouts {
            let name = HealthKitWorkoutTypeMap.workoutName(for: workout.workoutActivityType)
            let date = formatter.string(from: workout.startDate)
            grouped["\(name)||\(date)", default: []].append(
                .init(uuid: workout.uuid.uuidString, minutes: workout.duration / 60.0))
        }

        return grouped.compactMap { key, samples in
            let parts = key.components(separatedBy: "||")
            guard parts.count == 2 else { return nil }
            return AggregatedWorkout(workoutName: parts[0], date: parts[1], samples: samples)
        }
    }
}
