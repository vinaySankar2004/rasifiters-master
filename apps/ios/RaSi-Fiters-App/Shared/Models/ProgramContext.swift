import Foundation
import Combine

enum WidgetRoute: String, Identifiable {
    case quickAddWorkout
    case quickAddHealth

    var id: String { rawValue }

    init?(url: URL) {
        guard url.scheme == "rasifiters" else { return nil }
        switch url.host {
        case "quick-add-workout":
            self = .quickAddWorkout
        case "quick-add-health":
            self = .quickAddHealth
        default:
            return nil
        }
    }
}

/// Shared program context so all tabs and queries know the active program.
final class ProgramContext: ObservableObject {
    @Published var authToken: String?
    @Published var refreshToken: String? = nil
    @Published var name: String
    @Published var status: String
    @Published var startDate: Date
    @Published var endDate: Date
    @Published var adminName: String
    @Published var activeMembers: Int
    @Published var atRiskMembers: Int
    @Published var totalLogsThisPeriod: Int
    @Published var totalWorkouts: Int
    @Published var totalDurationHours: Int
    @Published var averageDurationMinutes: Int
    @Published var logsChangePct: Double
    @Published var durationChangePct: Double
    @Published var avgDurationChangePct: Double
    @Published var timelinePoints: [AnalyticsSummary.TimelinePoint]
    @Published var distributionByDay: [String: AnalyticsSummary.DayDistribution]
    @Published var distributionByDayCounts: [String: Int]
    @Published var topPerformers: [AnalyticsSummary.TopPerformer]
    @Published var topWorkoutTypes: [AnalyticsSummary.TopWorkoutType]
    @Published var programId: String?
    @Published var programs: [APIClient.ProgramDTO]
    @Published var mtdParticipation: APIClient.MTDParticipationDTO?
    @Published var totalWorkoutsMTD: Int
    @Published var totalWorkoutsChangePct: Double
    @Published var totalDurationHoursMTD: Double
    @Published var totalDurationChangePct: Double
    @Published var avgDurationMinutesMTD: Int
    @Published var avgDurationChangePctMTD: Double
    @Published var activityTimeline: [APIClient.ActivityTimelinePoint]
    @Published var activityTimelineLabel: String
    @Published var activityTimelineDailyAverage: Double
    @Published var healthTimeline: [APIClient.HealthTimelinePoint]
    @Published var healthTimelineDailyAverageSleep: Double
    @Published var healthTimelineDailyAverageFood: Double
    @Published var workoutTypes: [APIClient.WorkoutTypeDTO]
    @Published var workoutTypesTotal: Int
    @Published var workoutTypeMostPopular: APIClient.WorkoutTypeMostPopularDTO?
    @Published var workoutTypeLongestDuration: APIClient.WorkoutTypeLongestDurationDTO?
    @Published var workoutTypeHighestParticipation: APIClient.WorkoutTypeHighestParticipationDTO?
    @Published var members: [APIClient.MemberDTO]
    @Published var membersProgramId: String?
    @Published var workouts: [APIClient.WorkoutDTO]
    @Published var programWorkouts: [APIClient.ProgramWorkoutDTO] = []
    @Published var lastFetchedPeriod: String?
    @Published var memberMetrics: [APIClient.MemberMetricsDTO] = []
    @Published var memberMetricsTotal: Int = 0
    @Published var memberMetricsFiltered: Int = 0
    @Published var memberMetricsSort: String = "workouts"
    @Published var memberMetricsDirection: String = "desc"
    @Published var memberMetricsRangeStart: Date?
    @Published var memberMetricsRangeEnd: Date?
    @Published var globalRole: String = "standard"
    @Published var selectedMemberOverview: APIClient.MemberMetricsDTO?
    @Published var memberHistory: [APIClient.MemberHistoryPoint] = []
    @Published var memberHistoryLabel: String = ""
    @Published var memberHistoryDailyAverage: Double = 0
    @Published var memberHistoryStartDate: Date = Date()
    @Published var memberHistoryEndDate: Date = Date()
    @Published var memberStreaks: APIClient.MemberStreaksResponse?
    @Published var memberRecent: [APIClient.MemberRecentWorkoutsResponse.Item] = []
    @Published var memberHealthLogs: [APIClient.MemberHealthLogResponse.Item] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var isUpdateRequired: Bool = false
    @Published var minimumSupportedVersion: String?
    @Published var isOffline: Bool = false
    @Published var offlineNotice: String?
    
    // Logged-in user info
    @Published var loggedInUserId: String?
    @Published var loggedInUserName: String?
    @Published var loggedInUsername: String?
    @Published var loggedInUserGender: String?
    @Published var loggedInUserProgramRole: String = "member"
    
    // Membership details for program management
    @Published var membershipDetails: [APIClient.MembershipDetailDTO] = []
    
    // Pending program invites
    @Published var pendingInvites: [APIClient.PendingInviteDTO] = []

    // Notifications (queued modals)
    @Published var notificationQueue: [APIClient.NotificationDTO] = []
    @Published var widgetRoute: WidgetRoute?
    @Published var returnToMyPrograms: Bool = false

    var notificationStreamClient: NotificationStreamClient?
    var notificationIds: Set<String> = []
    let notificationDateFormatter = ISO8601DateFormatter()

    init(
        authToken: String? = nil,
        name: String = "Program 1",
        status: String = "Active",
        startDate: Date = Date(timeIntervalSinceNow: -180 * 24 * 60 * 60),
        endDate: Date = Calendar.current.date(byAdding: .day, value: 180, to: Date()) ?? Date(),
        adminName: String = "Admin",
        activeMembers: Int = 35,
        atRiskMembers: Int = 2,
        totalLogsThisPeriod: Int = 0,
        totalWorkouts: Int = 0,
        totalDurationHours: Int = 0,
        averageDurationMinutes: Int = 0,
        logsChangePct: Double = 0,
        durationChangePct: Double = 0,
        avgDurationChangePct: Double = 0,
        timelinePoints: [AnalyticsSummary.TimelinePoint] = [],
        distributionByDay: [String: AnalyticsSummary.DayDistribution] = [:],
        distributionByDayCounts: [String: Int] = [:],
        topPerformers: [AnalyticsSummary.TopPerformer] = [],
        topWorkoutTypes: [AnalyticsSummary.TopWorkoutType] = [],
        programId: String? = nil,
        programs: [APIClient.ProgramDTO] = [],
        mtdParticipation: APIClient.MTDParticipationDTO? = nil,
        totalWorkoutsMTD: Int = 0,
        totalWorkoutsChangePct: Double = 0,
        totalDurationHoursMTD: Double = 0,
        totalDurationChangePct: Double = 0,
        avgDurationMinutesMTD: Int = 0,
        avgDurationChangePctMTD: Double = 0,
        activityTimeline: [APIClient.ActivityTimelinePoint] = [],
        activityTimelineLabel: String = "",
        activityTimelineDailyAverage: Double = 0,
        healthTimeline: [APIClient.HealthTimelinePoint] = [],
        healthTimelineDailyAverageSleep: Double = 0,
        healthTimelineDailyAverageFood: Double = 0,
        workoutTypes: [APIClient.WorkoutTypeDTO] = [],
        workoutTypesTotal: Int = 0,
        workoutTypeMostPopular: APIClient.WorkoutTypeMostPopularDTO? = nil,
        workoutTypeLongestDuration: APIClient.WorkoutTypeLongestDurationDTO? = nil,
        workoutTypeHighestParticipation: APIClient.WorkoutTypeHighestParticipationDTO? = nil,
        members: [APIClient.MemberDTO] = [],
        membersProgramId: String? = nil,
        workouts: [APIClient.WorkoutDTO] = [],
        lastFetchedPeriod: String? = nil,
        memberHistoryLabel: String = "",
        memberHistoryDailyAverage: Double = 0,
        memberHistoryStartDate: Date = Date(),
        memberHistoryEndDate: Date = Date(),
        isUpdateRequired: Bool = false,
        minimumSupportedVersion: String? = nil
    ) {
        self.authToken = authToken
        self.name = name
        self.status = status
        self.startDate = startDate
        self.endDate = endDate
        self.adminName = adminName
        self.activeMembers = activeMembers
        self.atRiskMembers = atRiskMembers
        self.totalLogsThisPeriod = totalLogsThisPeriod
        self.totalWorkouts = totalWorkouts
        self.totalDurationHours = totalDurationHours
        self.averageDurationMinutes = averageDurationMinutes
        self.logsChangePct = logsChangePct
        self.durationChangePct = durationChangePct
        self.avgDurationChangePct = avgDurationChangePct
        self.timelinePoints = timelinePoints
        self.distributionByDay = distributionByDay
        self.distributionByDayCounts = distributionByDayCounts
        self.topPerformers = topPerformers
        self.topWorkoutTypes = topWorkoutTypes
        self.programId = programId
        self.programs = programs
        self.mtdParticipation = mtdParticipation
        self.totalWorkoutsMTD = totalWorkoutsMTD
        self.totalWorkoutsChangePct = totalWorkoutsChangePct
        self.totalDurationHoursMTD = totalDurationHoursMTD
        self.totalDurationChangePct = totalDurationChangePct
        self.avgDurationMinutesMTD = avgDurationMinutesMTD
        self.avgDurationChangePctMTD = avgDurationChangePctMTD
        self.activityTimeline = activityTimeline
        self.activityTimelineLabel = activityTimelineLabel
        self.activityTimelineDailyAverage = activityTimelineDailyAverage
        self.healthTimeline = healthTimeline
        self.healthTimelineDailyAverageSleep = healthTimelineDailyAverageSleep
        self.healthTimelineDailyAverageFood = healthTimelineDailyAverageFood
        self.workoutTypes = workoutTypes
        self.workoutTypesTotal = workoutTypesTotal
        self.workoutTypeMostPopular = workoutTypeMostPopular
        self.workoutTypeLongestDuration = workoutTypeLongestDuration
        self.workoutTypeHighestParticipation = workoutTypeHighestParticipation
        self.members = members
        self.membersProgramId = membersProgramId
        self.workouts = workouts
        self.lastFetchedPeriod = lastFetchedPeriod
        self.memberHistoryLabel = memberHistoryLabel
        self.memberHistoryDailyAverage = memberHistoryDailyAverage
        self.memberHistoryStartDate = memberHistoryStartDate
        self.memberHistoryEndDate = memberHistoryEndDate
        self.isUpdateRequired = isUpdateRequired
        self.minimumSupportedVersion = minimumSupportedVersion

        restorePersistedSession()
        configureAPIClientHandlers()
    }

    // MARK: - Computed Properties

    var dateRangeLabel: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        let start = formatter.string(from: startDate)
        formatter.dateFormat = "MMM d, yyyy"
        let end = formatter.string(from: endDate)
        return "\(start) – \(end)"
    }

    var totalDays: Int {
        Calendar.current.dateComponents([.day], from: startDate, to: endDate).day ?? 0
    }

    var elapsedDays: Int {
        let today = Date()
        guard today > startDate else { return 0 }
        return min(Calendar.current.dateComponents([.day], from: startDate, to: today).day ?? 0, totalDays)
    }

    var remainingDays: Int {
        max(totalDays - elapsedDays, 0)
    }

    var completionPercent: Int {
        guard totalDays > 0 else { return 0 }
        return Int(round((Double(elapsedDays) / Double(totalDays)) * 100))
    }

    var adminInitials: String {
        adminName
            .split(separator: " ")
            .compactMap { $0.first }
            .prefix(2)
            .map { String($0).uppercased() }
            .joined()
    }

    // MARK: - Role & Permission Helpers

    var isGlobalAdmin: Bool {
        globalRole == "global_admin"
    }

    var isProgramAdmin: Bool {
        loggedInUserProgramRole == "admin" || isGlobalAdmin
    }

    var canEditProgramData: Bool {
        isProgramAdmin
    }

    var loggedInUserInitials: String {
        guard let name = loggedInUserName else { return "?" }
        return name
            .split(separator: " ")
            .compactMap { $0.first }
            .prefix(2)
            .map { String($0).uppercased() }
            .joined()
    }
}
