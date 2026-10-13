import Foundation

extension ProgramContext {
    // MARK: - Members & Membership

    private static func dateFromString(_ s: String) -> Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.date(from: s)
    }

    @MainActor
    func loadLookupData() async {
        guard let token = authToken, !token.isEmpty else { 
            return 
        }
        do {
            let membersData: [APIClient.MemberDTO]
            if let pid = programId {
                membersData = try await APIClient.shared.fetchProgramMembers(token: token, programId: pid)
            } else {
                membersData = try await APIClient.shared.fetchMembers(token: token)
            }
            let workoutsData = try await APIClient.shared.fetchWorkouts(token: token)
            let programsData = try await APIClient.shared.fetchPrograms(token: token)
            members = membersData
            membersProgramId = programId
            workouts = workoutsData
            programs = programsData
            if let pid = programId, let updated = programsData.first(where: { $0.id == pid }) {
                apply(program: updated)
                persistSession()
            } else if programId != nil {
                programId = nil
                name = ""
                status = ""
                loggedInUserProgramRole = "member"
                membershipDetails = []
                persistSession()
            }
        } catch {
            // Do not fail hard; surface error message
            if let message = AppError(error)?.message { errorMessage = message }
        }
    }

    /// nil when it loaded; else the failure (cancellation → nil). polish #32 (S5).
    @discardableResult
    @MainActor
    func loadMemberMetrics(
        search: String = "",
        sort: String = "workouts",
        direction: String = "desc",
        filters: [String: String] = [:],
        dateRange: (start: Date?, end: Date?) = (nil, nil)
    ) async -> AppError? {
        guard let token = authToken, !token.isEmpty else { return nil }
        guard let pid = programId else {
            errorMessage = "No program selected for member metrics."
            return AppError(kind: .unknown)
        }
        do {
            let resp = try await APIClient.shared.fetchMemberMetrics(
                token: token,
                programId: pid,
                search: search,
                sort: sort,
                direction: direction,
                filters: filters
            )
            memberMetrics = resp.members
            memberMetricsTotal = resp.total
            memberMetricsFiltered = resp.filtered
            memberMetricsSort = resp.sort
            memberMetricsDirection = resp.direction
            if let dr = resp.date_range {
                memberMetricsRangeStart = dr.start.flatMap { Self.dateFromString($0) }
                memberMetricsRangeEnd = dr.end.flatMap { Self.dateFromString($0) }
            } else {
                memberMetricsRangeStart = dateRange.start
                memberMetricsRangeEnd = dateRange.end
            }
            return nil
        } catch {
            let appError = AppError(error)
            if let message = appError?.message { errorMessage = message }
            return appError
        }
    }

    /// nil when it loaded; else the failure (cancellation → nil). polish #32 (S5). `ownedWrite` = a Members-card owner's
    /// own load (loadMemberCards); any other write clears the owner token (the card-owner rule).
    @discardableResult
    @MainActor
    func loadMemberOverview(
        memberId: String,
        filters: [String: String] = [:],
        dateRange: (start: Date?, end: Date?) = (nil, nil),
        ownedWrite: Bool = false
    ) async -> AppError? {
        guard let token = authToken, !token.isEmpty else { return nil }
        guard let pid = programId else {
            errorMessage = "No program selected for member metrics."
            return AppError(kind: .unknown)
        }
        do {
            let resp = try await APIClient.shared.fetchMemberMetrics(
                token: token,
                programId: pid,
                search: nil,
                sort: nil,
                direction: nil,
                memberId: memberId,
                filters: filters
            )
            if !ownedWrite { memberCardsOwner = nil }
            selectedMemberOverview = resp.members.first
            if let dr = resp.date_range {
                memberMetricsRangeStart = dr.start.flatMap { Self.dateFromString($0) }
                memberMetricsRangeEnd = dr.end.flatMap { Self.dateFromString($0) }
            } else {
                memberMetricsRangeStart = dateRange.start
                memberMetricsRangeEnd = dateRange.end
            }
            return nil
        } catch {
            let appError = AppError(error)
            if let message = appError?.message { errorMessage = message }
            return appError
        }
    }

    /// nil when it loaded; else the failure (cancellation → nil). polish #32 (S5); `ownedWrite` as loadMemberOverview.
    @discardableResult
    @MainActor
    func loadMemberHistory(memberId: String, period: String, ownedWrite: Bool = false) async -> AppError? {
        guard let token = authToken, !token.isEmpty else { return nil }
        guard let pid = programId else {
            errorMessage = "No program selected for member history."
            return AppError(kind: .unknown)
        }
        do {
            let resp = try await APIClient.shared.fetchMemberHistory(
                token: token,
                programId: pid,
                memberId: memberId,
                period: period
            )
            if !ownedWrite { memberCardsOwner = nil }
            memberHistory = resp.buckets
            memberHistoryMemberId = memberId
            memberHistoryLabel = resp.label
            memberHistoryDailyAverage = resp.daily_average
            memberHistoryStartDate = Self.dateFromString(resp.start) ?? Date()
            memberHistoryEndDate = Self.dateFromString(resp.end) ?? Date()
            return nil
        } catch {
            let appError = AppError(error)
            if let message = appError?.message { errorMessage = message }
            return appError
        }
    }

    /// nil when it loaded; else the failure (cancellation → nil). polish #32 (S5); `ownedWrite` as loadMemberOverview.
    @discardableResult
    @MainActor
    func loadMemberStreaks(memberId: String, ownedWrite: Bool = false) async -> AppError? {
        guard let token = authToken, !token.isEmpty else { return nil }
        guard let pid = programId else {
            errorMessage = "No program selected for member streaks."
            return AppError(kind: .unknown)
        }
        do {
            let resp = try await APIClient.shared.fetchMemberStreaks(
                token: token,
                programId: pid,
                memberId: memberId
            )
            if !ownedWrite { memberCardsOwner = nil }
            memberStreaks = resp
            memberStreaksMemberId = memberId
            return nil
        } catch {
            let appError = AppError(error)
            if let message = appError?.message { errorMessage = message }
            return appError
        }
    }

    /// nil when it loaded; else the failure (cancellation → nil). polish #32 (S5); `ownedWrite` as loadMemberOverview.
    @discardableResult
    @MainActor
    func loadMemberRecent(
        memberId: String,
        limit: Int = 1000,
        startDate: String? = nil,
        endDate: String? = nil,
        sortBy: String? = nil,
        sortDir: String? = nil,
        workoutType: String? = nil,
        minDuration: Int? = nil,
        maxDuration: Int? = nil,
        ownedWrite: Bool = false
    ) async -> AppError? {
        guard let token = authToken, !token.isEmpty else { return nil }
        guard let pid = programId else {
            errorMessage = "No program selected for member recent."
            return AppError(kind: .unknown)
        }
        do {
            let resp = try await APIClient.shared.fetchMemberRecentWorkouts(
                token: token,
                programId: pid,
                memberId: memberId,
                limit: limit,
                startDate: startDate,
                endDate: endDate,
                sortBy: sortBy,
                sortDir: sortDir,
                workoutType: workoutType,
                minDuration: minDuration,
                maxDuration: maxDuration
            )
            if !ownedWrite { memberCardsOwner = nil }
            memberRecent = resp.items
            memberRecentMemberId = memberId
            return nil
        } catch {
            let appError = AppError(error)
            if let message = appError?.message { errorMessage = message }
            return appError
        }
    }

    /// polish #32 (people S5): the four Members-card reads in parallel (polish #5) — each card's outcome + the first
    /// failure. A cancelled read reports nil (callers check `Task.isCancelled`). The caller owns the cards
    /// (`memberCardsOwner`), so these writes keep the owner token.
    @MainActor
    func loadMemberCards(memberId: String, recentMemberId: String? = nil) async -> (cards: MemberCardsState, error: AppError?) {
        async let overview = loadMemberOverview(memberId: memberId, ownedWrite: true)
        async let history = loadMemberHistory(memberId: memberId, period: "week", ownedWrite: true)
        async let streaks = loadMemberStreaks(memberId: memberId, ownedWrite: true)
        async let recent = loadMemberRecent(memberId: recentMemberId ?? memberId, limit: 10, ownedWrite: true)
        let errors = await [overview, history, streaks, recent]
        let state: (AppError?) -> MemberCardState = { $0 == nil ? .loaded : .failed }
        return (MemberCardsState(overview: state(errors[0]), history: state(errors[1]),
                                 streaks: state(errors[2]), recent: state(errors[3])),
                errors.compactMap { $0 }.first)
    }

    /// Loads a member's daily-health logs (steps-aware). Keeps the published `memberHealthLogs`
    /// (legacy shape, no steps) refreshed for its existing consumers AND returns the full
    /// steps-bearing items for callers that render steps (`[]` on failure).
    @discardableResult
    @MainActor
    func loadMemberHealthLogs(
        memberId: String,
        limit: Int = 1000,
        startDate: String? = nil,
        endDate: String? = nil,
        sortBy: String? = nil,
        sortDir: String? = nil,
        minSleepHours: Double? = nil,
        maxSleepHours: Double? = nil,
        minFoodQuality: Int? = nil,
        maxFoodQuality: Int? = nil,
        minSteps: Int? = nil,
        maxSteps: Int? = nil
    ) async -> [APIClient.DailyHealthLogItem] {
        guard let token = authToken, !token.isEmpty else { return [] }
        guard let pid = programId else {
            errorMessage = "No program selected for daily health logs."
            return []
        }
        do {
            let resp = try await APIClient.shared.fetchDailyHealthLogs(
                token: token,
                programId: pid,
                memberId: memberId,
                limit: limit,
                startDate: startDate,
                endDate: endDate,
                sortBy: sortBy,
                sortDir: sortDir,
                minSleepHours: minSleepHours,
                maxSleepHours: maxSleepHours,
                minFoodQuality: minFoodQuality,
                maxFoodQuality: maxFoodQuality,
                minSteps: minSteps,
                maxSteps: maxSteps
            )
            memberHealthLogs = resp.items.map {
                .init(id: $0.id, logDate: $0.logDate, sleepHours: $0.sleepHours, foodQuality: $0.foodQuality)
            }
            return resp.items
        } catch {
            if let message = AppError(error)?.message { errorMessage = message }
            return []
        }
    }

    /// `true` when this program's details loaded (PersonProfileView's Edit membership waits for it); others ignore it.
    @discardableResult
    @MainActor
    func loadMembershipDetails() async -> Bool {
        guard let token = authToken, !token.isEmpty else { 
            return false
        }
        guard let pid = programId else {
            errorMessage = "No program selected for membership details."
            return false
        }
        do {
            let data = try await APIClient.shared.fetchMembershipDetails(token: token, programId: pid)
            let activeData = data.filter { $0.is_active }
            membershipDetails = activeData

            // Update logged-in user's program role
            if let userId = loggedInUserId,
               let myMembership = activeData.first(where: { $0.member_id == userId }) {
                loggedInUserProgramRole = myMembership.program_role
                loggedInUserGender = myMembership.gender
                persistSession()
            }
            return true
        } catch {
            if let message = AppError(error)?.message { errorMessage = message }
            return false
        }
    }

    @MainActor
    func updateMembership(memberId: String, role: String?, isActive: Bool?, joinedAt: Date?) async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }
        guard let pid = programId else {
            throw APIError(message: "No program selected")
        }

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let joinedStr = joinedAt.map { formatter.string(from: $0) }

        _ = try await APIClient.shared.updateMembership(
            token: token,
            programId: pid,
            memberId: memberId,
            role: role,
            status: nil,
            isActive: isActive,
            joinedAt: joinedStr
        )

        // Refresh membership details
        await loadMembershipDetails()
        await loadLookupData()
    }

    @MainActor
    func removeMember(memberId: String) async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }
        guard let pid = programId else {
            throw APIError(message: "No program selected")
        }

        try await APIClient.shared.removeMemberFromProgram(token: token, programId: pid, memberId: memberId)

        // Refresh data
        await loadMembershipDetails()
        await loadLookupData()
    }

    @MainActor
    func updateMembershipStatus(programId: String, status: String) async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }
        guard let memberId = loggedInUserId else {
            throw APIError(message: "No member selected")
        }

        _ = try await APIClient.shared.updateMembership(
            token: token,
            programId: programId,
            memberId: memberId,
            role: nil,
            status: status,
            isActive: nil,
            joinedAt: nil
        )
    }

    @MainActor
    func updateMemberProfile(memberId: String, firstName: String?, lastName: String?, gender: String?) async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }

        _ = try await APIClient.shared.updateMemberProfile(
            token: token,
            memberId: memberId,
            firstName: firstName,
            lastName: lastName,
            gender: gender
        )

        // Update local state if this is the logged-in user
        if memberId == loggedInUserId {
            if let first = firstName, let last = lastName {
                loggedInUserName = "\(first) \(last)".trimmingCharacters(in: .whitespaces)
            } else if let first = firstName {
                let currentLast = loggedInUserName?.split(separator: " ").dropFirst().joined(separator: " ") ?? ""
                loggedInUserName = "\(first) \(currentLast)".trimmingCharacters(in: .whitespaces)
            } else if let last = lastName {
                let currentFirst = loggedInUserName?.split(separator: " ").first.map(String.init) ?? ""
                loggedInUserName = "\(currentFirst) \(last)".trimmingCharacters(in: .whitespaces)
            }
            loggedInUserGender = gender
            if let index = membershipDetails.firstIndex(where: { $0.member_id == memberId }) {
                let current = membershipDetails[index]
                let updatedName = loggedInUserName ?? current.member_name
                membershipDetails[index] = APIClient.MembershipDetailDTO(
                    member_id: current.member_id,
                    member_name: updatedName,
                    username: current.username,
                    gender: loggedInUserGender,
                    date_of_birth: current.date_of_birth,
                    date_joined: current.date_joined,
                    global_role: current.global_role,
                    program_role: current.program_role,
                    is_active: current.is_active,
                    status: current.status,
                    joined_at: current.joined_at
                )
            }
            persistSession()
        }
    }
}
