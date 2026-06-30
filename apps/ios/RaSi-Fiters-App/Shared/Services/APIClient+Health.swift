import Foundation

extension APIClient {

    struct MemberHealthLogResponse: Decodable {
        struct Item: Decodable, Identifiable {
            let id: String
            let logDate: String
            let sleepHours: Double?
            let foodQuality: Int?
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

    func addDailyHealthLog(
        token: String,
        programId: String,
        memberId: String?,
        logDate: String,
        sleepHours: Double?,
        foodQuality: Int?
    ) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("daily-health-logs"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        var body: [String: Any] = [
            "program_id": programId,
            "log_date": logDate
        ]
        if let memberId { body["member_id"] = memberId }
        if let sleepHours { body["sleep_hours"] = sleepHours }
        if let foodQuality {
            body["food_quality"] = foodQuality
        } else {
            body["food_quality"] = NSNull()
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        _ = try await data(for: request)
    }

    func fetchMemberHealthLogs(
        token: String,
        programId: String,
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
    ) async throws -> MemberHealthLogResponse {
        var components = URLComponents(url: baseURL.appendingPathComponent("daily-health-logs"), resolvingAgainstBaseURL: false)!
        var queryItems = [
            URLQueryItem(name: "programId", value: programId),
            URLQueryItem(name: "memberId", value: memberId),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]
        if let startDate { queryItems.append(URLQueryItem(name: "startDate", value: startDate)) }
        if let endDate { queryItems.append(URLQueryItem(name: "endDate", value: endDate)) }
        if let sortBy { queryItems.append(URLQueryItem(name: "sortBy", value: sortBy)) }
        if let sortDir { queryItems.append(URLQueryItem(name: "sortDir", value: sortDir)) }
        if let minSleepHours { queryItems.append(URLQueryItem(name: "minSleepHours", value: "\(minSleepHours)")) }
        if let maxSleepHours { queryItems.append(URLQueryItem(name: "maxSleepHours", value: "\(maxSleepHours)")) }
        if let minFoodQuality { queryItems.append(URLQueryItem(name: "minFoodQuality", value: "\(minFoodQuality)")) }
        if let maxFoodQuality { queryItems.append(URLQueryItem(name: "maxFoodQuality", value: "\(maxFoodQuality)")) }
        components.queryItems = queryItems
        guard let url = components.url else { throw APIError(message: "Invalid daily health logs URL") }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(MemberHealthLogResponse.self, from: data)
    }

    func updateDailyHealthLog(
        token: String,
        programId: String,
        memberId: String?,
        logDate: String,
        sleepHours: Double?,
        foodQuality: Int?
    ) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("daily-health-logs"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        var body: [String: Any] = [
            "program_id": programId,
            "log_date": logDate
        ]
        if let memberId { body["member_id"] = memberId }
        if let sleepHours { body["sleep_hours"] = sleepHours }
        if let foodQuality {
            body["food_quality"] = foodQuality
        } else {
            body["food_quality"] = NSNull()
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        _ = try await data(for: request)
    }

    func deleteDailyHealthLog(
        token: String,
        programId: String,
        memberId: String?,
        logDate: String
    ) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("daily-health-logs"))
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        var body: [String: Any] = [
            "program_id": programId,
            "log_date": logDate
        ]
        if let memberId { body["member_id"] = memberId }
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        _ = try await data(for: request)
    }
}
