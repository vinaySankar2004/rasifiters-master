import Foundation
import HealthKit

/// HealthKit access for Apple Health STEPS auto-sync: authorization, rolling-window daily totals,
/// and background delivery. Mirrors the sleep integration's shape (`HealthKitService+Sleep`).
///
/// Why a statistics query, not an anchored one: a day's step count accrues from MANY small samples
/// (phone + watch, deduplicated by HealthKit), so the day total must be recomputed from the full
/// sample set every sync. `HKStatisticsCollectionQuery` with `.cumulativeSum` does exactly that —
/// per-day totals with cross-source dedup — over a rolling look-back window; the backend value is
/// then upsert-overwritten. Background delivery / observer is a trigger only, never the value.
///
/// Stored state lives in statics (the type is a singleton) because Swift extensions can't add
/// instance stored properties; `stepsStore` must outlive the call so its observer keeps delivering.
extension HealthKitService {

    /// How many days back each sync re-queries — the same rolling ~2-week window as sleep, so late
    /// syncs and revised days flow in; per-program window scoping at write time bounds which of
    /// these days actually land in each program.
    static let stepsRecentDays = 14

    private static let stepsStore = HKHealthStore()
    private static var stepsObserverQuery: HKObserverQuery?

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

    // MARK: - Fetch (rolling window, per-day totals)

    struct AggregatedSteps {
        let date: String      // yyyy-MM-dd — local calendar day the steps were taken
        let count: Int        // whole-day total, rounded; always > 0 (zero days are skipped)
    }

    /// Per-day step totals across the last `stepsRecentDays`, anchored on local start-of-day buckets.
    /// `.cumulativeSum` deduplicates overlapping phone/watch samples. Days with no steps are omitted.
    func fetchStepsDailyTotals() async throws -> [AggregatedSteps] {
        let now = Date()
        let startOfToday = Calendar.current.startOfDay(for: now)
        let start = Calendar.current.date(byAdding: .day, value: -Self.stepsRecentDays, to: startOfToday) ?? startOfToday
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

    // MARK: - Background delivery (trigger only)

    func startStepsBackgroundDelivery(onUpdate: @escaping () -> Void) {
        guard isAvailable else { return }

        if let existing = Self.stepsObserverQuery {
            Self.stepsStore.stop(existing)
            Self.stepsObserverQuery = nil
        }

        let query = HKObserverQuery(sampleType: Self.stepsType, predicate: nil) { _, completionHandler, error in
            if error == nil {
                onUpdate()
            }
            completionHandler()
        }
        Self.stepsObserverQuery = query
        Self.stepsStore.execute(query)
        // Apple caps step-count background delivery at `.hourly` — same ceiling as sleep.
        Self.stepsStore.enableBackgroundDelivery(for: Self.stepsType, frequency: .hourly) { _, _ in }
    }

    func stopStepsBackgroundDelivery() {
        if let query = Self.stepsObserverQuery {
            Self.stepsStore.stop(query)
            Self.stepsObserverQuery = nil
        }
        Self.stepsStore.disableBackgroundDelivery(for: Self.stepsType) { _, _ in }
    }
}
