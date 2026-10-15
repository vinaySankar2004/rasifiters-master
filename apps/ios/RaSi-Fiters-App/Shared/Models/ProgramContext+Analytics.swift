import Foundation

/// The Summary analytics reads (polish #30: the tab tracks which parts it has for the program on screen).
nonisolated enum SummaryPart: Hashable {
    case mtd, workouts, duration, average, timeline, distribution, types
}

extension ProgramContext {
    // MARK: - Analytics

    /// Summary tab (board §6 item 5 + D-9): the 7 analytics loads + the program list in PARALLEL, cache-only when
    /// `read == .cacheOnly`. Every analytics load that succeeded is applied (amendment A13: partial failures keep the
    /// parts that loaded). Returns WHICH parts applied (polish #30) + the first analytics failure (the tab goes stale /
    /// failed — frontend-kit §5); throws only when superseded.
    /// D1 (programs SPEC §9 D-C6): the Program Progress ring reads the open program's `/programs` row (ProgramContext
    /// `serverProgress`), so this re-reads the list — best-effort: a failed read keeps the last row and never fails the
    /// tab. `/analytics/summary` is no longer read (S-9: no 7-day distribution fallback). `period` is kept for the
    /// caller's load key.
    @MainActor
    func loadSummary(period: String, timelinePeriod: String,
                     read: APIClient.LaunchRead) async throws -> (applied: Set<SummaryPart>, failure: Error?) {
        guard let pid = programId else { throw AppError(kind: .notFound) }
        let api = APIClient.shared
        let token = authToken ?? ""
        async let programsCall = api.fetchPrograms(token: token, read: read)
        async let mtdCall = api.fetchMTDParticipation(token: token, programId: pid, read: read)
        async let workoutsCall = api.fetchTotalWorkoutsMTD(token: token, programId: pid, read: read)
        async let durationCall = api.fetchTotalDurationMTD(token: token, programId: pid, read: read)
        async let averageCall = api.fetchAvgDurationMTD(token: token, programId: pid, read: read)
        async let timelineCall = api.fetchActivityTimeline(token: token, period: timelinePeriod, programId: pid, read: read)
        async let distributionCall = api.fetchDistributionByDay(token: token, programId: pid, read: read)
        async let typesCall = api.fetchWorkoutTypes(token: token, programId: pid, read: read)
        var failure: Error?
        var mtd: APIClient.MTDParticipationDTO?
        var workouts: APIClient.TotalWorkoutsMTDDTO?
        var duration: APIClient.TotalDurationMTDDTO?
        var average: APIClient.AvgDurationMTDDTO?
        var timeline: APIClient.ActivityTimelineResponse?
        var distribution: APIClient.DistributionByDayDTO?
        var types: [APIClient.WorkoutTypeDTO]?
        let programRows = try? await programsCall
        do { mtd = try await mtdCall } catch { failure = failure ?? error }
        do { workouts = try await workoutsCall } catch { failure = failure ?? error }
        do { duration = try await durationCall } catch { failure = failure ?? error }
        do { average = try await averageCall } catch { failure = failure ?? error }
        do { timeline = try await timelineCall } catch { failure = failure ?? error }
        do { distribution = try await distributionCall } catch { failure = failure ?? error }
        do { types = try await typesCall } catch { failure = failure ?? error }
        try Task.checkCancellation()                     // superseded by a newer .task(id:) — never apply late results
        guard programId == pid else { throw CancellationError() }   // the program changed meanwhile
        if let programRows {
            switch read {
            case .network: programs = programRows
            case .cacheOnly: if programs.isEmpty { programs = programRows }   // a cached list never replaces a newer one
            }
        }
        if let row = programs.first(where: { $0.id == pid }), let count = row.active_members {
            activeMembers = count   // the Program-tab "Members" row (D3) follows the re-read row, as on web + Android
        }
        if let mtd { mtdParticipation = mtd }
        if let workouts { totalWorkoutsMTD = workouts.total_workouts; totalWorkoutsChangePct = workouts.change_pct }
        if let duration {
            // A7 (parity): hours to one decimal, half-up on whole tenths — round(minutes / 6) / 10 (web + Android same).
            totalDurationHoursMTD = (Double(duration.total_minutes) / 6.0).rounded() / 10.0
            totalDurationChangePct = duration.change_pct
        }
        if let average { avgDurationMinutesMTD = average.avg_minutes; avgDurationChangePctMTD = average.change_pct }
        if let timeline {
            activityTimeline = timeline.buckets
            activityTimelineLabel = timeline.label
            activityTimelineDailyAverage = timeline.daily_average
        }
        if let d = distribution {
            distributionByDayCounts = ["Sunday": d.Sunday, "Monday": d.Monday, "Tuesday": d.Tuesday, "Wednesday": d.Wednesday,
                                       "Thursday": d.Thursday, "Friday": d.Friday, "Saturday": d.Saturday]
        }
        if let types { workoutTypes = types }
        var applied: Set<SummaryPart> = []
        if mtd != nil { applied.insert(.mtd) }
        if workouts != nil { applied.insert(.workouts) }
        if duration != nil { applied.insert(.duration) }
        if average != nil { applied.insert(.average) }
        if timeline != nil { applied.insert(.timeline) }
        if distribution != nil { applied.insert(.distribution) }
        if types != nil { applied.insert(.types) }
        return (applied, failure)
    }
}
