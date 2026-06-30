import Foundation

extension APIClient {

    struct MTDParticipationDTO: Decodable {
        let total_members: Int
        let active_members: Int
        let participation_pct: Double
        let change_pct: Double
    }

    struct TotalWorkoutsMTDDTO: Decodable {
        let total_workouts: Int
        let change_pct: Double
    }

    struct TotalDurationMTDDTO: Decodable {
        let total_minutes: Int
        let change_pct: Double
    }

    struct AvgDurationMTDDTO: Decodable {
        let avg_minutes: Int
        let change_pct: Double
    }

    struct ActivityTimelinePoint: Decodable, Identifiable {
        let id = UUID()
        let date: String
        let label: String
        let workouts: Int
        let active_members: Int
    }

    struct ActivityTimelineResponse: Decodable {
        let mode: String
        let label: String
        let daily_average: Double
        let buckets: [ActivityTimelinePoint]
    }

    struct HealthTimelinePoint: Decodable, Identifiable {
        let id = UUID()
        let date: String
        let label: String
        let sleep_hours: Double
        let food_quality: Double
    }

    struct HealthTimelineResponse: Decodable {
        let mode: String
        let label: String
        let daily_average_sleep: Double
        let daily_average_food: Double
        let buckets: [HealthTimelinePoint]
        let start: String?
        let end: String?
    }

    struct DistributionByDayDTO: Decodable {
        let Sunday: Int
        let Monday: Int
        let Tuesday: Int
        let Wednesday: Int
        let Thursday: Int
        let Friday: Int
        let Saturday: Int
    }

    struct WorkoutTypeDTO: Decodable, Identifiable {
        let id = UUID()
        let workout_name: String
        let sessions: Int
        let total_duration: Int
        let avg_duration_minutes: Int
    }

    struct WorkoutTypesTotalDTO: Decodable {
        let total_types: Int
    }

    struct WorkoutTypeMostPopularDTO: Decodable {
        let workout_name: String?
        let sessions: Int
    }

    struct WorkoutTypeLongestDurationDTO: Decodable {
        let workout_name: String?
        let avg_minutes: Int
    }

    struct WorkoutTypeHighestParticipationDTO: Decodable {
        let workout_name: String?
        let participants: Int
        let participation_pct: Double
        let total_members: Int
    }

    // Analytics summary (period: day | week | month | year)
    func fetchAnalyticsSummary(token: String, period: String, programId: String?) async throws -> AnalyticsSummary {
        var components = URLComponents(url: baseURL.appendingPathComponent("analytics/summary"), resolvingAgainstBaseURL: false)!
        var items = [URLQueryItem(name: "period", value: period)]
        if let programId {
            items.append(URLQueryItem(name: "programId", value: programId))
        }
        components.queryItems = items

        guard let url = components.url else {
            throw APIError(message: "Invalid analytics URL")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let data = try await data(for: request)
        return try JSONDecoder().decode(AnalyticsSummary.self, from: data)
    }

    func fetchMTDParticipation(token: String, programId: String) async throws -> MTDParticipationDTO {
        var components = URLComponents(url: baseURL.appendingPathComponent("analytics-v2/participation/mtd"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "programId", value: programId)]
        guard let url = components.url else {
            throw APIError(message: "Invalid MTD participation URL")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(MTDParticipationDTO.self, from: data)
    }

    func fetchTotalWorkoutsMTD(token: String, programId: String) async throws -> TotalWorkoutsMTDDTO {
        var components = URLComponents(url: baseURL.appendingPathComponent("analytics/workouts/total"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "programId", value: programId)]
        guard let url = components.url else {
            throw APIError(message: "Invalid total workouts URL")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(TotalWorkoutsMTDDTO.self, from: data)
    }

    func fetchTotalDurationMTD(token: String, programId: String) async throws -> TotalDurationMTDDTO {
        var components = URLComponents(url: baseURL.appendingPathComponent("analytics/duration/total"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "programId", value: programId)]
        guard let url = components.url else {
            throw APIError(message: "Invalid total duration URL")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(TotalDurationMTDDTO.self, from: data)
    }

    func fetchAvgDurationMTD(token: String, programId: String) async throws -> AvgDurationMTDDTO {
        var components = URLComponents(url: baseURL.appendingPathComponent("analytics/duration/average"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "programId", value: programId)]
        guard let url = components.url else {
            throw APIError(message: "Invalid average duration URL")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(AvgDurationMTDDTO.self, from: data)
    }

    func fetchActivityTimeline(token: String, period: String, programId: String) async throws -> ActivityTimelineResponse {
        var components = URLComponents(url: baseURL.appendingPathComponent("analytics/timeline"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "period", value: period),
            URLQueryItem(name: "programId", value: programId)
        ]
        guard let url = components.url else {
            throw APIError(message: "Invalid timeline URL")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(ActivityTimelineResponse.self, from: data)
    }

    func fetchHealthTimeline(
        token: String,
        period: String,
        programId: String,
        memberId: String? = nil
    ) async throws -> HealthTimelineResponse {
        var components = URLComponents(url: baseURL.appendingPathComponent("analytics/health/timeline"), resolvingAgainstBaseURL: false)!
        var items = [
            URLQueryItem(name: "period", value: period),
            URLQueryItem(name: "programId", value: programId)
        ]
        if let memberId {
            items.append(URLQueryItem(name: "memberId", value: memberId))
        }
        components.queryItems = items
        guard let url = components.url else {
            throw APIError(message: "Invalid health timeline URL")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(HealthTimelineResponse.self, from: data)
    }

    func fetchDistributionByDay(token: String, programId: String) async throws -> DistributionByDayDTO {
        var components = URLComponents(url: baseURL.appendingPathComponent("analytics/distribution/day"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "programId", value: programId)]
        guard let url = components.url else {
            throw APIError(message: "Invalid distribution URL")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(DistributionByDayDTO.self, from: data)
    }

    func fetchWorkoutTypes(token: String, programId: String, memberId: String? = nil, limit: Int = 100) async throws -> [WorkoutTypeDTO] {
        var components = URLComponents(url: baseURL.appendingPathComponent("analytics/workouts/types"), resolvingAgainstBaseURL: false)!
        var items = [
            URLQueryItem(name: "programId", value: programId),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]
        if let memberId {
            items.append(URLQueryItem(name: "memberId", value: memberId))
        }
        components.queryItems = items
        guard let url = components.url else {
            throw APIError(message: "Invalid workout types URL")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode([WorkoutTypeDTO].self, from: data)
    }

    func fetchWorkoutTypesTotal(token: String, programId: String, memberId: String? = nil) async throws -> WorkoutTypesTotalDTO {
        var components = URLComponents(url: baseURL.appendingPathComponent("analytics-v2/workouts/types/total"), resolvingAgainstBaseURL: false)!
        var items = [URLQueryItem(name: "programId", value: programId)]
        if let memberId {
            items.append(URLQueryItem(name: "memberId", value: memberId))
        }
        components.queryItems = items
        guard let url = components.url else {
            throw APIError(message: "Invalid workout types total URL")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(WorkoutTypesTotalDTO.self, from: data)
    }

    func fetchWorkoutTypeMostPopular(token: String, programId: String, memberId: String? = nil) async throws -> WorkoutTypeMostPopularDTO {
        var components = URLComponents(url: baseURL.appendingPathComponent("analytics-v2/workouts/types/most-popular"), resolvingAgainstBaseURL: false)!
        var items = [URLQueryItem(name: "programId", value: programId)]
        if let memberId {
            items.append(URLQueryItem(name: "memberId", value: memberId))
        }
        components.queryItems = items
        guard let url = components.url else {
            throw APIError(message: "Invalid workout types most popular URL")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(WorkoutTypeMostPopularDTO.self, from: data)
    }

    func fetchWorkoutTypeLongestDuration(token: String, programId: String, memberId: String? = nil) async throws -> WorkoutTypeLongestDurationDTO {
        var components = URLComponents(url: baseURL.appendingPathComponent("analytics-v2/workouts/types/longest-duration"), resolvingAgainstBaseURL: false)!
        var items = [URLQueryItem(name: "programId", value: programId)]
        if let memberId {
            items.append(URLQueryItem(name: "memberId", value: memberId))
        }
        components.queryItems = items
        guard let url = components.url else {
            throw APIError(message: "Invalid workout types longest duration URL")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(WorkoutTypeLongestDurationDTO.self, from: data)
    }

    func fetchWorkoutTypeHighestParticipation(token: String, programId: String, memberId: String? = nil) async throws -> WorkoutTypeHighestParticipationDTO {
        var components = URLComponents(url: baseURL.appendingPathComponent("analytics-v2/workouts/types/highest-participation"), resolvingAgainstBaseURL: false)!
        var items = [URLQueryItem(name: "programId", value: programId)]
        if let memberId {
            items.append(URLQueryItem(name: "memberId", value: memberId))
        }
        components.queryItems = items
        guard let url = components.url else {
            throw APIError(message: "Invalid workout types highest participation URL")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(WorkoutTypeHighestParticipationDTO.self, from: data)
    }
}
