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

    // New global-role-aware login; optional push_token and device_id for push notifications.
    func loginGlobal(identifier: String, password: String, pushToken: String? = nil, deviceId: String? = nil) async throws -> AuthResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/login/global"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: String] = ["identifier": identifier, "password": password]
        if let pushToken, !pushToken.isEmpty { body["push_token"] = pushToken }
        if let deviceId, !deviceId.isEmpty { body["device_id"] = deviceId }
        request.httpBody = try JSONEncoder().encode(body)

        let data = try await data(for: request)
        return try JSONDecoder().decode(AuthResponse.self, from: data)
    }

    /// Register the device for push notifications (call when user is already logged in and token is available).
    func registerDevice(token: String, pushToken: String) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("notifications/device"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let body = ["push_token": pushToken]
        request.httpBody = try JSONEncoder().encode(body)

        let (_, response) = try await rawData(for: request)
        guard 200..<300 ~= response.statusCode else {
            throw APIError(message: "Failed to register device for push")
        }
    }

    /// Unregister the device from push notifications (e.g. when user disables notifications in system settings).
    func deregisterDevice(token: String, pushToken: String?) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("notifications/device"))
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let pushToken, !pushToken.isEmpty {
            request.httpBody = try JSONEncoder().encode(["push_token": pushToken])
        }
        let (_, response) = try await rawData(for: request)
        guard 200..<300 ~= response.statusCode else {
            throw APIError(message: "Failed to unregister device for push")
        }
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
                      firstName: String? = nil, lastName: String? = nil,
                      pushToken: String? = nil, deviceId: String? = nil) async throws -> AuthResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/oauth"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: String] = ["provider": provider, "id_token": idToken]
        if let nonce { body["nonce"] = nonce }
        if let firstName, !firstName.isEmpty { body["first_name"] = firstName }
        if let lastName, !lastName.isEmpty { body["last_name"] = lastName }
        if let pushToken, !pushToken.isEmpty { body["push_token"] = pushToken }
        if let deviceId, !deviceId.isEmpty { body["device_id"] = deviceId }
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
        let body = ["refresh_token": refreshToken]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await rawData(for: request)
        guard 200..<300 ~= response.statusCode else {
            let message = extractErrorMessage(from: data) ?? "Request failed (\(response.statusCode))"
            throw APIHTTPError(statusCode: response.statusCode, message: message)
        }
        return try JSONDecoder().decode(TokenRefreshResponse.self, from: data)
    }

    func logout(refreshToken: String) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/logout"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = ["refresh_token": refreshToken]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await rawData(for: request)
        guard 200..<300 ~= response.statusCode else {
            let message = extractErrorMessage(from: data) ?? "Request failed (\(response.statusCode))"
            throw APIError(message: message)
        }
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

    // Auth phase-2 (D-C10) — manage linked sign-in identities. All authenticated. link/unlink thread the
    // caller's refresh token so the backend can bind the session (linkIdentityIdToken / unlinkIdentity).
    func listIdentities(token: String) async throws -> IdentitiesResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/identities"))
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let data = try await data(for: request)
        return try JSONDecoder().decode(IdentitiesResponse.self, from: data)
    }

    func linkProvider(token: String, refreshToken: String, provider: String, idToken: String, nonce: String? = nil) async throws -> IdentitiesResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/link"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        var body: [String: String] = ["provider": provider, "id_token": idToken, "refresh_token": refreshToken]
        if let nonce { body["nonce"] = nonce }
        request.httpBody = try JSONEncoder().encode(body)
        let data = try await data(for: request)
        return try JSONDecoder().decode(IdentitiesResponse.self, from: data)
    }

    func unlinkProvider(token: String, refreshToken: String, provider: String) async throws -> IdentitiesResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/unlink"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(["provider": provider, "refresh_token": refreshToken])
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
