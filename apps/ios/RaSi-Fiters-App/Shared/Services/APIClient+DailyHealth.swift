import Foundation

extension APIClient {

    // MARK: - Daily-health list (steps-aware)

    /// A daily-health list item including the `steps` column. The steps-aware twin of
    /// `MemberHealthLogResponse.Item` (APIClient+Health.swift, untouched for live-binary parity).
    struct DailyHealthLogItem: Decodable, Identifiable {
        let id: String
        let logDate: String
        let sleepHours: Double?
        let foodQuality: Int?
        let steps: Int?
    }

    struct DailyHealthLogsList: Decodable {
        let items: [DailyHealthLogItem]
        let total: Int?
    }

    /// Steps-aware `GET /daily-health-logs` (adds `minSteps`/`maxSteps` and decodes `steps`).
    /// Distinct name from `fetchMemberHealthLogs` — no redeclaration of the legacy call.
    func fetchDailyHealthLogs(
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
        maxFoodQuality: Int? = nil,
        minSteps: Int? = nil,
        maxSteps: Int? = nil
    ) async throws -> DailyHealthLogsList {
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
        if let minSteps { queryItems.append(URLQueryItem(name: "minSteps", value: "\(minSteps)")) }
        if let maxSteps { queryItems.append(URLQueryItem(name: "maxSteps", value: "\(maxSteps)")) }
        components.queryItems = queryItems
        guard let url = components.url else { throw APIError(message: "Invalid daily health logs URL") }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(DailyHealthLogsList.self, from: data)
    }

    // MARK: - Batched daily-health write

    struct BulkHealthEntry {
        let member_id: String
        let log_date: String
        let sleep_hours: Double?
        let food_quality: Int?
        let steps: Int?
    }

    struct BulkHealthResult: Decodable {
        let created: Int
        let updated: Int
        let programs: Int?
        let total_entries: Int
    }

    private struct BulkHealthErrorPayload: Decodable {
        let error: String?
        let message: String?
        let rowErrors: [BulkRowError]?
    }

    /// Batch-log daily health, optionally across several programs (`program_ids`; `program_id` stays
    /// the current-program fallback). Mirrors `addWorkoutLogsBatch`'s central-path/error-payload
    /// pattern so per-row errors survive; throws `BulkWorkoutError` (shared row-error carrier).
    /// Empty fields are OMITTED per entry — JSON presence drives the server's upsert semantics.
    func addDailyHealthLogsBatch(
        token: String,
        programId: String,
        programIds: [String] = [],
        entries: [BulkHealthEntry]
    ) async throws -> BulkHealthResult {
        func buildRequest(bearer: String) throws -> URLRequest {
            var request = URLRequest(url: baseURL.appendingPathComponent("daily-health-logs/batch"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
            var body: [String: Any] = [
                "program_id": programId,
                "entries": entries.map { entry -> [String: Any] in
                    var dict: [String: Any] = [
                        "member_id": entry.member_id,
                        "log_date": entry.log_date
                    ]
                    if let sleep = entry.sleep_hours { dict["sleep_hours"] = sleep }
                    if let food = entry.food_quality { dict["food_quality"] = food }
                    if let steps = entry.steps { dict["steps"] = steps }
                    return dict
                }
            ]
            if !programIds.isEmpty { body["program_ids"] = programIds }
            request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
            return request
        }

        // The central auth path (token at send time, one refresh + retry on 401) — the error body survives.
        let (data, http) = try await rawData(for: try buildRequest(bearer: token))

        guard 200..<300 ~= http.statusCode else {
            let payload = try? JSONDecoder().decode(BulkHealthErrorPayload.self, from: data)
            let message = payload?.error ?? payload?.message ?? "Request failed (\(http.statusCode))"
            throw BulkWorkoutError(message: message, rowErrors: payload?.rowErrors ?? [], status: http.statusCode)
        }
        return try JSONDecoder().decode(BulkHealthResult.self, from: data)
    }

    // MARK: - Steps-aware single update

    /// Steps-aware overload of the daily-health PUT. `steps`/`food_quality` send explicit null when
    /// nil (clears the value server-side); `sleep_hours` is omitted when nil (unchanged), mirroring
    /// the legacy PUT in APIClient+Health.swift.
    func updateDailyHealthLog(
        token: String,
        programId: String,
        memberId: String?,
        logDate: String,
        sleepHours: Double?,
        foodQuality: Int?,
        steps: Int?
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
        if let steps {
            body["steps"] = steps
        } else {
            body["steps"] = NSNull()
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        _ = try await data(for: request)
    }
}
