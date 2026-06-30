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
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func loadMemberMetrics(
        search: String = "",
        sort: String = "workouts",
        direction: String = "desc",
        filters: [String: String] = [:],
        dateRange: (start: Date?, end: Date?) = (nil, nil)
    ) async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for member metrics."
            return
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
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func loadMemberOverview(
        memberId: String,
        filters: [String: String] = [:],
        dateRange: (start: Date?, end: Date?) = (nil, nil)
    ) async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for member metrics."
            return
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
            selectedMemberOverview = resp.members.first
            if let dr = resp.date_range {
                memberMetricsRangeStart = dr.start.flatMap { Self.dateFromString($0) }
                memberMetricsRangeEnd = dr.end.flatMap { Self.dateFromString($0) }
            } else {
                memberMetricsRangeStart = dateRange.start
                memberMetricsRangeEnd = dateRange.end
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func loadMemberHistory(memberId: String, period: String) async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for member history."
            return
        }
        do {
            let resp = try await APIClient.shared.fetchMemberHistory(
                token: token,
                programId: pid,
                memberId: memberId,
                period: period
            )
            memberHistory = resp.buckets
            memberHistoryLabel = resp.label
            memberHistoryDailyAverage = resp.daily_average
            memberHistoryStartDate = Self.dateFromString(resp.start) ?? Date()
            memberHistoryEndDate = Self.dateFromString(resp.end) ?? Date()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func loadMemberStreaks(memberId: String) async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for member streaks."
            return
        }
        do {
            let resp = try await APIClient.shared.fetchMemberStreaks(
                token: token,
                programId: pid,
                memberId: memberId
            )
            memberStreaks = resp
        } catch {
            errorMessage = error.localizedDescription
        }
    }

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
        maxDuration: Int? = nil
    ) async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for member recent."
            return
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
            memberRecent = resp.items
        } catch {
            errorMessage = error.localizedDescription
        }
    }

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
        maxFoodQuality: Int? = nil
    ) async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for daily health logs."
            return
        }
        do {
            let resp = try await APIClient.shared.fetchMemberHealthLogs(
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
                maxFoodQuality: maxFoodQuality
            )
            memberHealthLogs = resp.items
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func loadMembershipDetails() async {
        guard let token = authToken, !token.isEmpty else { 
            return 
        }
        guard let pid = programId else {
            errorMessage = "No program selected for membership details."
            return
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
        } catch {
            errorMessage = error.localizedDescription
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
