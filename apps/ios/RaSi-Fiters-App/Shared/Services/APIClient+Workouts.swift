import Foundation

extension APIClient {

    struct WorkoutDTO: Decodable {
        let workout_name: String
    }

    struct ProgramWorkoutDTO: Decodable, Identifiable {
        let id: String
        let workout_name: String
        let source: String  // "global" or "custom"
        let is_hidden: Bool
        let library_workout_id: String?

        var isGlobal: Bool { source == "global" }
        var isCustom: Bool { source == "custom" }
    }

    struct ProgramWorkoutResponse: Decodable {
        let id: String
        let workout_name: String
        let source: String
        let is_hidden: Bool
        let library_workout_id: String?
        let message: String?
    }

    struct DeleteWorkoutLogResponse: Decodable {
        let message: String
    }

    func fetchWorkouts(token: String) async throws -> [WorkoutDTO] {
        var request = URLRequest(url: baseURL.appendingPathComponent("workouts"))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode([WorkoutDTO].self, from: data)
    }

    // MARK: - Program Workouts (per-program workout management)

    func fetchProgramWorkouts(token: String, programId: String) async throws -> [ProgramWorkoutDTO] {
        var components = URLComponents(url: baseURL.appendingPathComponent("program-workouts"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "programId", value: programId)]
        guard let url = components.url else { throw APIError(message: "Invalid program workouts URL") }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode([ProgramWorkoutDTO].self, from: data)
    }

    func toggleProgramWorkoutVisibility(token: String, programId: String, libraryWorkoutId: String) async throws -> ProgramWorkoutResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-workouts/toggle-visibility"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = [
            "program_id": programId,
            "library_workout_id": libraryWorkoutId
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        let data = try await data(for: request)
        return try JSONDecoder().decode(ProgramWorkoutResponse.self, from: data)
    }

    func toggleCustomWorkoutVisibility(token: String, workoutId: String) async throws -> ProgramWorkoutResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-workouts/\(workoutId)/toggle-visibility"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(ProgramWorkoutResponse.self, from: data)
    }

    func addCustomProgramWorkout(token: String, programId: String, workoutName: String) async throws -> ProgramWorkoutResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-workouts/custom"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = [
            "program_id": programId,
            "workout_name": workoutName
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        let data = try await data(for: request)
        return try JSONDecoder().decode(ProgramWorkoutResponse.self, from: data)
    }

    func editCustomProgramWorkout(token: String, workoutId: String, workoutName: String) async throws -> ProgramWorkoutResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-workouts/\(workoutId)"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let body = ["workout_name": workoutName]
        request.httpBody = try JSONEncoder().encode(body)
        let data = try await data(for: request)
        return try JSONDecoder().decode(ProgramWorkoutResponse.self, from: data)
    }

    func deleteCustomProgramWorkout(token: String, workoutId: String) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-workouts/\(workoutId)"))
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        _ = try await data(for: request)
    }

    func addWorkoutLog(token: String, memberName: String, workoutName: String, date: String, durationMinutes: Int, programId: String?, memberId: String?) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("workout-logs"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        var body: [String: Any] = [
            "member_name": memberName,
            "workout_name": workoutName,
            "date": date,
            "duration": durationMinutes
        ]
        if let programId { body["program_id"] = programId }
        if let memberId { body["member_id"] = memberId }

        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        _ = try await data(for: request)
    }

    // MARK: - Bulk workout logging

    struct BulkWorkoutEntry: Encodable {
        let member_id: String
        let workout_name: String
        let date: String
        let duration: Int
    }

    struct BulkRowError: Decodable {
        let index: Int
        let field: String
        let message: String
    }

    struct BulkWorkoutResult: Decodable {
        let created: Int
        let updated: Int
        let total_minutes: Int
        let groups: Int
        let total_entries: Int
    }

    /// Thrown on a non-2xx batch response. Carries the per-row errors so the form can highlight
    /// the offending rows (duplicate collisions, field validation) by their submitted index.
    struct BulkWorkoutError: LocalizedError {
        let message: String
        let rowErrors: [BulkRowError]
        var errorDescription: String? { message }
    }

    private struct BulkWorkoutErrorPayload: Decodable {
        let error: String?
        let message: String?
        let rowErrors: [BulkRowError]?
    }

    /// Bulk-log workouts. Duplicate (member, workout, date) rows — in the batch or against an
    /// existing log — are rejected server-side with a 409 + `rowErrors` (never merged).
    /// Uses `rawData(for:)` so the per-row error body survives (the shared `data(for:)` collapses
    /// errors to a flat message).
    func addWorkoutLogsBatch(token: String, programId: String, entries: [BulkWorkoutEntry]) async throws -> BulkWorkoutResult {
        func buildRequest(bearer: String) throws -> URLRequest {
            var request = URLRequest(url: baseURL.appendingPathComponent("workout-logs/batch"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
            let body: [String: Any] = [
                "program_id": programId,
                "entries": entries.map { [
                    "member_id": $0.member_id,
                    "workout_name": $0.workout_name,
                    "date": $0.date,
                    "duration": $0.duration
                ] }
            ]
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
            let payload = try? JSONDecoder().decode(BulkWorkoutErrorPayload.self, from: data)
            let message = payload?.error ?? payload?.message ?? "Request failed (\(http.statusCode))"
            throw BulkWorkoutError(message: message, rowErrors: payload?.rowErrors ?? [])
        }
        return try JSONDecoder().decode(BulkWorkoutResult.self, from: data)
    }

    func deleteWorkoutLog(token: String, programId: String, memberId: String, workoutName: String, date: String) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("workout-logs"))
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        let body: [String: Any] = [
            "program_id": programId,
            "member_id": memberId,
            "workout_name": workoutName,
            "date": date
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        _ = try await data(for: request)
    }

    func updateWorkoutLog(
        token: String,
        programId: String,
        memberName: String?,
        workoutName: String,
        date: String,
        duration: Int
    ) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("workout-logs"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        var body: [String: Any] = [
            "program_id": programId,
            "workout_name": workoutName,
            "date": date,
            "duration": duration
        ]
        if let memberName, !memberName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            body["member_name"] = memberName
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        _ = try await data(for: request)
    }

    // MARK: - HealthKit auto-sync write

    /// Outcome of a single Apple Health workout-log write. The shared `data(for:)` collapses errors
    /// to a status-less `APIError`; this uses `rawData(for:)` so the caller can distinguish an expected
    /// duplicate (skip) from a retryable failure (don't advance the HealthKit anchor).
    enum WorkoutLogWriteOutcome {
        case created            // 2xx — a new log was written
        case duplicate          // 409 — already logged that (member, workout, date); skip (D3)
        case skipped            // 400 / 403 / 404 — permanent (locked/validation/not-a-participant); won't retry
        case retryable          // network / 5xx / 401-after-refresh — leave the anchor so it retries next sync
    }

    /// Post one aggregated workout to `POST /api/workout-logs`, classifying the result. Never throws —
    /// returns `.retryable` on transport errors. Mirrors `data(for:)`'s single refresh-on-401 while
    /// preserving the HTTP status.
    func writeHealthKitWorkoutLog(
        token: String,
        memberName: String,
        workoutName: String,
        date: String,
        durationMinutes: Int,
        programId: String,
        memberId: String?
    ) async -> WorkoutLogWriteOutcome {
        func buildRequest(bearer: String) -> URLRequest? {
            var request = URLRequest(url: baseURL.appendingPathComponent("workout-logs"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
            var body: [String: Any] = [
                "member_name": memberName,
                "workout_name": workoutName,
                "date": date,
                "duration": durationMinutes,
                "program_id": programId
            ]
            if let memberId { body["member_id"] = memberId }
            guard let httpBody = try? JSONSerialization.data(withJSONObject: body, options: []) else { return nil }
            request.httpBody = httpBody
            return request
        }

        guard let initial = buildRequest(bearer: token) else { return .skipped }

        do {
            var (_, http) = try await rawData(for: initial)
            if http.statusCode == 401, let fresh = try? await refreshAccessTokenIfPossible(),
               let retry = buildRequest(bearer: fresh) {
                (_, http) = try await rawData(for: retry)
            }
            switch http.statusCode {
            case 200..<300:     return .created
            case 409:           return .duplicate
            case 400, 403, 404: return .skipped
            default:            return .retryable   // 401 (still), 5xx, anything else
            }
        } catch {
            return .retryable
        }
    }
}
