import Foundation
import HealthKit

/// HealthKit access for Apple Health SLEEP auto-sync: authorization, rolling-window fetch, per-night
/// "time asleep" aggregation, and background delivery.
///
/// Why this differs from the workout path: a workout is a single self-contained `HKWorkout`, so an
/// anchored (append-only) query works. A night's sleep is stitched from MANY small `HKCategorySample`s
/// that arrive incrementally (the watch syncs stages over time), so an anchor would deliver fragments,
/// not the whole night. Instead we re-query a rolling look-back window every sync and recompute each
/// night from its FULL sample set, then upsert-overwrite the backend value. Background delivery /
/// observer is used only as a trigger, never to compute the value.
///
/// Stored state lives in statics (the type is a singleton) because Swift extensions can't add instance
/// stored properties; `sleepStore` must outlive the call so its observer keeps delivering.
extension HealthKitService {

    /// How many days back each sync re-queries. A rolling ~2-week window so recent + revised nights flow
    /// in (a night revised after a late watch sync is recomputed and overwritten); per-program window
    /// scoping at write time bounds which of these nights actually land in each program.
    static let sleepRecentDays = 14

    private static let sleepStore = HKHealthStore()
    private static var sleepObserverQuery: HKObserverQuery?

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

    // MARK: - Fetch (rolling window)

    /// Re-query sleep samples across the last `sleepRecentDays` so each night is recomputed from its full
    /// sample set. Starts at the START OF DAY `sleepRecentDays` ago (so the earliest night is whole) — NOT
    /// floored at the connect date, which previously collapsed the window to `[today, today]` when a user
    /// connected the same day and silently synced nothing. Which of these nights land in a program is
    /// decided per-program at write time. Returns raw category samples; asleep/in-bed filtering happens in
    /// `aggregateSleep(_:)`.
    func fetchSleepSamples() async throws -> [HKCategorySample] {
        let now = Date()
        let startOfToday = Calendar.current.startOfDay(for: now)
        let start = Calendar.current.date(byAdding: .day, value: -Self.sleepRecentDays, to: startOfToday) ?? startOfToday
        let predicate = HKQuery.predicateForSamples(withStart: start, end: now, options: [])

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

    // MARK: - Background delivery (trigger only)

    func startSleepBackgroundDelivery(onUpdate: @escaping () -> Void) {
        guard isAvailable else { return }

        if let existing = Self.sleepObserverQuery {
            Self.sleepStore.stop(existing)
            Self.sleepObserverQuery = nil
        }

        let query = HKObserverQuery(sampleType: Self.sleepType, predicate: nil) { _, completionHandler, error in
            if error == nil {
                onUpdate()
            }
            completionHandler()
        }
        Self.sleepObserverQuery = query
        Self.sleepStore.execute(query)
        // Apple caps non-glucose category types at `.hourly` — sleep can't be `.immediate` like workouts.
        Self.sleepStore.enableBackgroundDelivery(for: Self.sleepType, frequency: .hourly) { _, _ in }
    }

    func stopSleepBackgroundDelivery() {
        if let query = Self.sleepObserverQuery {
            Self.sleepStore.stop(query)
            Self.sleepObserverQuery = nil
        }
        Self.sleepStore.disableBackgroundDelivery(for: Self.sleepType) { _, _ in }
    }
}
