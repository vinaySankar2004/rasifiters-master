import Foundation
import HealthKit

/// HealthKit access for the health-sync v2 engine: authorization, workout changes (anchored, with deletions), reads by
/// UUID, observers + background delivery, and the (type, day) grouping used by the first-sync review rows.
final class HealthKitService {
    static let shared = HealthKitService()
    private init() {}

    private let healthStore = HKHealthStore()
    private var observerQueries: [HealthSyncKind: HKObserverQuery] = [:]

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

    // MARK: - health-sync v2 (HealthSyncEngine / HealthSyncPlanner / HealthSyncUpgrade)

    static func sampleType(for kind: HealthSyncKind) -> HKSampleType {
        switch kind {
        case .workout: return HKObjectType.workoutType()
        case .sleep: return HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
        case .steps: return HKQuantityType.quantityType(forIdentifier: .stepCount)!
        }
    }

    func requestAuthorization(for kind: HealthSyncKind) async throws {
        switch kind {
        case .workout: try await requestAuthorization()
        case .sleep: try await requestSleepAuthorization()
        case .steps: try await requestStepsAuthorization()
        }
    }

    struct WorkoutChanges {
        let workouts: [HKWorkout]
        let deletedIds: [String]
        let newAnchor: HKQueryAnchor?
    }

    /// Workouts added since `anchor` + the ids HealthKit deleted (§8 rule 3). With no anchor (first run, a new member,
    /// the upgrade run) it reads from `start` — the rule-4 catch-up window. The caller persists the anchor.
    func fetchWorkoutChanges(anchor: HKQueryAnchor?, since start: Date) async throws -> WorkoutChanges {
        let predicate = anchor == nil ? HKQuery.predicateForSamples(withStart: start, end: nil, options: .strictStartDate) : nil
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKAnchoredObjectQuery(type: HKObjectType.workoutType(), predicate: predicate, anchor: anchor,
                                              limit: HKObjectQueryNoLimit) { _, samples, deleted, newAnchor, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: WorkoutChanges(workouts: (samples ?? []).compactMap { $0 as? HKWorkout },
                                                              deletedIds: (deleted ?? []).map { $0.uuid.uuidString },
                                                              newAnchor: newAnchor))
            }
            healthStore.execute(query)
        }
    }

    /// Re-read workouts by UUID (rule 9). Samples Health no longer has are simply absent.
    func fetchWorkouts(uuids: Set<UUID>) async throws -> [HKWorkout] {
        guard !uuids.isEmpty else { return [] }
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: HKQuery.predicateForObjects(with: uuids),
                                      limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: (samples ?? []).compactMap { $0 as? HKWorkout })
            }
            healthStore.execute(query)
        }
    }

    /// Rule 1, Apple's way: observer queries + background delivery for `kinds` (workouts `.immediate`, sleep / steps
    /// `.hourly` — Apple's cap), disabled for the rest. `onWake` receives HealthKit's completion handler and must call
    /// it once the run is over — never before the work (W3 F2).
    func observe(_ kinds: Set<HealthSyncKind>, onWake: @escaping @Sendable (@escaping () -> Void) -> Void) {
        guard isAvailable else { return }
        for kind in HealthSyncKind.allCases {
            if let query = observerQueries.removeValue(forKey: kind) { healthStore.stop(query) }
            let type = Self.sampleType(for: kind)
            guard kinds.contains(kind) else {
                healthStore.disableBackgroundDelivery(for: type) { _, _ in }
                continue
            }
            let query = HKObserverQuery(sampleType: type, predicate: nil) { _, completionHandler, error in
                guard error == nil else {
                    completionHandler()
                    return
                }
                onWake(completionHandler)
            }
            observerQueries[kind] = query
            healthStore.execute(query)
            healthStore.enableBackgroundDelivery(for: type, frequency: kind == .workout ? .immediate : .hourly) { _, _ in }
        }
    }

    // MARK: - Aggregation (first-sync review rows only)

    struct AggregatedWorkout {
        struct Sample {
            let uuid: String        // HKWorkout.uuid
            let minutes: Double     // raw (unrounded) duration of this one sample
        }

        let workoutName: String
        let date: String            // yyyy-MM-dd
        let samples: [Sample]       // contributing HK samples for this (name, day) group

        /// Whole-group minutes (min 1) — used for confirmation-row display.
        var durationMinutes: Int { AggregatedWorkout.minutes(of: samples) }

        /// Rounded, floored-at-1 minutes for a subset.
        static func minutes(of samples: [Sample]) -> Int {
            max(Int(samples.map(\.minutes).reduce(0, +).rounded()), 1)
        }
    }

    /// Group workouts by (mapped library name, calendar day) for the review screen's rows (exclusion keys are per
    /// program + day + name). Uploads stay per sample (health-sync §8 rule 3). Uses the local calendar for the day.
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
