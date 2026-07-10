import Foundation
import UIKit
import Security
import GoogleSignIn
import AuthenticationServices
import CryptoKit

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

        restoreHealthKitSettings()
        restoreSleepSyncSettings()
        restoreStepsSyncSettings()
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
        clearHealthKitSettings()
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

    /// Changes the user's email (direct, password-confirmed). Returns the resulting email
    /// so the caller can refresh its display. The web-parity addition (legacy iOS had no
    /// email field); the backend `PUT /auth/email` is the real boundary.
    @MainActor
    func changeEmail(newEmail: String, password: String) async throws -> String? {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }

        let response = try await APIClient.shared.changeEmail(token: token, newEmail: newEmail, password: password)
        return response.email
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

    // MARK: - Federated Sign-in (Google / Apple)

    /// Writes an authenticated `AuthResponse` into the shared context — the single session-write path
    /// shared by password login (`LoginView`), password sign-up (`CreateAccountView`) and federated
    /// sign-in. Extracted 1:1 from the former inline `handleLogin`/`handleCreateAccount` writes.
    @MainActor
    func applyAuthResponse(_ r: AuthResponse) async {
        let role = (r.globalRole ?? "").lowercased()
        authToken = r.token
        refreshToken = r.refreshToken
        globalRole = role.isEmpty ? "standard" : role
        loggedInUserId = r.memberId
        loggedInUsername = r.username
        if let name = r.memberName {
            loggedInUserName = name
            adminName = name
        } else if let uname = r.username {
            loggedInUserName = uname
            adminName = uname
        }
        await loadLookupData()
        persistSession()
    }

    /// Presents the Google sign-in sheet and returns the Google ID token (to POST to `/auth/oauth`).
    /// `GIDClientID` in Info.plist configures the client id; no manual `GIDConfiguration` needed.
    @MainActor
    func startGoogleSignIn(presenting: UIViewController) async throws -> String {
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenting)
        guard let idToken = result.user.idToken?.tokenString else {
            throw APIError(message: "Google sign-in did not return an ID token.")
        }
        return idToken
    }
}

/// Pending federated sign-up carried from `LoginView` (a `needs_profile` OAuth response) into
/// `CreateAccountView`'s social branch, which finishes registration via `/auth/oauth/complete`.
struct PendingSocial {
    let token: String
    let refreshToken: String?
    let email: String?
    let firstName: String?
    let lastName: String?
}

/// Resolves the current key window / top view controller for presenting the Google sheet + the
/// Sign-in-with-Apple authorization (both need a UIKit presentation anchor from SwiftUI).
@MainActor
enum AuthPresenter {
    static var keyWindow: UIWindow? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
    }

    static var rootViewController: UIViewController? {
        var top = keyWindow?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}

/// Sign-in-with-Apple crypto + credential helpers. Presentation is owned by SwiftUI's
/// `SignInWithAppleButton` (see `LoginView`); this type supplies the raw nonce (whose SHA256 is set
/// on the request), and decodes the returned credential into (idToken, fullName) for `/auth/oauth`.
enum AppleSignInCoordinator {
    /// A cryptographically-random nonce; its SHA256 goes on the request, the raw value goes to the
    /// backend for replay protection (matches Supabase's `signInWithIdToken` nonce contract).
    static func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remaining = length
        while remaining > 0 {
            var randoms = [UInt8](repeating: 0, count: 16)
            let status = SecRandomCopyBytes(kSecRandomDefault, randoms.count, &randoms)
            guard status == errSecSuccess else {
                fatalError("SecRandomCopyBytes failed: \(status)")
            }
            for random in randoms where remaining > 0 {
                if Int(random) < charset.count {
                    result.append(charset[Int(random)])
                    remaining -= 1
                }
            }
        }
        return result
    }

    static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// Extracts the identity token + first-auth name hints from an Apple authorization.
    static func decode(_ authorization: ASAuthorization) throws -> (idToken: String, fullName: PersonNameComponents?) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8) else {
            throw APIError(message: "Apple sign-in failed to return an identity token.")
        }
        return (idToken, credential.fullName)
    }
}
