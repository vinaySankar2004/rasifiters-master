import Foundation

/// health-sync §3 calls for integration `healthkit`. Every request takes the central auth path, so a 401 refreshes
/// once and retries the same request (rule 8); the batch is idempotent, so any later re-send is safe.
extension APIClient {

    struct HealthSyncItem: Encodable {
        let kind: String
        var program_id: String? = nil
        var date: String? = nil
        var sample_id: String? = nil
        var origin: String? = nil
        var workout_name: String? = nil
        var value: Double? = nil
        var start_at: String? = nil
        var end_at: String? = nil
        var deleted: Bool? = nil
        var legacy: Bool? = nil
    }

    struct HealthSyncItemResult: Decodable { let index: Int; let status: String; let error: String? }

    struct HealthSyncStateRow: Decodable {
        let integration: String
        let program_id: String
        let kind: String
        let review_done_at: String?
        let last_success_at: String?
    }

    struct HealthSyncStateResponse: Decodable { let server_time: String?; let states: [HealthSyncStateRow] }

    struct HealthSyncStateEntry: Encodable {
        let program_id: String
        let kind: String
        var review_done: Bool? = nil
        var sync_success: Bool? = nil
    }

    /// One upload: a result slot per item (nil = not uploaded), the batches that landed, the first request failure.
    struct HealthSyncUpload {
        var results: [HealthSyncItemResult?]
        var batches = 0
        var error: Error?
    }

    private struct BatchBody: Encodable { let integration = "healthkit"; let items: [HealthSyncItem] }
    private struct BatchResponse: Decodable { let results: [HealthSyncItemResult] }
    private struct StateBody: Encodable { let integration = "healthkit"; let entries: [HealthSyncStateEntry] }

    func fetchHealthSyncState() async throws -> HealthSyncStateResponse {
        let data = try await data(for: authorizedRequest("health-sync/state", method: "GET"))
        return try JSONDecoder().decode(HealthSyncStateResponse.self, from: data)
    }

    /// PUT /state in chunks of ≤ 60 entries (§3.4). No-op for no entries.
    func putHealthSyncState(_ entries: [HealthSyncStateEntry]) async throws {
        for start in stride(from: 0, to: entries.count, by: 60) {
            var request = authorizedRequest("health-sync/state", method: "PUT")
            request.httpBody = try JSONEncoder().encode(StateBody(entries: Array(entries[start..<min(start + 60, entries.count)])))
            _ = try await data(for: request)
        }
    }

    /// POST /batch (rule 2): ≤ 300 items and ≤ 250 kB per request; halved before sending when too big and on a 413.
    /// Stops at the first request-level failure (rule 8: the whole run retries later — idempotent).
    func uploadHealthSync(_ items: [HealthSyncItem]) async -> HealthSyncUpload {
        var upload = HealthSyncUpload(results: Array(repeating: nil, count: items.count))
        var pending: [Range<Int>] = stride(from: 0, to: items.count, by: 300).map { $0..<min($0 + 300, items.count) }
        while !pending.isEmpty {
            let range = pending.removeFirst()
            do {
                var request = authorizedRequest("health-sync/batch", method: "POST")
                request.httpBody = try JSONEncoder().encode(BatchBody(items: Array(items[range])))
                let tooBig = (request.httpBody?.count ?? 0) > 250_000
                var response: (Data, HTTPURLResponse)?
                if !tooBig { response = try await rawData(for: request) }
                if range.count > 1, tooBig || response?.1.statusCode == 413 {
                    let mid = range.lowerBound + range.count / 2
                    pending.insert(contentsOf: [range.lowerBound..<mid, mid..<range.upperBound], at: 0)
                    continue
                }
                guard let (data, http) = response else { throw APIHTTPError(statusCode: 413, message: "Payload too large.") }
                guard 200..<300 ~= http.statusCode else { throw APIHTTPError.from(data, http) }
                for result in try JSONDecoder().decode(BatchResponse.self, from: data).results
                where result.index >= 0 && result.index < range.count {
                    upload.results[range.lowerBound + result.index] = result
                }
                upload.batches += 1
            } catch {
                upload.error = error
                return upload
            }
        }
        return upload
    }
}
