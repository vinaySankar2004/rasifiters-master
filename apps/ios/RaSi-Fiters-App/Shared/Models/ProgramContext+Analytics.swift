import Foundation

extension ProgramContext {
    // MARK: - Analytics

    @MainActor
    func loadAnalytics(period: String) async {
        guard let token = authToken, !token.isEmpty else {
            errorMessage = "No auth token set. Log in to load analytics."
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            let summary = try await APIClient.shared.fetchAnalyticsSummary(token: token, period: period, programId: programId)
            totalLogsThisPeriod = summary.totals.logs
            totalWorkouts = summary.totals.logs
            totalDurationHours = Int(round(Double(summary.totals.duration_minutes) / 60.0))
            averageDurationMinutes = summary.totals.avg_duration_minutes
            logsChangePct = summary.totals.logs_change_pct
            durationChangePct = summary.totals.duration_change_pct
            avgDurationChangePct = summary.totals.avg_duration_change_pct
            atRiskMembers = summary.members.at_risk
            timelinePoints = summary.timeline
            distributionByDay = summary.distribution_by_day
            topPerformers = summary.top_performers
            topWorkoutTypes = summary.top_workout_types
            lastFetchedPeriod = period
            distributionByDayCounts = summary.distribution_by_day.mapValues { $0.workouts }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    @MainActor
    func loadDistributionByDay() async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for distribution."
            return
        }
        do {
            let data = try await APIClient.shared.fetchDistributionByDay(token: token, programId: pid)
            distributionByDayCounts = [
                "Sunday": data.Sunday,
                "Monday": data.Monday,
                "Tuesday": data.Tuesday,
                "Wednesday": data.Wednesday,
                "Thursday": data.Thursday,
                "Friday": data.Friday,
                "Saturday": data.Saturday
            ]
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func loadMTDParticipation() async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for MTD participation."
            return
        }
        do {
            let data = try await APIClient.shared.fetchMTDParticipation(token: token, programId: pid)
            mtdParticipation = data
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func loadTotalWorkoutsMTD() async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for total workouts."
            return
        }
        do {
            let data = try await APIClient.shared.fetchTotalWorkoutsMTD(token: token, programId: pid)
            totalWorkoutsMTD = data.total_workouts
            totalWorkoutsChangePct = data.change_pct
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func loadTotalDurationMTD() async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for total duration."
            return
        }
        do {
            let data = try await APIClient.shared.fetchTotalDurationMTD(token: token, programId: pid)
            let hours = Double(data.total_minutes) / 60.0
            totalDurationHoursMTD = (hours * 10).rounded() / 10.0
            totalDurationChangePct = data.change_pct
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func loadAvgDurationMTD() async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for avg duration."
            return
        }
        do {
            let data = try await APIClient.shared.fetchAvgDurationMTD(token: token, programId: pid)
            avgDurationMinutesMTD = data.avg_minutes
            avgDurationChangePctMTD = data.change_pct
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func loadActivityTimeline(period: String) async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for activity timeline."
            return
        }
        do {
            let resp = try await APIClient.shared.fetchActivityTimeline(token: token, period: period, programId: pid)
            activityTimeline = resp.buckets
            activityTimelineLabel = resp.label
            activityTimelineDailyAverage = resp.daily_average
            errorMessage = nil  // Clear error on success
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func loadHealthTimeline(period: String, memberId: String? = nil) async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for health timeline."
            return
        }
        do {
            let resp = try await APIClient.shared.fetchHealthTimeline(
                token: token,
                period: period,
                programId: pid,
                memberId: memberId
            )
            healthTimeline = resp.buckets
            healthTimelineDailyAverageSleep = resp.daily_average_sleep
            healthTimelineDailyAverageFood = resp.daily_average_food
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func loadWorkoutTypes(memberId: String? = nil, limit: Int = 100) async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for workout types."
            return
        }
        do {
            let data = try await APIClient.shared.fetchWorkoutTypes(token: token, programId: pid, memberId: memberId, limit: limit)
            workoutTypes = data
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func loadWorkoutTypesTotal(memberId: String? = nil) async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for workout types total."
            return
        }
        do {
            let data = try await APIClient.shared.fetchWorkoutTypesTotal(token: token, programId: pid, memberId: memberId)
            workoutTypesTotal = data.total_types
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func loadWorkoutTypeMostPopular(memberId: String? = nil) async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for most popular workout type."
            return
        }
        do {
            let data = try await APIClient.shared.fetchWorkoutTypeMostPopular(token: token, programId: pid, memberId: memberId)
            workoutTypeMostPopular = data
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func loadWorkoutTypeLongestDuration(memberId: String? = nil) async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for longest duration workout type."
            return
        }
        do {
            let data = try await APIClient.shared.fetchWorkoutTypeLongestDuration(token: token, programId: pid, memberId: memberId)
            workoutTypeLongestDuration = data
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func loadWorkoutTypeHighestParticipation(memberId: String? = nil) async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for highest participation workout type."
            return
        }
        do {
            let data = try await APIClient.shared.fetchWorkoutTypeHighestParticipation(token: token, programId: pid, memberId: memberId)
            workoutTypeHighestParticipation = data
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
