import Foundation

/// Apple Health SLEEP auto-sync backend write. Reuses the existing daily-health-log endpoints — no new
/// backend route: `POST /api/daily-health-logs` creates the row; on a 409 (a row already exists for that
/// program/member/date) it falls back to `PUT /api/daily-health-logs` to overwrite `sleep_hours` only
/// (the backend's partial update leaves `diet_quality`/`food_quality` untouched).
///
/// Never throws — like the workout writer, transport errors classify as `.retryable` so the caller can
/// decide whether the night is retried on the next trigger.
extension APIClient {

    /// Outcome of a single Apple Health sleep-log write.
    enum DailyHealthWriteOutcome {
        case created            // 201 — a brand-new night row was written (POST)
        case updated            // 2xx after a 409 → PUT overwrote the existing sleep_hours
        case skipped            // 400 / 403 / 404 — permanent (validation / locked / not-a-participant)
        case retryable          // network / 5xx / 401-after-refresh — try again next sync
    }

    /// Upsert one night's total time-asleep. POST first; on 409 overwrite via PUT. Mirrors
    /// `writeHealthKitWorkoutLog`'s single refresh-on-401 retry while preserving the HTTP status.
    func writeHealthKitSleepLog(
        token: String,
        logDate: String,
        sleepHours: Double,
        programId: String,
        memberId: String?
    ) async -> DailyHealthWriteOutcome {
        func buildRequest(method: String, bearer: String) -> URLRequest? {
            var request = URLRequest(url: baseURL.appendingPathComponent("daily-health-logs"))
            request.httpMethod = method
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
            var body: [String: Any] = [
                "program_id": programId,
                "log_date": logDate,
                "sleep_hours": sleepHours
            ]
            if let memberId { body["member_id"] = memberId }
            guard let httpBody = try? JSONSerialization.data(withJSONObject: body, options: []) else { return nil }
            request.httpBody = httpBody
            return request
        }

        // Send one request with a single refresh-on-401 retry; returns the final status (nil = transport error).
        func send(method: String) async -> Int? {
            guard let initial = buildRequest(method: method, bearer: token) else { return nil }
            do {
                var (_, http) = try await rawData(for: initial)
                if http.statusCode == 401, let fresh = try? await refreshAccessTokenIfPossible(),
                   let retry = buildRequest(method: method, bearer: fresh) {
                    (_, http) = try await rawData(for: retry)
                }
                return http.statusCode
            } catch {
                return nil
            }
        }

        guard let postStatus = await send(method: "POST") else { return .retryable }
        switch postStatus {
        case 200..<300:
            return .created
        case 400, 403, 404:
            return .skipped
        case 409:
            // Row exists — overwrite sleep_hours (diet_quality untouched by the backend partial update).
            guard let putStatus = await send(method: "PUT") else { return .retryable }
            switch putStatus {
            case 200..<300:     return .updated
            case 400, 403, 404: return .skipped
            default:            return .retryable
            }
        default:
            return .retryable   // 401 (still), 5xx, anything else
        }
    }

    /// Upsert one day's step count — the steps twin of `writeHealthKitSleepLog` (POST first; on 409
    /// overwrite `steps` only via PUT; other fields untouched by the backend partial update).
    func writeHealthKitStepsLog(
        token: String,
        logDate: String,
        steps: Int,
        programId: String,
        memberId: String?
    ) async -> DailyHealthWriteOutcome {
        func buildRequest(method: String, bearer: String) -> URLRequest? {
            var request = URLRequest(url: baseURL.appendingPathComponent("daily-health-logs"))
            request.httpMethod = method
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
            var body: [String: Any] = [
                "program_id": programId,
                "log_date": logDate,
                "steps": steps
            ]
            if let memberId { body["member_id"] = memberId }
            guard let httpBody = try? JSONSerialization.data(withJSONObject: body, options: []) else { return nil }
            request.httpBody = httpBody
            return request
        }

        func send(method: String) async -> Int? {
            guard let initial = buildRequest(method: method, bearer: token) else { return nil }
            do {
                var (_, http) = try await rawData(for: initial)
                if http.statusCode == 401, let fresh = try? await refreshAccessTokenIfPossible(),
                   let retry = buildRequest(method: method, bearer: fresh) {
                    (_, http) = try await rawData(for: retry)
                }
                return http.statusCode
            } catch {
                return nil
            }
        }

        guard let postStatus = await send(method: "POST") else { return .retryable }
        switch postStatus {
        case 200..<300:
            return .created
        case 400, 403, 404:
            return .skipped
        case 409:
            guard let putStatus = await send(method: "PUT") else { return .retryable }
            switch putStatus {
            case 200..<300:     return .updated
            case 400, 403, 404: return .skipped
            default:            return .retryable
            }
        default:
            return .retryable   // 401 (still), 5xx, anything else
        }
    }

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
    /// the current-program fallback). Mirrors `addWorkoutLogsBatch`'s rawData/401-retry/error-payload
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

        var (data, http) = try await rawData(for: try buildRequest(bearer: token))

        // One refresh + retry on 401, mirroring data(for:) — but preserving the error body.
        if http.statusCode == 401, let fresh = try? await refreshAccessTokenIfPossible() {
            (data, http) = try await rawData(for: try buildRequest(bearer: fresh))
            if http.statusCode == 401 { authFailureHandler?() }
        }

        guard 200..<300 ~= http.statusCode else {
            let payload = try? JSONDecoder().decode(BulkHealthErrorPayload.self, from: data)
            let message = payload?.error ?? payload?.message ?? "Request failed (\(http.statusCode))"
            throw BulkWorkoutError(message: message, rowErrors: payload?.rowErrors ?? [])
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
