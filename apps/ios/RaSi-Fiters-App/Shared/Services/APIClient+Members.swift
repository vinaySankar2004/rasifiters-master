import Foundation

extension APIClient {

    struct MemberDTO: Decodable, Identifiable {
        let id: String
        let member_name: String
        let username: String?
        let gender: String?
        let date_of_birth: String?
        let date_joined: String?
    }

    struct MemberDetailDTO: Decodable {
        let id: String
        let member_name: String
        let username: String
        let gender: String?
        let date_of_birth: String?
        let date_joined: String?
        let role: String?
        let program_id: String?
    }

    struct EnrollMemberResponse: Decodable {
        let member_id: String
        let member_name: String
        let username: String
        let gender: String?
        let date_of_birth: String?
        let date_joined: String?
        let program_id: String
        let message: String?
    }

    struct MemberMetricsDTO: Decodable, Identifiable {
        let id = UUID()
        let member_id: String
        let member_name: String
        let username: String
        let workouts: Int
        let total_duration: Int
        let avg_duration: Int
        let avg_sleep_hours: Double?
        let active_days: Int
        let workout_types: Int
        let current_streak: Int
        let longest_streak: Int
        let avg_food_quality: Int?
        let mtd_workouts: Int?
        let total_hours: Int?
        let favorite_workout: String?
    }

    struct DateRangeDTO: Decodable {
        let start: String?
        let end: String?
    }

    struct MemberMetricsResponse: Decodable {
        let program_id: String
        let total: Int
        let filtered: Int
        let sort: String
        let direction: String
        let date_range: DateRangeDTO?
        let members: [MemberMetricsDTO]
    }

    struct MemberHistoryPoint: Decodable, Identifiable {
        let id = UUID()
        let date: String
        let label: String
        let workouts: Int
    }

    struct MemberHistoryResponse: Decodable {
        let period: String
        let label: String
        let daily_average: Double
        let start: String
        let end: String
        let buckets: [MemberHistoryPoint]
    }

    struct MemberStreaksResponse: Decodable {
        struct Milestone: Decodable, Identifiable {
            let id = UUID()
            let dayValue: Int
            let achieved: Bool
        }
        let currentStreakDays: Int
        let longestStreakDays: Int
        let milestones: [Milestone]
    }

    struct MemberRecentWorkoutsResponse: Decodable {
        struct Item: Decodable, Identifiable {
            let id: String
            let workoutType: String
            let workoutDate: String
            let durationMinutes: Int
        }
        struct Filters: Decodable {
            let startDate: String?
            let endDate: String?
            let sortBy: String
            let sortDir: String
        }
        let items: [Item]
        let total: Int?
        let filters: Filters?
    }

    struct MemberUpdateResponse: Decodable {
        let message: String
    }

    struct MembershipDetailDTO: Decodable, Identifiable {
        var id: String { member_id }
        let member_id: String
        let member_name: String
        let username: String?
        let gender: String?
        let date_of_birth: String?
        let date_joined: String?
        let global_role: String?
        let program_role: String
        let is_active: Bool
        let status: String?
        let joined_at: String?
    }

    struct MembershipUpdateResponse: Decodable {
        let program_id: String
        let member_id: String
        let member_name: String?
        let role: String
        let is_active: Bool
        let status: String?
        let joined_at: String?
        let message: String?
    }

    func fetchMembers(token: String) async throws -> [MemberDTO] {
        var request = URLRequest(url: baseURL.appendingPathComponent("members"))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode([MemberDTO].self, from: data)
    }

    func fetchProgramMembers(token: String, programId: String) async throws -> [MemberDTO] {
        var components = URLComponents(url: baseURL.appendingPathComponent("program-memberships/members"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "programId", value: programId)]
        guard let url = components.url else { throw APIError(message: "Invalid program members URL") }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode([MemberDTO].self, from: data)
    }

    /// Fetches members NOT enrolled in the specified program (available for enrollment)
    func fetchAvailableMembers(token: String, programId: String) async throws -> [MemberDTO] {
        var components = URLComponents(url: baseURL.appendingPathComponent("program-memberships/available"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "programId", value: programId)]
        guard let url = components.url else { throw APIError(message: "Invalid available members URL") }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode([MemberDTO].self, from: data)
    }

    /// Enrolls an existing member into a program (creates ProgramMembership only)
    func enrollExistingMember(token: String, memberId: String, programId: String, joinedAt: String?) async throws -> EnrollMemberResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-memberships/enroll"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        var body: [String: Any] = [
            "member_id": memberId,
            "program_id": programId
        ]
        if let joinedAt { body["joined_at"] = joinedAt }

        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        let data = try await data(for: request)
        return try JSONDecoder().decode(EnrollMemberResponse.self, from: data)
    }

    func addMember(token: String,
                   memberName: String,
                   password: String,
                   gender: String?,
                   dateOfBirth: String?,
                   dateJoined: String?,
                   programId: String) async throws -> MemberDetailDTO {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-memberships"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        var body: [String: Any] = [
            "member_name": memberName,
            "password": password,
            "program_id": programId
        ]
        if let gender { body["gender"] = gender }
        if let dateOfBirth { body["date_of_birth"] = dateOfBirth }
        if let dateJoined { body["date_joined"] = dateJoined }

        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        let data = try await data(for: request)
        return try JSONDecoder().decode(MemberDetailDTO.self, from: data)
    }

    func fetchMemberMetrics(token: String,
                            programId: String,
                            search: String? = nil,
                            sort: String? = nil,
                            direction: String? = nil,
                            memberId: String? = nil,
                            filters: [String: String]? = nil) async throws -> MemberMetricsResponse {
        var components = URLComponents(url: baseURL.appendingPathComponent("member-metrics"), resolvingAgainstBaseURL: false)!
        var items: [URLQueryItem] = [URLQueryItem(name: "programId", value: programId)]
        if let search, !search.isEmpty { items.append(URLQueryItem(name: "search", value: search)) }
        if let sort { items.append(URLQueryItem(name: "sort", value: sort)) }
        if let direction { items.append(URLQueryItem(name: "direction", value: direction)) }
        if let memberId { items.append(URLQueryItem(name: "memberId", value: memberId)) }
        if let filters {
            for (k, v) in filters where !v.isEmpty {
                items.append(URLQueryItem(name: k, value: v))
            }
        }
        components.queryItems = items
        guard let url = components.url else { throw APIError(message: "Invalid member metrics URL") }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let data = try await data(for: request)
        return try JSONDecoder().decode(MemberMetricsResponse.self, from: data)
    }

    func fetchMemberHistory(token: String, programId: String, memberId: String, period: String) async throws -> MemberHistoryResponse {
        var components = URLComponents(url: baseURL.appendingPathComponent("member-history"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "programId", value: programId),
            URLQueryItem(name: "memberId", value: memberId),
            URLQueryItem(name: "period", value: period)
        ]
        guard let url = components.url else { throw APIError(message: "Invalid member history URL") }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(MemberHistoryResponse.self, from: data)
    }

    func fetchMemberStreaks(token: String, programId: String, memberId: String) async throws -> MemberStreaksResponse {
        var components = URLComponents(url: baseURL.appendingPathComponent("member-streaks"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "programId", value: programId),
            URLQueryItem(name: "memberId", value: memberId)
        ]
        guard let url = components.url else { throw APIError(message: "Invalid member streaks URL") }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(MemberStreaksResponse.self, from: data)
    }

    func fetchMemberRecentWorkouts(
        token: String,
        programId: String,
        memberId: String,
        limit: Int = 1000,
        startDate: String? = nil,
        endDate: String? = nil,
        sortBy: String? = nil,
        sortDir: String? = nil,
        workoutType: String? = nil,
        minDuration: Int? = nil,
        maxDuration: Int? = nil
    ) async throws -> MemberRecentWorkoutsResponse {
        var components = URLComponents(url: baseURL.appendingPathComponent("member-recent"), resolvingAgainstBaseURL: false)!
        var queryItems = [
            URLQueryItem(name: "programId", value: programId),
            URLQueryItem(name: "memberId", value: memberId),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]
        if let startDate { queryItems.append(URLQueryItem(name: "startDate", value: startDate)) }
        if let endDate { queryItems.append(URLQueryItem(name: "endDate", value: endDate)) }
        if let sortBy { queryItems.append(URLQueryItem(name: "sortBy", value: sortBy)) }
        if let sortDir { queryItems.append(URLQueryItem(name: "sortDir", value: sortDir)) }
        if let workoutType, !workoutType.isEmpty { queryItems.append(URLQueryItem(name: "workoutType", value: workoutType)) }
        if let minDuration { queryItems.append(URLQueryItem(name: "minDuration", value: "\(minDuration)")) }
        if let maxDuration { queryItems.append(URLQueryItem(name: "maxDuration", value: "\(maxDuration)")) }
        components.queryItems = queryItems
        guard let url = components.url else { throw APIError(message: "Invalid member recent URL") }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(MemberRecentWorkoutsResponse.self, from: data)
    }

    func updateMemberProfile(token: String, memberId: String, firstName: String?, lastName: String?, gender: String?) async throws -> MemberUpdateResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("members/\(memberId)"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        var body: [String: Any] = [:]
        if let firstName { body["first_name"] = firstName }
        if let lastName { body["last_name"] = lastName }
        if let gender { body["gender"] = gender }
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        let data = try await data(for: request)
        return try JSONDecoder().decode(MemberUpdateResponse.self, from: data)
    }

    func fetchMemberById(token: String, memberId: String) async throws -> MemberDTO {
        var request = URLRequest(url: baseURL.appendingPathComponent("members/\(memberId)"))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(MemberDTO.self, from: data)
    }

    func removeMemberFromProgram(token: String, programId: String, memberId: String) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-memberships"))
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        let body: [String: Any] = [
            "program_id": programId,
            "member_id": memberId
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        _ = try await data(for: request)
    }
}
