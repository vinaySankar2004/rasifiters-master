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
    /// UI mirror of `SessionStore` (the ONE token store) — written only from the store (restore / sign-in / refresh
    /// hook / teardown). APIClient reads the token at send time, so a stale mirror is harmless.
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
    @Published var healthTimelineDailyAverageSteps: Double = 0
    @Published var stepsStats: APIClient.StepsStatsDTO?
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
    /// Active program's `admin_only_data_entry` flag (web parity: drives the Summary data-lock banner + disabled log cards).
    @Published var adminOnlyDataEntry: Bool = false
    /// Bumped by the log-workout / log-health forms on a successful save; the Summary tab observes it to
    /// reload its analytics — the iOS analogue of web's `invalidateQueries(["summary"])` (run 60, D-C3).
    @Published var summaryRefreshToken: Int = 0
    @Published var selectedMemberOverview: APIClient.MemberMetricsDTO?
    @Published var memberHistory: [APIClient.MemberHistoryPoint] = []
    @Published var memberHistoryLabel: String = ""
    @Published var memberHistoryDailyAverage: Double = 0
    @Published var memberHistoryStartDate: Date = Date()
    @Published var memberHistoryEndDate: Date = Date()
    @Published var memberStreaks: APIClient.MemberStreaksResponse?
    @Published var memberRecent: [APIClient.MemberRecentWorkoutsResponse.Item] = []
    /// The member each shared Members-card value belongs to, set by its loader on every write. A card renders data only
    /// when the tag equals its own member (render-time identity — never another member's numbers, whatever the timing).
    @Published var memberHistoryMemberId: String?
    @Published var memberStreaksMemberId: String?
    @Published var memberRecentMemberId: String?
    @Published var memberHealthLogs: [APIClient.MemberHealthLogResponse.Item] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var isUpdateRequired: Bool = false
    @Published var minimumSupportedVersion: String?
    /// app-config soft nudge: the `latest_ios_version` this build is behind (nil = no banner; D-KIT-9).
    @Published var updateAvailableVersion: String?
    @Published var isOnline = true          // mirror of NetworkMonitor (frontend-kit §5, one monitor per app)
    
    // Logged-in user info
    @Published var loggedInUserId: String?
    @Published var loggedInUserName: String?
    @Published var loggedInUsername: String?
    @Published var loggedInUserGender: String?
    @Published var loggedInUserProgramRole: String = "member"
    
    // Membership details for program management
    @Published var membershipDetails: [APIClient.MembershipDetailDTO] = []
    
    // Pending program invites (the Inbox's first section — notifications D-N4)
    @Published var pendingInvites: [APIClient.PendingInviteDTO] = []

    // Notifications inbox (D-N3 / D-N4; logic in ProgramContext+Inbox.swift)
    /// Server counts (contract C4) — nil until GET /inbox/unread-count first answers (the "+" badge then falls back).
    @Published var inboxCounts: APIClient.InboxCountsDTO?
    /// The floating toast's item (D-N3) — the newest live item whose category is switched on.
    @Published var toastItem: APIClient.NotificationDTO?
    /// Bumped by every live item / foreground push / catch-up — a VISIBLE InboxView reloads (and marks it read).
    @Published var inboxRevision = 0
    /// Cached GET /notifications/preferences — gates the toast (C7.5) and seeds the settings screen.
    @Published var notificationPreferences: APIClient.NotificationPreferencesDTO?
    /// A target only the program picker can open (contract C2 targets; supersedes U2's invite-only flag).
    @Published var inboxRoute: InboxTarget?
    /// The root Inbox sheet (NotificationToast.swift) — an `inbox` / `invites` target over whatever is on screen.
    @Published var showInboxSheet = false
    /// "Who can see your activity" (people U-1 b), presented from AppRootView (ActivityVisibilityNotice.swift).
    @Published var showActivityVisibilityNotice = false
    @Published var widgetRoute: WidgetRoute?
    @Published var returnToMyPrograms: Bool = false

    // Apple Health (HealthKit) auto-sync — see ProgramContext+HealthKit.swift
    @Published var isHealthKitEnabled: Bool = false
    @Published var healthKitSyncProgramIds: Set<String> = []
    @Published var lastHealthKitSyncDate: Date?
    @Published var lastHealthKitSyncCount: Int = 0
    @Published var lastHealthKitSyncFailed: Bool = false

    // Apple Health (HealthKit) SLEEP auto-sync — independent toggle; see ProgramContext+HealthKitSleep.swift
    @Published var isSleepSyncEnabled: Bool = false
    @Published var sleepSyncProgramIds: Set<String> = []
    @Published var lastSleepSyncDate: Date?
    @Published var lastSleepSyncCount: Int = 0
    @Published var lastSleepSyncFailed: Bool = false

    // Apple Health (HealthKit) STEPS auto-sync — independent toggle; see ProgramContext+HealthKitSteps.swift
    @Published var isStepsSyncEnabled: Bool = false
    @Published var stepsSyncProgramIds: Set<String> = []
    @Published var lastStepsSyncDate: Date?
    @Published var lastStepsSyncCount: Int = 0
    @Published var lastStepsSyncFailed: Bool = false

    // First-time Apple Health sync confirmation — see PendingSyncConfirmation + ProgramContext+HealthSyncGating.
    // `pendingSyncConfirmation` is the flow currently presented (globally, from AppRootView); a sleep flow
    // computed while workouts are showing waits in `deferredSleepConfirmation` (workouts get priority).
    @Published var pendingSyncConfirmation: PendingSyncConfirmation?
    var deferredSleepConfirmation: PendingSyncConfirmation?
    var deferredStepsConfirmation: PendingSyncConfirmation?

    var notificationStreamClient: NotificationStreamClient?
    var streamReconnectTask: Task<Void, Never>?
    var streamAttempt = 0
    /// The toast's 5-s auto-dismiss (ProgramContext+Inbox.swift).
    var toastDismissTask: Task<Void, Never>?
    /// InboxViews on screen right now — no toast and no root Inbox sheet while one is visible (the toast rule).
    var visibleInboxCount = 0
    /// The catch-up rule's 5-s guard (ProgramContext+Inbox.catchUp).
    var lastCatchUpAt: Date?
    /// The visibility notice is owed but waits for a free root (no review / widget form / other presentation).
    var activityNoticeDeferred = false
    /// The quick-add workout form was opened by a `log_workout` target: closing it returns to the current screen (the
    /// program stays open) instead of My Programs.
    var widgetRouteFromNotification = false
    /// Who last loaded the shared Members-card state (selectedMemberOverview · memberHistory · memberStreaks ·
    /// memberRecent): `MemberCardsOwner.membersTab` or one MemberFullStatsView (its UUID); nil = an unowned write.
    /// A screen that finds another owner shows placeholders and reloads its own member — never another member's
    /// numbers. Not published: it must never re-render a screen by itself.
    var memberCardsOwner: String?
    var cancellables = Set<AnyCancellable>()

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
        observeSessionLifecycle()
        configureHealthSyncHooks()
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

    /// Web parity (`isDataEntryLocked`): the lock bites only non-admins when the program flag is on.
    var dataEntryLocked: Bool {
        adminOnlyDataEntry && !isProgramAdmin
    }

    /// Per-program data-entry lock, by id — the multi-program analogue of `dataEntryLocked`, used by
    /// the batched log forms + widgets + Apple Health syncs. Locked iff the program's
    /// `admin_only_data_entry` is on AND the viewer is neither a global admin nor that program's admin.
    /// Fail-open when the program isn't loaded; the backend 403 (`requireDataEntryAllowed`) is the
    /// backstop. Used by the Apple Health syncs, which target many programs at once.
    func isDataEntryLocked(programId: String) -> Bool {
        programs.first(where: { $0.id == programId })?.isDataEntryLocked(globalAdmin: isGlobalAdmin) ?? false
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
