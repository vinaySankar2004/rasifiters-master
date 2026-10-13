import Foundation

extension APIClient {

    struct TokenRefreshResponse: Decodable {
        let token: String
        let refreshToken: String?

        enum CodingKeys: String, CodingKey {
            case token
            case refreshToken = "refresh_token"
        }
    }

    struct RegisterResponse: Decodable {
        let message: String?
        let memberId: String?
        let username: String?
        let memberName: String?

        enum CodingKeys: String, CodingKey {
            case message
            case memberId = "member_id"
            case username
            case memberName = "member_name"
        }
    }

    struct ChangePasswordResponse: Decodable {
        let message: String
    }

    struct ForgotPasswordResponse: Decodable {
        let message: String?
    }

    struct ChangeEmailResponse: Decodable {
        let message: String?
        let email: String?
    }

    struct DeleteAccountResponse: Decodable {
        let message: String
    }

    // Legacy login (kept if needed elsewhere)
    func login(username: String, password: String) async throws -> AuthResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/login"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = ["username": username, "password": password]
        request.httpBody = try JSONEncoder().encode(body)

        let data = try await data(for: request)
        return try JSONDecoder().decode(AuthResponse.self, from: data)
    }

    /// Mobile login. Waits for the device-registry queue first (notifications §3.1 ordering rule), then sends the
    /// registration ride-along (`push_token`, `device_id`, `platform`).
    func loginGlobal(identifier: String, password: String) async throws -> AuthResponse {
        await DeviceRegistry.shared.beginSignIn()
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/login/global"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body = DeviceRegistry.shared.signInFields()
        body["identifier"] = identifier
        body["password"] = password
        request.httpBody = try JSONEncoder().encode(body)
        let data = try await data(for: request)
        return try JSONDecoder().decode(AuthResponse.self, from: data)
    }

    /// PUT /notifications/device (notifications §3.1): Bearer + `{ push_token, platform: "ios", device_id }`.
    func registerDevice(pushToken: String, deviceId: String?) async throws {
        var request = authorizedRequest("notifications/device", method: "PUT")
        var body = ["push_token": pushToken, "platform": "ios"]
        if let deviceId { body["device_id"] = deviceId }
        request.httpBody = try JSONEncoder().encode(body)
        _ = try await data(for: request)
    }

    /// POST /notifications/device/unregister — NO login (the push token / install id prove the device). Returns the
    /// HTTP status; throws only on a transport error.
    func unregisterDevice(pushToken: String?, deviceId: String?) async throws -> Int {
        var request = URLRequest(url: baseURL.appendingPathComponent("notifications/device/unregister"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: String] = [:]
        if let pushToken { body["push_token"] = pushToken }
        if let deviceId { body["device_id"] = deviceId }
        request.httpBody = try JSONEncoder().encode(body)
        return try await transport(request).1.statusCode
    }

    func registerAccount(
        firstName: String,
        lastName: String,
        username: String,
        email: String,
        password: String,
        gender: String?
    ) async throws -> RegisterResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/register"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: String] = [
            "first_name": firstName,
            "last_name": lastName,
            "username": username,
            "email": email,
            "password": password
        ]
        if let gender, !gender.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            body["gender"] = gender
        }

        request.httpBody = try JSONEncoder().encode(body)

        let data = try await data(for: request)
        return try JSONDecoder().decode(RegisterResponse.self, from: data)
    }

    /// Federated sign-in — POST auth/oauth. `firstName`/`lastName` are Apple first-auth name hints
    /// (Apple returns the name ONLY on the first authorization, so forward them when present).
    func socialSignIn(provider: String, idToken: String, nonce: String? = nil,
                      firstName: String? = nil, lastName: String? = nil) async throws -> AuthResponse {
        await DeviceRegistry.shared.beginSignIn()
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/oauth"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body = DeviceRegistry.shared.signInFields()
        body["provider"] = provider
        body["id_token"] = idToken
        if let nonce { body["nonce"] = nonce }
        if let firstName, !firstName.isEmpty { body["first_name"] = firstName }
        if let lastName, !lastName.isEmpty { body["last_name"] = lastName }
        request.httpBody = try JSONEncoder().encode(body)
        let data = try await data(for: request)
        return try JSONDecoder().decode(AuthResponse.self, from: data)
    }

    /// Finish a new federated sign-up — POST auth/oauth/complete. The pending access_token is sent as
    /// the Bearer; the pending refresh_token is re-sent in the body (the backend rotates the session).
    func completeSocialRegistration(pendingToken: String, refreshToken: String?, username: String,
                                    gender: String?, firstName: String?, lastName: String?) async throws -> AuthResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/oauth/complete"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(pendingToken)", forHTTPHeaderField: "Authorization")
        var body: [String: String] = ["username": username]
        if let gender, !gender.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { body["gender"] = gender }
        if let firstName, !firstName.isEmpty { body["first_name"] = firstName }
        if let lastName, !lastName.isEmpty { body["last_name"] = lastName }
        if let refreshToken, !refreshToken.isEmpty { body["refresh_token"] = refreshToken }
        request.httpBody = try JSONEncoder().encode(body)

        let data = try await data(for: request)
        return try JSONDecoder().decode(AuthResponse.self, from: data)
    }

    /// Triggers a Supabase password-reset email via the Express proxy. Privacy-safe: the backend always
    /// returns a generic 200 regardless of whether the email maps to an account (no enumeration), so the
    /// caller shows the same confirmation either way. Mirrors the web `POST /auth/forgot-password` flow.
    func requestPasswordReset(email: String) async throws -> ForgotPasswordResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/forgot-password"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["email": email])
        let data = try await data(for: request)
        return try JSONDecoder().decode(ForgotPasswordResponse.self, from: data)
    }

    func refreshSession(refreshToken: String) async throws -> TokenRefreshResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/refresh"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["refresh_token": refreshToken])
        let (data, http) = try await transport(request)
        guard 200..<300 ~= http.statusCode else { throw APIHTTPError.from(data, http) }
        return try JSONDecoder().decode(TokenRefreshResponse.self, from: data)
    }

    /// POST /auth/logout — this device only (auth D-C14): the captured Bearer AND the body refresh token. Best-effort.
    func logout(accessToken: String, refreshToken: String?) async {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/logout"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        if let refreshToken { request.httpBody = try? JSONEncoder().encode(["refresh_token": refreshToken]) }
        _ = try? await transport(request)
    }

    /// POST /auth/logout-all — "Sign out everywhere" (auth §3.1). 200 → the caller runs the teardown.
    func logoutAll() async throws {
        _ = try await data(for: authorizedRequest("auth/logout-all", method: "POST"))
    }

    /// Changes the password for the authenticated user
    func changePassword(token: String, newPassword: String) async throws -> ChangePasswordResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/change-password"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let body = ["new_password": newPassword]
        request.httpBody = try JSONEncoder().encode(body)
        let data = try await data(for: request)
        return try JSONDecoder().decode(ChangePasswordResponse.self, from: data)
    }

    /// Changes the email for the authenticated user. Direct, password-confirmed change
    /// (no verification email) — mirrors the web `PUT /auth/email` flow: the backend
    /// re-authenticates with the current password, then updates Supabase + `member_emails`.
    func changeEmail(token: String, newEmail: String, password: String) async throws -> ChangeEmailResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/email"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let body = ["new_email": newEmail, "password": password]
        request.httpBody = try JSONEncoder().encode(body)
        let data = try await data(for: request)
        return try JSONDecoder().decode(ChangeEmailResponse.self, from: data)
    }

    /// Permanently deletes the authenticated user's account and all associated data
    func deleteAccount(token: String) async throws -> DeleteAccountResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/account"))
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(DeleteAccountResponse.self, from: data)
    }

    // Auth phase-2 (D-C10) — manage linked sign-in identities. All authenticated. Since auth 0.13.0 (D-C14c) the
    // backend binds link / unlink to the Bearer alone — no `refresh_token` in the body (approval amendment A8).
    func listIdentities(token: String) async throws -> IdentitiesResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/identities"))
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let data = try await data(for: request)
        return try JSONDecoder().decode(IdentitiesResponse.self, from: data)
    }

    func linkProvider(token: String, provider: String, idToken: String, nonce: String? = nil) async throws -> IdentitiesResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/link"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        var body: [String: String] = ["provider": provider, "id_token": idToken]
        if let nonce { body["nonce"] = nonce }
        request.httpBody = try JSONEncoder().encode(body)
        let data = try await data(for: request)
        return try JSONDecoder().decode(IdentitiesResponse.self, from: data)
    }

    func unlinkProvider(token: String, provider: String) async throws -> IdentitiesResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/unlink"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(["provider": provider])
        let data = try await data(for: request)
        return try JSONDecoder().decode(IdentitiesResponse.self, from: data)
    }

    func setPassword(token: String, newPassword: String) async throws -> IdentitiesResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/set-password"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(["new_password": newPassword])
        let data = try await data(for: request)
        return try JSONDecoder().decode(IdentitiesResponse.self, from: data)
    }
}
