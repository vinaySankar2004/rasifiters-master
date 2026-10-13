import Foundation

/// observability §8 — the client event sender (`auth.*` §8, `sync.run` §8.1). Events queue on disk and SURVIVE
/// sign-out, carry a UUID `id` kept across retries, and POST in batches of ≤ 25 to `/api/client-events` with the
/// current Bearer when one exists (none is fine — this never refreshes).
final class ClientEventQueue {
    static let shared = ClientEventQueue()

    private static let maxQueued = 200
    private static let maxBatch = 25
    private let fileURL: URL
    private var events: [[String: Any]] = []
    /// The on-disk queue is read on first use once it is readable: a launch before the first unlock can't read the
    /// file, and writing then would overwrite what is queued. Events recorded meanwhile wait in memory and merge in.
    private var isLoaded = false
    private var isFlushing = false
    private var notBefore: Date?
    private let iso = ISO8601DateFormatter()

    private init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("client-events.json")
    }

    /// Queue one event (props ≤ 2 KB; never tokens, emails, usernames or typed text) and flush shortly after.
    /// `requestId` (the response's `X-Request-Id`) sits on the event, next to `id` / `type` / `occurred_at`.
    func record(_ type: String, props: [String: Any], requestId: String? = nil) {
        var event: [String: Any] = ["id": UUID().uuidString.lowercased(), "type": type,
                                    "occurred_at": iso.string(from: Date()), "props": props]
        if let requestId { event["request_id"] = requestId }
        events.append(event)
        trim()
        if ensureLoaded() { persist() }
        Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            await self.flush()
        }
    }

    /// 2xx → drop · 400 / 415 → drop (never succeeds) · 413 → halve (a single event that still 413s is dropped) ·
    /// 429 → wait `Retry-After` · 5xx / offline → keep, retry no sooner than 30 s (next launch / foreground / event).
    func flush() async {
        guard !isFlushing, ensureLoaded(), notBefore.map({ Date() >= $0 }) ?? true else { return }
        isFlushing = true
        defer { isFlushing = false }
        var size = Self.maxBatch
        while !events.isEmpty {
            let batch = Array(events.prefix(size))
            let (status, retryAfter) = await send(batch)
            switch status {
            case 200..<300, 400, 415:
                remove(batch)
                size = Self.maxBatch
            case 413 where batch.count == 1:
                remove(batch)
            case 413:
                size = max(1, batch.count / 2)
            default:
                notBefore = Date().addingTimeInterval(TimeInterval(retryAfter ?? 30))
                return
            }
        }
    }

    /// true once the on-disk queue is merged in (or there is none). false = the file exists but isn't readable yet.
    private func ensureLoaded() -> Bool {
        if isLoaded { return true }
        if let data = try? Data(contentsOf: fileURL) {
            let stored = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? []
            events = stored + events
            trim()
        } else if FileManager.default.fileExists(atPath: fileURL.path) {
            return false
        }
        isLoaded = true
        return true
    }

    private func trim() {
        if events.count > Self.maxQueued { events.removeFirst(events.count - Self.maxQueued) }
    }

    private func send(_ batch: [[String: Any]]) async -> (Int, Int?) {
        var request = URLRequest(url: APIClient.shared.baseURL.appendingPathComponent("client-events"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = SessionStore.shared.accessToken { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        guard let body = try? JSONSerialization.data(withJSONObject: ["events": batch]) else { return (400, nil) }
        request.httpBody = body
        guard let (_, http) = try? await APIClient.shared.transport(request) else { return (0, nil) }
        return (http.statusCode, AppError.parseRetryAfter(http.value(forHTTPHeaderField: "Retry-After")))
    }

    private func remove(_ batch: [[String: Any]]) {
        let ids = Set(batch.compactMap { $0["id"] as? String })
        events.removeAll { ids.contains($0["id"] as? String ?? "") }
        persist()
    }

    private func persist() {
        guard isLoaded, let data = try? JSONSerialization.data(withJSONObject: events) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}

extension ClientEventQueue {
    /// `auth.forced_sign_out` — reason `refresh_session_invalid` | `token_store_unreadable`.
    func recordForcedSignOut(reason: String, status: Int?, code: String?) {
        record("auth.forced_sign_out", props: Self.compact(["reason": reason, "status": status, "code": code]))
    }

    /// `auth.sign_in_failed` for an API failure; method `password` | `google` | `apple` (never a cancellation).
    func recordSignInFailure(_ error: Error, method: String) {
        let failure = Self.failure(error)
        record("auth.sign_in_failed", props: Self.compact(["method": method, "kind": failure.kind, "status": failure.status,
                                                            "code": failure.code]),
               requestId: failure.requestId)
    }

    /// `auth.sign_in_failed` kind `provider`: the native Google / Apple SDK failed before any API call.
    func recordProviderFailure(_ error: Error, method: String) {
        let ns = error as NSError
        record("auth.sign_in_failed", props: ["method": method, "kind": "provider",
                                              "code": String("\(ns.domain):\(ns.code)".prefix(64))])
    }

    /// `auth.refresh_failed` — `/auth/refresh` failed and the session was KEPT.
    func recordRefreshFailed(_ error: Error) {
        let failure = Self.failure(error)
        record("auth.refresh_failed", props: Self.compact(["kind": failure.kind, "status": failure.status, "code": failure.code]),
               requestId: failure.requestId)
    }

    /// `sync.run` (§8.1) — props built by `HealthSyncRunSummary.eventProps`.
    func recordSyncRun(_ props: [String: Any]) { record("sync.run", props: props) }

    /// The §8 `kind` vocabulary from a thrown error (+ the response's `X-Request-Id`, observability §8).
    static func failure(_ error: Error) -> (kind: String, status: Int?, code: String?, requestId: String?) {
        if let http = error as? APIHTTPError {
            let kind: String
            switch http.statusCode {
            case 401: kind = "wrong_credentials"
            case 400, 422: kind = "invalid_input"
            case 409: kind = "conflict"
            case 408: kind = "timeout"
            case 429, 503: kind = "unavailable"
            case 500...: kind = "server"
            default: kind = "unknown"
            }
            return (kind, http.statusCode, http.code, http.requestId)
        }
        if let url = error as? URLError { return (url.code == .timedOut ? "timeout" : "offline", nil, nil, nil) }
        return ("unknown", nil, nil, nil)
    }

    private static func compact(_ props: [String: Any?]) -> [String: Any] { props.compactMapValues { $0 } }
}
