import Foundation
import Security

/// The ONE token store (auth §3.1 client rules 1 + 4). The access + refresh pair is ONE keychain item (atomic save);
/// the decoded pair is cached here, written through on save / clear, so a request never costs a keychain call
/// (`ProgramContext.authToken` is a UI mirror written only from here). It also owns the `session.*` defaults, so a
/// scene-less teardown (a HealthKit background wake) can clear them.
final class SessionStore {
    static let shared = SessionStore()
    private init() {}

    /// The pair + when this device received it: expiry = `receivedAt` + the token's own lifetime (`exp − iat`), so a
    /// wrong device clock never makes every request refresh (approval amendment A3). nil `receivedAt` (a pair moved
    /// from the pre-1.5 store) = unknown age → refreshed on first use.
    struct Tokens: Codable {
        let access: String
        let refresh: String?
        var receivedAt: Date?
    }

    enum Read {
        case tokens(Tokens)
        case signedOut
        case locked             // not readable right now (before the first unlock, or a transient keychain status)
        case unreadable         // the stored item decodes to nothing usable → forced sign-out (token_store_unreadable)
    }

    enum Keys {
        static let userId = "session.userId"
        static let userName = "session.userName"
        static let username = "session.username"
        static let userGender = "session.userGender"
        static let globalRole = "session.globalRole"
        static let programId = "session.programId"
        static let programRole = "session.programRole"
        static let all = [userId, userName, username, userGender, globalRole, programId, programRole]
    }

    private let pairAccount = "auth.session"
    private let legacyAccessAccount = "auth.access_token"      // pre-1.5 two-item store (WhenUnlocked)
    private let legacyRefreshAccount = "auth.refresh_token"
    /// `.tokens` / `.signedOut` only — `.locked` and `.unreadable` are always read again.
    private var cached: Read?

    /// Bumped by `clear()`. An in-flight refresh that started before a sign-out never writes its tokens back.
    private(set) var epoch = 0

    func read() -> Read {
        if let cached { return cached }
        let result = readKeychain()
        switch result {
        case .tokens, .signedOut: cached = result
        case .locked, .unreadable: break
        }
        return result
    }

    var tokens: Tokens? {
        if case .tokens(let tokens) = read() { return tokens }
        return nil
    }
    var accessToken: String? { tokens?.access }
    var refreshToken: String? { tokens?.refresh }
    var memberId: String? { UserDefaults.standard.string(forKey: Keys.userId) }
    var isGlobalAdmin: Bool { UserDefaults.standard.string(forKey: Keys.globalRole) == "global_admin" }

    /// A sign-in or a refresh. The in-memory pair is updated even when the keychain write fails (a rotated refresh
    /// token must never be lost for this launch); the failure is still thrown so a sign-in can refuse it.
    func save(access: String, refresh: String?) throws {
        let tokens = Tokens(access: access, refresh: refresh, receivedAt: Date())
        cached = .tokens(tokens)
        let status = persist(tokens)
        guard status == errSecSuccess else { throw KeychainService.Failure(status: status) }
    }

    /// Tokens + every `session.*` default (the sign-out teardown).
    func clear() {
        epoch += 1
        KeychainService.delete(pairAccount)
        KeychainService.delete(legacyAccessAccount)
        KeychainService.delete(legacyRefreshAccount)
        Keys.all.forEach { UserDefaults.standard.removeObject(forKey: $0) }
        cached = .signedOut
    }

    private func persist(_ tokens: Tokens) -> OSStatus {
        guard let data = try? JSONEncoder().encode(tokens) else { return errSecParam }
        return KeychainService.write(data, for: pairAccount)
    }

    /// Only a stored item that decodes to nothing usable is `unreadable`; any other keychain status keeps the session
    /// and reads again later (A3, C2#3).
    private func readKeychain() -> Read {
        switch KeychainService.read(pairAccount) {
        case .found(let data):
            guard let tokens = try? JSONDecoder().decode(Tokens.self, from: data) else { return .unreadable }
            return Self.usable(tokens)
        case .notFound:
            return migrateLegacyItems()
        case .locked, .failure:
            return .locked
        }
    }

    /// An access token without a refresh token can never be renewed → unreadable (A3).
    private static func usable(_ tokens: Tokens) -> Read {
        guard !tokens.access.isEmpty, let refresh = tokens.refresh, !refresh.isEmpty else { return .unreadable }
        return .tokens(tokens)
    }

    /// One-time move of the pre-1.5 two-item store into the pair item (re-saved with the new accessibility).
    private func migrateLegacyItems() -> Read {
        switch (KeychainService.read(legacyAccessAccount), KeychainService.read(legacyRefreshAccount)) {
        case (.notFound, _):
            return .signedOut
        case (.found(let accessData), .found(let refreshData)):
            guard let access = String(data: accessData, encoding: .utf8),
                  let refresh = String(data: refreshData, encoding: .utf8) else { return .unreadable }
            let tokens = Tokens(access: access, refresh: refresh, receivedAt: nil)
            let result = Self.usable(tokens)
            if case .tokens = result, persist(tokens) == errSecSuccess {
                KeychainService.delete(legacyAccessAccount)
                KeychainService.delete(legacyRefreshAccount)
            }
            return result
        case (.found, .notFound):
            return .unreadable
        default:
            return .locked
        }
    }
}
