import Foundation

extension ProgramContext {
    // MARK: - Session Persistence & Auth

    private enum SessionDefaultsKeys {
        static let userId = "session.userId"
        static let userName = "session.userName"
        static let username = "session.username"
        static let userGender = "session.userGender"
        static let globalRole = "session.globalRole"
        static let programId = "session.programId"
        static let programRole = "session.programRole"
    }

    func configureAPIClientHandlers() {
        APIClient.shared.tokenUpdateHandler = { [weak self] accessToken, refreshToken in
            Task { @MainActor in
                self?.authToken = accessToken
                self?.refreshToken = refreshToken
                self?.persistSession()
            }
        }

        APIClient.shared.authFailureHandler = { [weak self] in
            Task { @MainActor in
                self?.signOut()
            }
        }
    }

    func restorePersistedSession() {
        authToken = SessionStore.shared.accessToken
        refreshToken = SessionStore.shared.refreshToken

        let defaults = UserDefaults.standard
        loggedInUserId = defaults.string(forKey: SessionDefaultsKeys.userId)
        loggedInUserName = defaults.string(forKey: SessionDefaultsKeys.userName)
        loggedInUsername = defaults.string(forKey: SessionDefaultsKeys.username)
        loggedInUserGender = defaults.string(forKey: SessionDefaultsKeys.userGender)
        globalRole = defaults.string(forKey: SessionDefaultsKeys.globalRole) ?? globalRole
        programId = defaults.string(forKey: SessionDefaultsKeys.programId)
        loggedInUserProgramRole = defaults.string(forKey: SessionDefaultsKeys.programRole) ?? loggedInUserProgramRole

        if let name = loggedInUserName {
            adminName = name
        }
    }

    func persistSession() {
        SessionStore.shared.saveTokens(accessToken: authToken, refreshToken: refreshToken)

        let defaults = UserDefaults.standard
        setDefault(defaults, value: loggedInUserId, key: SessionDefaultsKeys.userId)
        setDefault(defaults, value: loggedInUserName, key: SessionDefaultsKeys.userName)
        setDefault(defaults, value: loggedInUsername, key: SessionDefaultsKeys.username)
        setDefault(defaults, value: loggedInUserGender, key: SessionDefaultsKeys.userGender)
        setDefault(defaults, value: globalRole, key: SessionDefaultsKeys.globalRole)
        setDefault(defaults, value: programId, key: SessionDefaultsKeys.programId)
        setDefault(defaults, value: loggedInUserProgramRole, key: SessionDefaultsKeys.programRole)
    }

    private func clearPersistedSession() {
        SessionStore.shared.clearTokens()
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: SessionDefaultsKeys.userId)
        defaults.removeObject(forKey: SessionDefaultsKeys.userName)
        defaults.removeObject(forKey: SessionDefaultsKeys.username)
        defaults.removeObject(forKey: SessionDefaultsKeys.userGender)
        defaults.removeObject(forKey: SessionDefaultsKeys.globalRole)
        defaults.removeObject(forKey: SessionDefaultsKeys.programId)
        defaults.removeObject(forKey: SessionDefaultsKeys.programRole)
    }

    private func setDefault(_ defaults: UserDefaults, value: String?, key: String) {
        if let value {
            defaults.set(value, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
    }

    @MainActor
    func refreshSessionIfNeeded() async {
        guard let refreshToken, !refreshToken.isEmpty else { return }
        do {
            try await performTokenRefresh(using: refreshToken)
        } catch {
            if isNetworkError(error) {
                isOffline = true
                if offlineNotice == nil {
                    offlineNotice = "You're offline. We'll reconnect when internet is back."
                }
                return
            }
            if isAuthFailure(error) {
                // Retry once: another call may have rotated the token already
                try? await Task.sleep(nanoseconds: 300_000_000)
                if let retryToken = SessionStore.shared.refreshToken,
                   retryToken != refreshToken {
                    do {
                        try await performTokenRefresh(using: retryToken)
                        return
                    } catch {}
                }
                signOut()
                return
            }
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func performTokenRefresh(using token: String) async throws {
        let response = try await APIClient.shared.refreshSession(refreshToken: token)
        authToken = response.token
        refreshToken = response.refreshToken ?? token
        persistSession()
        isOffline = false
        offlineNotice = nil
        await loadLookupData()
        if programId != nil {
            await loadMembershipDetails()
        }
    }

    func signOut() {
        let tokenToRevoke = refreshToken
        authToken = nil
        refreshToken = nil
        loggedInUserId = nil
        loggedInUserName = nil
        loggedInUsername = nil
        loggedInUserGender = nil
        loggedInUserProgramRole = "member"
        globalRole = "standard"
        programId = nil
        membershipDetails = []
        pendingInvites = []
        isOffline = false
        offlineNotice = nil

        stopNotificationStream()
        clearPersistedSession()

        if let tokenToRevoke {
            Task {
                try? await APIClient.shared.logout(refreshToken: tokenToRevoke)
            }
        }
    }

    /// Changes the user's password
    @MainActor
    func changePassword(newPassword: String) async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }

        _ = try await APIClient.shared.changePassword(token: token, newPassword: newPassword)
    }

    /// Permanently deletes the user's account and all associated data
    @MainActor
    func deleteAccount() async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }

        _ = try await APIClient.shared.deleteAccount(token: token)

        // Clear all local state after successful deletion
        signOut()
    }

    private func isNetworkError(_ error: Error) -> Bool {
        if error is URLError { return true }
        let nsError = error as NSError
        return nsError.domain == NSURLErrorDomain
    }

    private func isAuthFailure(_ error: Error) -> Bool {
        if let httpError = error as? APIHTTPError {
            return httpError.statusCode == 401 || httpError.statusCode == 403
        }
        return false
    }

    /// Call when device push token is available and user is logged in; registers the token with the backend.
    func registerPushTokenIfNeeded(_ deviceToken: String) {
        guard let token = authToken, !token.isEmpty, !deviceToken.isEmpty else { return }
        Task {
            try? await APIClient.shared.registerDevice(token: token, pushToken: deviceToken)
        }
    }
}
