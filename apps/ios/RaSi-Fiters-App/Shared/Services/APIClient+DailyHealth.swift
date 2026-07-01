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
}
