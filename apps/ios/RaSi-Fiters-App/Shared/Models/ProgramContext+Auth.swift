import Foundation
import UIKit
import Security
import GoogleSignIn
import AuthenticationServices
import CryptoKit

extension ProgramContext {
    // MARK: - Session Persistence & Auth

    func configureAPIClientHandlers() {
        APIClient.shared.tokenUpdateHandler = { [weak self] access, refresh in
            self?.authToken = access            // UI mirror only — SessionStore already holds the pair
            self?.refreshToken = refresh
        }
        APIClient.shared.updateRequiredHandler = { [weak self] in self?.isUpdateRequired = true }
    }

    func restorePersistedSession() {
        switch SessionStore.shared.read() {
        case .tokens(let tokens):
            authToken = tokens.access
            refreshToken = tokens.refresh
        case .signedOut, .locked:
            authToken = nil                         // locked: read again on unlock / next foreground (D-IOS-AUTH-3)
            refreshToken = nil
        case .unreadable:
            authToken = nil
            refreshToken = nil
            SessionTeardown.end(.forced(reason: "token_store_unreadable", status: nil, code: nil))
        }

        let defaults = UserDefaults.standard
        loggedInUserId = defaults.string(forKey: SessionStore.Keys.userId)
        loggedInUserName = defaults.string(forKey: SessionStore.Keys.userName)
        loggedInUsername = defaults.string(forKey: SessionStore.Keys.username)
        loggedInUserGender = defaults.string(forKey: SessionStore.Keys.userGender)
        globalRole = defaults.string(forKey: SessionStore.Keys.globalRole) ?? globalRole
        programId = defaults.string(forKey: SessionStore.Keys.programId)
        loggedInUserProgramRole = defaults.string(forKey: SessionStore.Keys.programRole) ?? loggedInUserProgramRole

        if let name = loggedInUserName {
            adminName = name
        }

        reloadHealthSyncMirror()
    }

    /// The session.* defaults only — tokens live in SessionStore and are never written back from here (W1 F2).
    func persistSession() {
        let defaults = UserDefaults.standard
        setDefault(defaults, value: loggedInUserId, key: SessionStore.Keys.userId)
        setDefault(defaults, value: loggedInUserName, key: SessionStore.Keys.userName)
        setDefault(defaults, value: loggedInUsername, key: SessionStore.Keys.username)
        setDefault(defaults, value: loggedInUserGender, key: SessionStore.Keys.userGender)
        setDefault(defaults, value: globalRole, key: SessionStore.Keys.globalRole)
        setDefault(defaults, value: programId, key: SessionStore.Keys.programId)
        setDefault(defaults, value: loggedInUserProgramRole, key: SessionStore.Keys.programRole)
    }

    private func setDefault(_ defaults: UserDefaults, value: String?, key: String) {
        if let value {
            defaults.set(value, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
    }

    /// Changes the user's password
    /// auth §3.1 rule 6: never auto-retried — the only retry is APIClient's 401 → refresh → once (the write never ran).
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

        // Clear all local state after successful deletion (device rows cascade server-side).
        SessionTeardown.end(.accountDeleted)
    }

    // MARK: - Federated Sign-in (Google / Apple)

    /// The single session-write path (password login, sign-up, federated). Tokens go to SessionStore FIRST and the
    /// member defaults + this member's sync prefs load BEFORE the `authToken` mirror flips (that flip starts the
    /// session work). A keychain that refuses the pair fails the sign-in (nothing half-saved).
    @MainActor
    func applyAuthResponse(_ r: AuthResponse) async throws {
        do {
            try SessionStore.shared.save(access: r.token, refresh: r.refreshToken)
        } catch {
            SessionStore.shared.clear()
            throw error
        }
        SessionTeardown.clearForcedSignOutNotice()          // A2: every successful sign-in path, social sign-up included
        let role = (r.globalRole ?? "").lowercased()
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
        persistSession()
        reloadHealthSyncMirror()
        refreshToken = r.refreshToken
        authToken = r.token
        await loadLookupData()
    }

    /// Presents the Google sign-in sheet and returns the Google ID token + the raw nonce (to POST to
    /// `/auth/oauth`). `GIDClientID` in Info.plist configures the client id; no manual `GIDConfiguration`
    /// needed. GoogleSignIn iOS embeds a nonce in the id_token, and Supabase's `signInWithIdToken`
    /// requires the passed nonce and the token's nonce to BOTH exist and match — so we mirror the Apple
    /// flow: hand GoogleSignIn the SHA256 of a raw nonce (Google echoes it verbatim into the token) and
    /// forward the RAW nonce to the backend (GoTrue re-hashes it and compares). Without this the backend
    /// passes no nonce while the token has one → "Passed nonce and nonce in id_token should either both
    /// exist or not."
    @MainActor
    func startGoogleSignIn(presenting: UIViewController) async throws -> (idToken: String, nonce: String) {
        let rawNonce = AppleSignInCoordinator.randomNonceString()
        let hashedNonce = AppleSignInCoordinator.sha256(rawNonce)
        let result = try await GIDSignIn.sharedInstance.signIn(
            withPresenting: presenting,
            hint: nil,
            additionalScopes: nil,
            nonce: hashedNonce
        )
        guard let idToken = result.user.idToken?.tokenString else {
            throw APIError(message: "Google sign-in did not return an ID token.")
        }
        return (idToken, rawNonce)
    }

    /// Runs OUR OWN Sign-in-with-Apple flow (custom pill button, not Apple's widget): builds an
    /// `ASAuthorizationController`, presents it, and returns the identity token + raw nonce + the
    /// first-auth name hints (to POST to `/auth/oauth`). The coordinator retains itself for the
    /// flow's duration, so no stored property on `ProgramContext` is needed. Throws
    /// `ASAuthorizationError.canceled` when the user dismisses (callers swallow that case).
    @MainActor
    func startAppleSignIn() async throws -> (idToken: String, nonce: String, firstName: String?, lastName: String?) {
        let coordinator = AppleSignInCoordinator()
        let result = try await coordinator.start()
        return (result.idToken, result.nonce, result.fullName?.givenName, result.fullName?.familyName)
    }

    // MARK: - Linked sign-in methods (auth phase-2, D-C10)

    @MainActor
    func fetchIdentities() async throws -> IdentitiesResponse {
        guard let token = authToken, !token.isEmpty else { throw APIError(message: "No auth token") }
        return try await APIClient.shared.listIdentities(token: token)
    }

    // Link / unlink need only the Bearer since auth 0.13.0 (D-C14c) — no refresh-token guard (amendment A8).
    @MainActor
    func linkGoogle() async throws -> IdentitiesResponse {
        guard let token = authToken, !token.isEmpty else { throw APIError(message: "No auth token") }
        guard let presenter = AuthPresenter.rootViewController else { throw APIError(message: "Unable to present Google sign-in.") }
        let google = try await startGoogleSignIn(presenting: presenter)
        return try await APIClient.shared.linkProvider(token: token, provider: "google", idToken: google.idToken, nonce: google.nonce)
    }

    @MainActor
    func linkApple() async throws -> IdentitiesResponse {
        guard let token = authToken, !token.isEmpty else { throw APIError(message: "No auth token") }
        let apple = try await startAppleSignIn()
        return try await APIClient.shared.linkProvider(token: token, provider: "apple", idToken: apple.idToken, nonce: apple.nonce)
    }

    @MainActor
    func unlink(provider: String) async throws -> IdentitiesResponse {
        guard let token = authToken, !token.isEmpty else { throw APIError(message: "No auth token") }
        return try await APIClient.shared.unlinkProvider(token: token, provider: provider)
    }

    /// auth §3.1 rule 6: never auto-retried — the only retry is APIClient's 401 → refresh → once (the write never ran).
    @MainActor
    func setPassword(newPassword: String) async throws -> IdentitiesResponse {
        guard let token = authToken, !token.isEmpty else { throw APIError(message: "No auth token") }
        return try await APIClient.shared.setPassword(token: token, newPassword: newPassword)
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
    /// `google` | `apple` — the `auth.sign_in_failed` method of a failed `/oauth/complete` (A11).
    let provider: String
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

/// Standalone Sign-in-with-Apple controller. Drives OUR OWN custom pill button (the native
/// `SignInWithAppleButton` widget is gone): generates the raw nonce (whose SHA256 is set on the
/// request), runs an `ASAuthorizationController`, and returns (idToken, rawNonce, fullName) via an
/// async continuation. Retains itself (`selfRetain`) and the controller for the flow's duration so
/// neither is deallocated mid-request; both are released once the continuation resolves.
final class AppleSignInCoordinator: NSObject {
    typealias AppleCredentials = (idToken: String, nonce: String, fullName: PersonNameComponents?)

    private var continuation: CheckedContinuation<AppleCredentials, Error>?
    private var rawNonce: String = ""
    private var controller: ASAuthorizationController?
    private var selfRetain: AppleSignInCoordinator?

    /// Presents the Apple authorization sheet and suspends until it completes, is cancelled, or
    /// errors. `request.nonce` carries the SHA256 of the raw nonce; the raw value is returned so the
    /// caller can forward it to the backend (matches Supabase's `signInWithIdToken` nonce contract).
    @MainActor
    func start() async throws -> AppleCredentials {
        let nonce = Self.randomNonceString()
        rawNonce = nonce

        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(nonce)

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            self.selfRetain = self
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.controller = controller
            controller.performRequests()
        }
    }

    /// Releases the flow-scoped strong references once the continuation has resolved.
    private func finish() {
        continuation = nil
        controller = nil
        selfRetain = nil
    }

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
}

extension AppleSignInCoordinator: ASAuthorizationControllerDelegate {
    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8) else {
            continuation?.resume(throwing: APIError(message: "Apple sign-in failed to return an identity token."))
            finish()
            return
        }
        continuation?.resume(returning: (idToken, rawNonce, credential.fullName))
        finish()
    }

    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithError error: Error) {
        continuation?.resume(throwing: error)
        finish()
    }
}

extension AppleSignInCoordinator: ASAuthorizationControllerPresentationContextProviding {
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        AuthPresenter.keyWindow ?? ASPresentationAnchor()
    }
}
