import Foundation

/// Shared per-program date-window scoping for BOTH Apple Health syncs (workouts + sleep).
///
/// An aggregated item (a workout on a day, a night's sleep) must only be written to a program whose
/// active window `[start_date, end_date]` contains that item's date — otherwise data "from eons ago"
/// leaks into a recent program (and vice-versa). `ProgramDTO` already carries `start_date`/`end_date`
/// as `yyyy-MM-dd` strings, so the check is pure client-side string comparison (ISO dates sort
/// lexicographically). The backend accepts any log date, so this policy lives here.
extension ProgramContext {

    /// `id → (start, end)` for the selected programs, with `end` capped at today so future-dated samples
    /// and already-ended programs never receive new data. Ensures `programs` is populated first (a
    /// background trigger may run before the settings screen loaded them). Programs lacking a
    /// `start_date` are omitted — they can't be scoped; the sync's rolling fetch window still bounds
    /// recency. Returns empty if programs can't be loaded (offline) — the sync then writes nothing and
    /// retries on the next trigger, which is safer than dumping unscoped data.
    @MainActor
    func loadSyncWindows(for ids: Set<String>, token: String) async -> [String: (start: String, end: String)] {
        guard !ids.isEmpty else { return [:] }

        var list = programs
        if !ids.isSubset(of: Set(list.map(\.id))) {
            if let fetched = try? await APIClient.shared.fetchPrograms(token: token) {
                programs = fetched
                list = fetched
            }
        }

        let today = ProgramContext.localYMD(Date())
        var windows: [String: (start: String, end: String)] = [:]
        for program in list where ids.contains(program.id) {
            guard let start = program.start_date, !start.isEmpty else { continue }
            let end = min(program.end_date ?? today, today)
            guard start <= end else { continue }
            windows[program.id] = (start, end)
        }
        return windows
    }

    /// `yyyy-MM-dd` in the device-local calendar — matches how the workout/sleep aggregators bucket dates.
    static func localYMD(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    /// Whether an item's `yyyy-MM-dd` date falls inside a program window (inclusive).
    static func date(_ ymd: String, isWithin window: (start: String, end: String)) -> Bool {
        ymd >= window.start && ymd <= window.end
    }
}
