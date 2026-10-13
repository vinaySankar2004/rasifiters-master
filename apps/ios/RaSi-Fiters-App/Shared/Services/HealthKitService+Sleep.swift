import Foundation
import HealthKit

/// HealthKit access for Apple Health SLEEP sync: authorization, the catch-up-window fetch (health-sync §8 rule 4), and
/// per-night "time asleep" aggregation. Observers + background delivery live in `HealthKitService.observe`.
///
/// Why this differs from the workout path: a workout is a single self-contained `HKWorkout`, so an
/// anchored (append-only) query works. A night's sleep is stitched from MANY small `HKCategorySample`s
/// that arrive incrementally (the watch syncs stages over time), so an anchor would deliver fragments,
/// not the whole night. Instead we re-query the catch-up window every sync and recompute each night from its
/// FULL sample set; the server sets (overwrites) the day's value.
///
/// Stored state lives in statics (the type is a singleton) because Swift extensions can't add instance
/// stored properties.
extension HealthKitService {

    private static let sleepStore = HKHealthStore()

    private static var sleepType: HKCategoryType {
        HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
    }

    // MARK: - Authorization

    func requestSleepAuthorization() async throws {
        guard isAvailable else {
            throw APIError(message: "Apple Health is not available on this device.")
        }
        try await Self.sleepStore.requestAuthorization(toShare: [], read: [Self.sleepType])
    }

    // MARK: - Fetch (catch-up window)

    /// health-sync §8 rule 4: every sample overlapping `[start of start's day, now]` (the catch-up window), so each
    /// night is recomputed from its full sample set. Returns raw category samples; asleep/in-bed filtering happens in
    /// `aggregateSleep(_:)`.
    func fetchSleepSamples(from start: Date) async throws -> [HKCategorySample] {
        let predicate = HKQuery.predicateForSamples(withStart: Calendar.current.startOfDay(for: start), end: Date(), options: [])
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: Self.sleepType,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let categorySamples = (samples ?? []).compactMap { $0 as? HKCategorySample }
                continuation.resume(returning: categorySamples)
            }
            Self.sleepStore.execute(query)
        }
    }

    // MARK: - Aggregation (time asleep per local wake-date)

    struct AggregatedSleep {
        let date: String      // yyyy-MM-dd — local calendar date the sample ended on (the day you woke up)
        let hours: Double     // total time asleep, 2 decimals, clamped to 0...24
    }

    /// Total *time asleep* per night, bucketed by the local calendar date of each sample's END time (the
    /// "day you woke up"), 2 dp, clamped 0...24. Prefers the precise asleep stages (core/deep/REM/
    /// unspecified); when a night has NO stage data — e.g. sleep added manually in the Health app or an
    /// iPhone-only "In Bed" schedule with no watch — it falls back to that night's `.inBed` duration so
    /// the night still syncs. Watch nights carry both, and asleep wins, so there's no double-count.
    func aggregateSleep(_ samples: [HKCategorySample]) -> [AggregatedSleep] {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"

        var asleepByDate: [String: Double] = [:]
        var inBedByDate: [String: Double] = [:]
        for sample in samples {
            let date = formatter.string(from: sample.endDate)
            let duration = sample.endDate.timeIntervalSince(sample.startDate)
            if Self.isAsleep(sample.value) {
                asleepByDate[date, default: 0] += duration
            } else if sample.value == HKCategoryValueSleepAnalysis.inBed.rawValue {
                inBedByDate[date, default: 0] += duration
            }
        }

        let dates = Set(asleepByDate.keys).union(inBedByDate.keys)
        return dates.compactMap { date in
            let asleep = asleepByDate[date, default: 0]
            let seconds = asleep > 0 ? asleep : inBedByDate[date, default: 0]
            guard seconds > 0 else { return nil }
            let hours = min(max(seconds / 3600.0, 0), 24)
            return AggregatedSleep(date: date, hours: (hours * 100).rounded() / 100)
        }
    }

    /// True for the asleep stages we count toward "time asleep": unspecified + core/deep/REM.
    /// Excludes `.inBed` and `.awake`. (iOS 16+ stage values; deployment target is well above.)
    private static func isAsleep(_ value: Int) -> Bool {
        switch value {
        case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
             HKCategoryValueSleepAnalysis.asleepCore.rawValue,
             HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
             HKCategoryValueSleepAnalysis.asleepREM.rawValue:
            return true
        default:
            return false
        }
    }
}
