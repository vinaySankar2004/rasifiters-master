import Foundation

struct APIError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

struct APIHTTPError: LocalizedError {
    let statusCode: Int
    let message: String
    var errorDescription: String? { message }
}

final class APIClient {
    static let shared = APIClient()

    let baseURL: URL
    private let session: URLSession
    var tokenUpdateHandler: ((String, String?) -> Void)?
    var authFailureHandler: (() -> Void)?

    private var inflightRefreshTask: Task<String?, Error>?

    init(baseURL: URL = APIConfig.activeBaseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    // Quick connectivity check
    func healthCheck() async throws -> String {
        let request = URLRequest(url: baseURL.appendingPathComponent("test"))
        let data = try await data(for: request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return json?["message"] as? String ?? "OK"
    }

    struct AppConfigResponse: Decodable {
        let min_ios_version: String?
    }

    func fetchAppConfig() async throws -> AppConfigResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("app-config"))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let data = try await data(for: request, allowRefresh: false)
        return try JSONDecoder().decode(AppConfigResponse.self, from: data)
    }

    // MARK: - Helpers

    private static let proactiveRefreshMargin: TimeInterval = 300

    func data(for request: URLRequest, allowRefresh: Bool = true) async throws -> Data {
        var activeRequest = request

        if allowRefresh, shouldAttemptRefresh(for: request),
           let bearer = request.value(forHTTPHeaderField: "Authorization"),
           bearer.hasPrefix("Bearer "),
           Self.accessTokenNearExpiry(String(bearer.dropFirst(7))) {
            if let freshToken = try? await refreshAccessTokenIfPossible() {
                activeRequest.setValue("Bearer \(freshToken)", forHTTPHeaderField: "Authorization")
            }
        }

        let (data, response) = try await rawData(for: activeRequest)

        if response.statusCode == 401, allowRefresh, shouldAttemptRefresh(for: activeRequest) {
            do {
                if let newToken = try await refreshAccessTokenIfPossible() {
                    var retryRequest = request
                    if request.value(forHTTPHeaderField: "Authorization") != nil {
                        retryRequest.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
                    }
                    let (retryData, retryResponse) = try await rawData(for: retryRequest)
                    guard 200..<300 ~= retryResponse.statusCode else {
                        let message = extractErrorMessage(from: retryData) ?? "Request failed (\(retryResponse.statusCode))"
                        if retryResponse.statusCode == 401 {
                            authFailureHandler?()
                        }
                        throw APIError(message: message)
                    }
                    return retryData
                }
            } catch {
                if isAuthFailure(error) {
                    authFailureHandler?()
                }
            }
        }

        guard 200..<300 ~= response.statusCode else {
            let message = extractErrorMessage(from: data) ?? "Request failed (\(response.statusCode))"
            throw APIError(message: message)
        }
        return data
    }

    func rawData(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError(message: "No response")
        }
        return (data, http)
    }

    private func refreshAccessTokenIfPossible() async throws -> String? {
        if let existing = inflightRefreshTask {
            return try await existing.value
        }

        let task = Task<String?, Error> {
            defer { inflightRefreshTask = nil }
            guard let refreshToken = SessionStore.shared.refreshToken else { return nil }
            let response = try await refreshSession(refreshToken: refreshToken)
            let newRefreshToken = response.refreshToken ?? refreshToken
            SessionStore.shared.saveTokens(accessToken: response.token, refreshToken: newRefreshToken)
            tokenUpdateHandler?(response.token, newRefreshToken)
            return response.token
        }
        inflightRefreshTask = task
        return try await task.value
    }

    private func shouldAttemptRefresh(for request: URLRequest) -> Bool {
        guard let url = request.url else { return false }
        if request.value(forHTTPHeaderField: "Authorization") == nil {
            return false
        }
        let path = url.path
        if path.contains("/auth/refresh") || path.contains("/auth/login") || path.contains("/auth/logout") {
            return false
        }
        return true
    }

    private static func accessTokenNearExpiry(_ token: String) -> Bool {
        let parts = token.split(separator: ".")
        guard parts.count == 3 else { return true }
        var base64 = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        guard let payloadData = Data(base64Encoded: base64),
              let json = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any],
              let exp = json["exp"] as? TimeInterval else {
            return true
        }
        return Date(timeIntervalSince1970: exp).timeIntervalSinceNow < proactiveRefreshMargin
    }

    func extractErrorMessage(from data: Data) -> String? {
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            return (json["error"] as? String) ?? (json["message"] as? String)
        }
        return nil
    }

    private func isAuthFailure(_ error: Error) -> Bool {
        if let httpError = error as? APIHTTPError {
            return httpError.statusCode == 401 || httpError.statusCode == 403
        }
        return false
    }
}
