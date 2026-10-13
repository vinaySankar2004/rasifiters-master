import Foundation
import HealthKit

/// HealthKit access for Apple Health STEPS sync: authorization and catch-up-window daily totals (health-sync §8
/// rule 4). Mirrors the sleep integration's shape (`HealthKitService+Sleep`); observers + background delivery live in
/// `HealthKitService.observe`.
///
/// Why a statistics query, not an anchored one: a day's step count accrues from MANY small samples
/// (phone + watch, deduplicated by HealthKit), so the day total must be recomputed from the full
/// sample set every sync. `HKStatisticsCollectionQuery` with `.cumulativeSum` does exactly that —
/// per-day totals with cross-source dedup — over the catch-up window; the server sets (overwrites) the day's value.
///
/// Stored state lives in statics (the type is a singleton) because Swift extensions can't add
/// instance stored properties.
extension HealthKitService {

    private static let stepsStore = HKHealthStore()

    private static var stepsType: HKQuantityType {
        HKQuantityType.quantityType(forIdentifier: .stepCount)!
    }

    // MARK: - Authorization

    func requestStepsAuthorization() async throws {
        guard isAvailable else {
            throw APIError(message: "Apple Health is not available on this device.")
        }
        try await Self.stepsStore.requestAuthorization(toShare: [], read: [Self.stepsType])
    }

    // MARK: - Fetch (catch-up window, per-day totals)

    struct AggregatedSteps {
        let date: String      // yyyy-MM-dd — local calendar day the steps were taken
        let count: Int        // whole-day total, rounded; always > 0 (zero days are skipped)
    }

    /// health-sync §8 rule 4: per-day totals over the catch-up window, anchored on local start-of-day buckets.
    /// `.cumulativeSum` deduplicates overlapping phone/watch samples. Days with no steps are omitted.
    func fetchStepsDailyTotals(from start: Date) async throws -> [AggregatedSteps] {
        let now = Date()
        let startOfToday = Calendar.current.startOfDay(for: now)
        let start = Calendar.current.startOfDay(for: start)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: now, options: [])

        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsCollectionQuery(
                quantityType: Self.stepsType,
                quantitySamplePredicate: predicate,
                options: .cumulativeSum,
                anchorDate: startOfToday,
                intervalComponents: DateComponents(day: 1)
            )
            query.initialResultsHandler = { _, collection, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                var totals: [AggregatedSteps] = []
                collection?.enumerateStatistics(from: start, to: now) { statistics, _ in
                    guard let sum = statistics.sumQuantity()?.doubleValue(for: .count()) else { return }
                    let count = Int(sum.rounded())
                    guard count > 0 else { return }
                    totals.append(AggregatedSteps(date: formatter.string(from: statistics.startDate), count: count))
                }
                continuation.resume(returning: totals)
            }
            Self.stepsStore.execute(query)
        }
    }
}
