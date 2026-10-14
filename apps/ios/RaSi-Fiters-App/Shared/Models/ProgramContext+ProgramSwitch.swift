import Foundation

extension ProgramContext {
    /// Polish #10 / #30 (the keyed-state rule): a program switch clears every program-scoped value a tab shows, so no
    /// screen renders the previous program's numbers under the new name — while its own load runs, or for good when
    /// offline. Called by ProgramPickerView.applyProgram, only when the program actually changes. (The Lifestyle tab and
    /// the detail screens keep their own keyed state — nothing shared to clear.)
    @MainActor
    func resetProgramScopedData() {
        // Members tab: the selected member's cards + the metrics preview. The card-owner token and the render-time
        // identity tags go too, so a cleared card renders its placeholder (never "loaded" and empty) until reloaded.
        memberCardsOwner = nil
        selectedMemberOverview = nil
        memberHistory = []
        memberHistoryMemberId = nil
        memberHistoryLabel = ""
        memberHistoryDailyAverage = 0
        memberStreaks = nil
        memberStreaksMemberId = nil
        memberRecent = []
        memberRecentMemberId = nil
        memberHealthLogs = []
        memberMetrics = []
        memberMetricsTotal = 0
        memberMetricsFiltered = 0
        memberMetricsRangeStart = nil
        memberMetricsRangeEnd = nil
        // The roster + roles (member management, role management) — reloaded by applyProgram.
        membershipDetails = []
        // Summary: every field loadSummary writes
        totalLogsThisPeriod = 0
        totalWorkouts = 0
        totalDurationHours = 0
        averageDurationMinutes = 0
        logsChangePct = 0
        durationChangePct = 0
        avgDurationChangePct = 0
        atRiskMembers = 0
        timelinePoints = []
        distributionByDay = [:]
        distributionByDayCounts = [:]
        topPerformers = []
        topWorkoutTypes = []
        lastFetchedPeriod = nil
        mtdParticipation = nil
        totalWorkoutsMTD = 0
        totalWorkoutsChangePct = 0
        totalDurationHoursMTD = 0
        totalDurationChangePct = 0
        avgDurationMinutesMTD = 0
        avgDurationChangePctMTD = 0
        activityTimeline = []
        activityTimelineLabel = ""
        activityTimelineDailyAverage = 0
        workoutTypes = []
        // The program's workout-type list (Add workouts' picker, the Workout Types screen)
        programWorkouts = []
    }
}
