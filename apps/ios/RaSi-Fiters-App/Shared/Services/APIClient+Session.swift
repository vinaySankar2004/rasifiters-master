import Foundation

/// auth §3.1 client contract + observability §4.1 headers, for every API call. ONE token store (`SessionStore`) read
/// at send time; refresh only when the token expires within 60 s (by its own lifetime) or on a 401; one refresh in
/// flight; a retryable failure is retried once after min(Retry-After ?? 2, 5) s; then back-off 30 / 60 / 120 / 300 s.
/// Sign-out ONLY when `/auth/refresh` answers `401 session_invalid` (rule 3, amendment A3). This 401 path is the only
/// retry any request gets — password writes are never retried after a 503 / 5xx / timeout (rule 6).
extension APIClient {

    static let refreshMargin: TimeInterval = 60
    static let refreshBackoffSteps: [TimeInterval] = [30, 60, 120, 300]

    /// The observability §4.1 identity headers + `X-Time-Zone` (notifications contract C1 — the IANA zone the server
    /// stores for reminders, the digest and kudos days). The SSE client sends them too.
    static var identityHeaders: [String: String] {
        let info = Bundle.main.infoDictionary
        return ["X-App-Platform": "ios",
                "X-App-Version": info?["CFBundleShortVersionString"] as? String ?? "0",
                "X-App-Build": info?["CFBundleVersion"] as? String ?? "0",
                "X-Time-Zone": TimeZone.current.identifier]
    }

    /// Paths whose bearer the caller owns: logout's captured token, the pending OAuth session, refresh (none).
    private static let callerOwnedBearer = ["auth/refresh", "auth/logout", "auth/oauth/complete"]

    /// Non-idempotent `PUT`s (auth §3.1 rule 6): each send gets a fresh one-shot body stream with an explicit
    /// Content-Length, so CFNetwork can't silently replay the write on a dropped reused connection — it fails with
    /// `requestBodyStreamExhausted` instead (read as "couldn't confirm"). The 401 retry builds a new stream.
    private static let oneShotBodyPaths = ["auth/change-password", "auth/email"]

    /// One exchange on the 15 s session: identity headers + a fresh `X-Request-Id`. No auth logic. Every outcome is
    /// reported to `NetworkMonitor` (polish-1: a no-connection failure proves offline, an answer clears it).
    func transport(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        var request = request
        if let body = request.httpBody, let path = request.url?.path, Self.oneShotBodyPaths.contains(where: { path.hasSuffix($0) }) {
            request.httpBody = nil
            request.httpBodyStream = InputStream(data: body)
            request.setValue(String(body.count), forHTTPHeaderField: "Content-Length")
        }
        Self.identityHeaders.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Request-Id")
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            NetworkMonitor.shared.requestFailed(error)
            throw error
        }
        guard let http = response as? HTTPURLResponse else { throw APIError(message: "No response") }
        NetworkMonitor.shared.requestAnswered(request, http)
        if http.statusCode == 426 { updateRequiredHandler?() }
        return (data, http)
    }

    /// The authenticated path every call takes; returns non-2xx responses as-is (never throws for a status).
    func rawData(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        guard managesAuth(request), let token = await validAccessToken() else { return try await transport(request) }
        let first = try await transport(request.withBearer(token))
        guard first.1.statusCode == 401 else { return first }
        // Rule 1: a 401 sent with an outdated token retries with the current one; only the current token refreshes.
        if let current = SessionStore.shared.accessToken, current != token {
            return try await transport(request.withBearer(current))
        }
        guard let fresh = try await refreshAccessToken() else { return first }
        return try await transport(request.withBearer(fresh))
    }

    /// A request carrying the store's bearer (the central path swaps in the current token at send time anyway).
    func authorizedRequest(_ path: String, method: String) -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if method != "GET" { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        request.setValue("Bearer \(SessionStore.shared.accessToken ?? "")", forHTTPHeaderField: "Authorization")
        return request
    }

    /// The current access token, refreshed first when it expires within 60 s (rule 2). nil = signed out. A failed
    /// proactive refresh keeps the current token (it may still work for up to 60 s).
    func validAccessToken() async -> String? {
        guard let tokens = SessionStore.shared.tokens else { return nil }
        guard Self.expiresSoon(tokens) else { return tokens.access }
        return (try? await refreshAccessToken()) ?? SessionStore.shared.accessToken
    }

    /// Single-flight refresh. nil = no refresh token. Throws the failure; a `401 session_invalid` has already run the
    /// forced teardown. Any other failure blocks refreshes for 30 / 60 / 120 / 300 s (or Retry-After, if longer).
    func refreshAccessToken() async throws -> String? {
        if let task = refreshTask { return try await task.value }
        if let until = refreshBlockedUntil, Date() < until, let error = lastRefreshError { throw error }
        let task = Task { try await self.performRefresh() }
        refreshTask = task
        defer { if refreshTask == task { refreshTask = nil } }      // a teardown may have replaced it meanwhile
        do {
            let token = try await task.value
            clearRefreshBackoff()
            return token
        } catch {
            if !Self.isCancellation(error), !Self.isSessionInvalid(error) {
                refreshFailures += 1
                lastRefreshError = error
                let step = Self.refreshBackoffSteps[min(refreshFailures, Self.refreshBackoffSteps.count) - 1]
                let retryAfter = Double((error as? APIHTTPError)?.retryAfter ?? 0)
                refreshBlockedUntil = Date().addingTimeInterval(max(step, retryAfter))
            }
            throw error
        }
    }

    /// The sign-out teardown: cancel a refresh in flight (it never writes back — epoch) and forget the back-off, so a
    /// new session never inherits the old one's.
    func resetRefreshBackoff() {
        refreshTask?.cancel()
        refreshTask = nil
        clearRefreshBackoff()
    }

    /// A successful refresh, and every offline → online transition (A3, NetworkMonitor): refresh may run again now.
    func clearRefreshBackoff() {
        refreshBlockedUntil = nil
        lastRefreshError = nil
        refreshFailures = 0
    }

    private func performRefresh() async throws -> String? {
        let epoch = SessionStore.shared.epoch                      // the session this refresh belongs to
        guard let refresh = SessionStore.shared.refreshToken, !refresh.isEmpty else {
            if SessionStore.shared.accessToken != nil {           // A3: an access token that can never be renewed
                SessionTeardown.end(.forced(reason: "token_store_unreadable", status: nil, code: nil))
            }
            return nil
        }
        do {
            return try await exchange(refresh, epoch: epoch)
        } catch let error where Self.isRetryable(error) {
            // Rule 2: one quick retry within 5 s (inside Supabase's 60 s reuse window), never a long-delayed replay.
            let wait = min(Double((error as? APIHTTPError)?.retryAfter ?? 2), 5)
            try await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            do {
                return try await exchange(refresh, epoch: epoch)
            } catch {
                Self.reportKeptSession(error)
                throw error
            }
        } catch {
            Self.reportKeptSession(error)
            throw error
        }
    }

    private func exchange(_ refreshToken: String, epoch: Int) async throws -> String {
        guard SessionStore.shared.epoch == epoch else { throw CancellationError() }      // signed out before sending
        do {
            let response = try await refreshSession(refreshToken: refreshToken)
            guard SessionStore.shared.epoch == epoch else { throw CancellationError() }   // signed out meanwhile
            let newRefresh = response.refreshToken ?? refreshToken
            _ = try? SessionStore.shared.save(access: response.token, refresh: newRefresh)  // in memory even if the keychain fails
            tokenUpdateHandler?(response.token, newRefresh)
            return response.token
        } catch let error as APIHTTPError where Self.isSessionInvalid(error) {
            // The session is over (sign-out-everywhere / password change elsewhere / 90 days of inactivity).
            if SessionStore.shared.epoch == epoch {
                SessionTeardown.end(.forced(reason: "refresh_session_invalid", status: error.statusCode, code: error.code))
            }
            throw error
        }
    }

    /// `auth.refresh_failed` — once per failure cycle (after the quick retry), only when the session was kept (A11).
    private static func reportKeptSession(_ error: Error) {
        guard !isCancellation(error), !isSessionInvalid(error) else { return }
        ClientEventQueue.shared.recordRefreshFailed(error)
    }

    private func managesAuth(_ request: URLRequest) -> Bool {
        guard request.value(forHTTPHeaderField: "Authorization") != nil, let path = request.url?.path else { return false }
        return !Self.callerOwnedBearer.contains { path.hasSuffix($0) }
    }

    /// A refresh cancelled by the teardown — neither a failure nor a back-off reason.
    static func isCancellation(_ error: Error) -> Bool {
        error is CancellationError || (error as? URLError)?.code == .cancelled
    }

    /// The only refresh answer that signs anyone out (A3).
    static func isSessionInvalid(_ error: Error) -> Bool {
        guard let http = error as? APIHTTPError else { return false }
        return http.statusCode == 401 && http.code == "session_invalid"
    }

    /// Worth one quick retry: 408 / 429 / 5xx, any transport error except a cancellation.
    static func isRetryable(_ error: Error) -> Bool {
        if let http = error as? APIHTTPError { return http.statusCode == 408 || http.statusCode == 429 || http.statusCode >= 500 }
        if let url = error as? URLError { return url.code != .cancelled }
        return false
    }

    /// Expiry by the token's own lifetime from when this device received it (A3), so a fast or slow device clock
    /// doesn't matter. Unknown age (a migrated pair) or an unparsable token → refresh.
    static func expiresSoon(_ tokens: SessionStore.Tokens) -> Bool {
        guard let receivedAt = tokens.receivedAt, let claims = jwtClaims(tokens.access),
              let exp = claims["exp"] as? TimeInterval else { return true }
        let expiry: Date
        if let iat = claims["iat"] as? TimeInterval, exp > iat {
            expiry = receivedAt.addingTimeInterval(exp - iat)
        } else {
            expiry = Date(timeIntervalSince1970: exp)
        }
        return expiry.timeIntervalSinceNow < refreshMargin
    }

    private static func jwtClaims(_ token: String) -> [String: Any]? {
        let parts = token.split(separator: ".")
        guard parts.count == 3 else { return nil }
        var base64 = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        guard let payload = Data(base64Encoded: base64) else { return nil }
        return (try? JSONSerialization.jsonObject(with: payload)) as? [String: Any]
    }
}

extension URLRequest {
    func withBearer(_ token: String) -> URLRequest {
        var request = self
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }
}
