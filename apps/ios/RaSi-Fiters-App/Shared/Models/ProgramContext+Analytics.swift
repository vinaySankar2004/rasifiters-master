import Foundation

/// The Summary reads (polish #30: the tab tracks which parts it has for the program on screen).
nonisolated enum SummaryPart: Hashable {
    case summary, mtd, workouts, duration, average, timeline, distribution, types
}

extension ProgramContext {
    // MARK: - Analytics

    /// Summary tab (board §6 item 5 + D-9): the 8 loads in PARALLEL, cache-only when `read == .cacheOnly`. Every load
    /// that succeeded is applied (amendment A13: partial failures keep the parts that loaded). Returns WHICH parts
    /// applied (polish #30) + the first failure (the tab goes stale / failed — frontend-kit §5); throws only when
    /// superseded.
    @MainActor
    func loadSummary(period: String, timelinePeriod: String,
                     read: APIClient.LaunchRead) async throws -> (applied: Set<SummaryPart>, failure: Error?) {
        guard let pid = programId else { throw AppError(kind: .notFound) }
        let api = APIClient.shared
        let token = authToken ?? ""
        async let summaryCall = api.fetchAnalyticsSummary(token: token, period: period, programId: pid, read: read)
        async let mtdCall = api.fetchMTDParticipation(token: token, programId: pid, read: read)
        async let workoutsCall = api.fetchTotalWorkoutsMTD(token: token, programId: pid, read: read)
        async let durationCall = api.fetchTotalDurationMTD(token: token, programId: pid, read: read)
        async let averageCall = api.fetchAvgDurationMTD(token: token, programId: pid, read: read)
        async let timelineCall = api.fetchActivityTimeline(token: token, period: timelinePeriod, programId: pid, read: read)
        async let distributionCall = api.fetchDistributionByDay(token: token, programId: pid, read: read)
        async let typesCall = api.fetchWorkoutTypes(token: token, programId: pid, read: read)
        var failure: Error?
        var summary: AnalyticsSummary?
        var mtd: APIClient.MTDParticipationDTO?
        var workouts: APIClient.TotalWorkoutsMTDDTO?
        var duration: APIClient.TotalDurationMTDDTO?
        var average: APIClient.AvgDurationMTDDTO?
        var timeline: APIClient.ActivityTimelineResponse?
        var distribution: APIClient.DistributionByDayDTO?
        var types: [APIClient.WorkoutTypeDTO]?
        do { summary = try await summaryCall } catch { failure = failure ?? error }
        do { mtd = try await mtdCall } catch { failure = failure ?? error }
        do { workouts = try await workoutsCall } catch { failure = failure ?? error }
        do { duration = try await durationCall } catch { failure = failure ?? error }
        do { average = try await averageCall } catch { failure = failure ?? error }
        do { timeline = try await timelineCall } catch { failure = failure ?? error }
        do { distribution = try await distributionCall } catch { failure = failure ?? error }
        do { types = try await typesCall } catch { failure = failure ?? error }
        try Task.checkCancellation()                     // superseded by a newer .task(id:) — never apply late results
        guard programId == pid else { throw CancellationError() }   // the program changed meanwhile
        if let s = summary {
            totalLogsThisPeriod = s.totals.logs
            totalWorkouts = s.totals.logs
            totalDurationHours = Int(round(Double(s.totals.duration_minutes) / 60.0))
            averageDurationMinutes = s.totals.avg_duration_minutes
            logsChangePct = s.totals.logs_change_pct
            durationChangePct = s.totals.duration_change_pct
            avgDurationChangePct = s.totals.avg_duration_change_pct
            atRiskMembers = s.members.at_risk
            timelinePoints = s.timeline
            distributionByDay = s.distribution_by_day
            topPerformers = s.top_performers
            topWorkoutTypes = s.top_workout_types
            lastFetchedPeriod = period
            distributionByDayCounts = s.distribution_by_day.mapValues { $0.workouts }
        }
        if let mtd { mtdParticipation = mtd }
        if let workouts { totalWorkoutsMTD = workouts.total_workouts; totalWorkoutsChangePct = workouts.change_pct }
        if let duration {
            totalDurationHoursMTD = ((Double(duration.total_minutes) / 60.0) * 10).rounded() / 10.0
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
        if summary != nil { applied.insert(.summary) }
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
