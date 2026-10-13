import Foundation

struct APIError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// Every non-2xx API response (frontend-kit D-KIT-5, auth §3.1). The status decides the kit kind; `message` is the
/// server's `error` (else `message`, else "Request failed (N)"), so screens showing `localizedDescription` read the
/// same text as before.
struct APIHTTPError: LocalizedError {
    let statusCode: Int
    let message: String
    var code: String? = nil
    var retryAfter: Int? = nil
    var requestId: String? = nil
    var errorDescription: String? { message }

    static func from(_ data: Data, _ http: HTTPURLResponse) -> APIHTTPError {
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        let message = (json?["error"] as? String) ?? (json?["message"] as? String) ?? "Request failed (\(http.statusCode))"
        return APIHTTPError(statusCode: http.statusCode, message: message, code: json?["code"] as? String,
                            retryAfter: AppError.parseRetryAfter(http.value(forHTTPHeaderField: "Retry-After")),
                            requestId: http.value(forHTTPHeaderField: "X-Request-Id"))
    }
}

final class APIClient {
    static let shared = APIClient()

    /// frontend-kit §10 / board §6 item 4: requests time out at 15 s (was URLSession.shared's 60 s).
    static let defaultSession: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 60
        return URLSession(configuration: configuration)
    }()

    let baseURL: URL
    let session: URLSession
    /// UI-mirror hook, called with the new pair after every refresh (SessionStore already holds it).
    var tokenUpdateHandler: ((String, String?) -> Void)?
    /// A `426` from any route (app-config D-C5, health-sync §8 rule 8) → the blocking update screen.
    var updateRequiredHandler: (() -> Void)?

    // Single-flight refresh + escalating back-off (APIClient+Session).
    var refreshTask: Task<String?, Error>?
    var refreshBlockedUntil: Date?
    var lastRefreshError: Error?
    var refreshFailures = 0

    init(baseURL: URL = APIConfig.activeBaseURL, session: URLSession = APIClient.defaultSession) {
        self.baseURL = baseURL
        self.session = session
    }

    func healthCheck() async throws -> String {
        let data = try await data(for: URLRequest(url: baseURL.appendingPathComponent("test")))
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return json?["message"] as? String ?? "OK"
    }

    struct AppConfigResponse: Decodable {
        let min_ios_version: String?
        let latest_ios_version: String?          // app-config 0.2.0 soft nudge (step 6)
    }

    func fetchAppConfig() async throws -> AppConfigResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("app-config"))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let data = try await data(for: request, allowRefresh: false)
        return try JSONDecoder().decode(AppConfigResponse.self, from: data)
    }

    /// polish-1 rule 4, NetworkMonitor's offline probe: `GET /app-config`, no auth, 5 s, never from URLCache (the
    /// route is cacheable, D-C2). `transport` reports the outcome; the answer itself is unused.
    func probeReachability() async {
        var request = URLRequest(url: baseURL.appendingPathComponent("app-config"),
                                 cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 5)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        _ = try? await transport(request)
    }

    /// Every JSON call: the authenticated path (`rawData`, APIClient+Session); non-2xx → `APIHTTPError`.
    func data(for request: URLRequest, allowRefresh: Bool = true) async throws -> Data {
        let response: (Data, HTTPURLResponse)
        if allowRefresh {
            response = try await rawData(for: request)
        } else {
            response = try await transport(request)
        }
        let (data, http) = response
        guard 200..<300 ~= http.statusCode else { throw APIHTTPError.from(data, http) }
        return data
    }
}
