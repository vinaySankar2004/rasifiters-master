# Phase 3 track C2 — plan

# PLAN: Reliability overhaul Phase 3 client half, track C2 (iOS)

Sessions, HealthKit sync v2, push and invites, kit adoption with instant opens, the version gate, and events.

**Brief accepted:** yes. The plan touches 60 files:
- 35 existing Swift files are edited.
- 2 briefed files are renamed with `git mv` (the brief allows renames):
  - `Shared/Services/HealthKitAppliedLedger.swift` becomes `Shared/Services/HealthSyncPrefs.swift`.
  - `Shared/Models/ProgramContext+HealthKitWindows.swift` becomes `Shared/Services/HealthSyncPlanner.swift`.
- The 9 new files the brief lists are added. Nothing else is added.
- Also: the pbxproj, `apps/ios/CONTEXT.md` and 12 iOS page SPECs.
- 4 briefed files need no edit: `AppleHealthSettingsView`, `HealthSyncConfirmationView`, `PendingSyncConfirmation`, `HealthKitSyncNotifier`.

**Feature/version prediction:**

| Feature | Bump | Why |
|---|---|---|
| apple-health | 0.7.0 → 0.8.0 (MINOR) | Sync moves onto health-sync v2: D-SUM ledger, POST→409→PUT, the 14-day window and D-CONF's reconnect re-gate are retired. |
| health-sync | 0.1.0 → 0.2.0 (MINOR) | `consumed_by` gains `ios`. |
| observability | 0.2.2 → 0.3.0 (MINOR) | `consumed_by` gains `ios`. |
| frontend-kit | 0.1.0 → 0.2.0 (MINOR) | iOS adoption. |
| auth | 0.13.0 → 0.13.1 (PATCH) | iOS client notes. |
| notifications | 0.4.0 → 0.4.1 (PATCH) | iOS client notes. |
| invites | 0.2.0 → 0.2.1 (PATCH) | iOS client notes. |
| app-config | 0.2.0 → 0.2.1 (PATCH) | iOS client notes. |
| 12 iOS page SPECs | MINOR each | |
| iOS binary | 1.4.3 (57) → **1.5.0 (58)** | **USER DECISION**, recommended. |

**Surfaces in scope:** [ios] only. Backend, web and Android are untouched, and no backend change is needed.

**Verdict fixes in this revision:**
- **#1 (BLOCKING):** the rule-9 upgrade now runs **before** `GET /state`.
- **#2:** a foreground re-reads a keychain that was locked at launch.
- **#3:** a kind with no selected programs is skipped; workouts with no resolvable program window hold the anchor (as 1.4 did).
- **#4:** pull-to-refresh awaits the sync run. A run that lands data bumps `summaryRefreshToken`. Background wakes are never dropped or merged into a run already in flight.
- **#5:** a session-ended guard sits before any hook, PUT or anchor write.
- **#6:** the legacy migration waits until a member is signed in.
- **#7:** Disconnect writes nothing to the server and keeps exclusions (rule 6 wins).
- **#8:** "Sign out everywhere" becomes an `AccountMenuSheet` row.
- **#9:** the SSE session is invalidated on close.
- **#10:** `SessionStore` caches the decoded token pair (write-through).
- **#11:**
  - (a) refresh back-off resets on teardown;
  - (b) `error_class` is mapped onto the allowed set;
  - (c) "Last Synced" doesn't move while a kind is held;
  - (d) the §3.2 amendment is listed for the orchestrator.
- **#12:** the two renames above; every new file stays at about 200 lines or fewer.
- **#13:** no store access inside `async let`, and no `attempt` helper.

**Conventions for every step:**
- The app target uses `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, Swift 5 mode and approachable concurrency, so every type is implicitly `@MainActor`.
  - Do **not** add `nonisolated` or `actor`.
  - Leave Sendable/capture warnings alone.
- New and renamed files are picked up automatically by `PBXFileSystemSynchronizedRootGroup`. Use `git mv` / `git rm`.
- Paths below are relative to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/`.
- Commit each numbered step on its own via `git-version`.

## Decisions resolved (mirror on C1 and C3)

1. **"Sign out everywhere" is a row in `AccountMenuSheet`, directly under Sign Out.** It uses the existing row idiom, so no page changes look.
   - Copy, identical on all three tracks:
     - Row: "Sign out everywhere"
     - Alert title: "Sign out everywhere?"
     - Alert message: "You'll be signed out of RaSi Fiters on all your devices, including this one."
     - Buttons: destructive "Sign out everywhere", plus "Cancel".
2. **Sign-out pauses health sync.** Per-member prefs (toggles, programs, anchor, exclusions) are kept, and the observers stop. The same member resumes after signing in (rule 7, D-8).
3. **Disconnect (D-IOS-SYNC-3)** clears this kind's toggle, program selection, status line and connect date, and for workouts the anchor.
   - It **keeps** exclusions and the upgrade marker, and sends nothing to the server.
   - A reconnect resumes from `last_success_at` (rule 4). There is no review when any integration's `review_done_at` is set: rule 6 ("never again, not on this device, not on another device") supersedes D-CONF's "reconnect re-gates".
4. **A push tap acknowledges and re-fetches, with no new navigation (D-IOS-PUSH-2).** This is what iOS does today. `program.invite_received` (tapped or arriving in the foreground) refreshes the inbox.
5. **Invite success copy is "Invitation sent"** (invites §3.1).
6. **Password writes may take the central path 401 → refresh → one retry**, because a 401 means `PUT /user` never ran. They are never retried after a 503, a 5xx or a timeout.
7. **Binary version is the USER'S decision.** Recommended: **1.5.0 (58)** (step 7.1). Alternative: 1.4.3 (58), which only bumps the build number.

## Steps — ios

### Step 1: Sessions (auth §3.1) and `auth.*` events

**1a: plumbing. ⌘B checkpoint at the end.**

1. **`Shared/Services/KeychainService.swift`**: replace the whole file.
```swift
import Foundation
import Security

/// Generic-password keychain items: the session pair (`SessionStore`) and the install id (`DeviceRegistry`).
/// auth §3.1 / notifications §3.1: every item is `AfterFirstUnlockThisDeviceOnly` (never restored onto another device;
/// readable by a background launch once the phone was unlocked after boot), written update-or-add with the status
/// returned, and a read tells "not found" apart from "device locked".
enum KeychainService {
    static let defaultService = Bundle.main.bundleIdentifier ?? "RaSiFitersSession"

    enum ReadResult {
        case found(Data)
        case notFound
        case locked                 // errSecInteractionNotAllowed — keep the session, read again later
        case failure(OSStatus)
    }

    struct Failure: Error { let status: OSStatus }

    static func read(_ account: String, service: String = defaultService) -> ReadResult {
        var query = baseQuery(account, service)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let data = item as? Data else { return .failure(errSecDecode) }
            return .found(data)
        case errSecItemNotFound: return .notFound
        case errSecInteractionNotAllowed: return .locked
        default: return .failure(status)
        }
    }

    /// Update-or-add. An update also moves an existing item onto `AfterFirstUnlockThisDeviceOnly`.
    @discardableResult
    static func write(_ data: Data, for account: String, service: String = defaultService) -> OSStatus {
        let query = baseQuery(account, service)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        guard status == errSecItemNotFound else { return status }
        return SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil)
    }

    static func delete(_ account: String, service: String = defaultService) {
        SecItemDelete(baseQuery(account, service) as CFDictionary)
    }

    private static func baseQuery(_ account: String, _ service: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }
}
```

2. **`Shared/Services/SessionStore.swift`**: replace the whole file.
```swift
import Foundation
import Security

/// The ONE token store (auth §3.1 client rules 1 + 4). The access + refresh pair is ONE keychain item (atomic save);
/// the decoded pair is cached here, written through on save / clear, so a request never costs a keychain call
/// (`ProgramContext.authToken` is a UI mirror written only from here). It also owns the `session.*` defaults, so a
/// scene-less teardown (a HealthKit background wake) can clear them.
final class SessionStore {
    static let shared = SessionStore()
    private init() {}

    enum Read {
        case tokens(access: String, refresh: String?)
        case signedOut
        case locked                      // before the first unlock after boot — keep the session, read again later
        case unreadable(OSStatus)        // corrupt / other keychain failure → forced sign-out (token_store_unreadable)
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

    private struct Pair: Codable { let access: String; let refresh: String? }
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

    var tokens: (access: String, refresh: String?)? {
        if case .tokens(let access, let refresh) = read() { return (access, refresh) }
        return nil
    }
    var accessToken: String? { tokens?.access }
    var refreshToken: String? { tokens?.refresh }
    var memberId: String? { UserDefaults.standard.string(forKey: Keys.userId) }
    var isGlobalAdmin: Bool { UserDefaults.standard.string(forKey: Keys.globalRole) == "global_admin" }

    func save(access: String, refresh: String?) throws {
        let data = try JSONEncoder().encode(Pair(access: access, refresh: refresh))
        let status = KeychainService.write(data, for: pairAccount)
        guard status == errSecSuccess else { throw KeychainService.Failure(status: status) }
        cached = .tokens(access: access, refresh: refresh)
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

    private func readKeychain() -> Read {
        switch KeychainService.read(pairAccount) {
        case .found(let data):
            guard let pair = try? JSONDecoder().decode(Pair.self, from: data) else { return .unreadable(errSecDecode) }
            return .tokens(access: pair.access, refresh: pair.refresh)
        case .locked: return .locked
        case .failure(let status): return .unreadable(status)
        case .notFound: return migrateLegacyItems()
        }
    }

    /// One-time move of the pre-1.5 two-item store into the pair item (re-saved with the new accessibility).
    private func migrateLegacyItems() -> Read {
        switch (KeychainService.read(legacyAccessAccount), KeychainService.read(legacyRefreshAccount)) {
        case (.locked, _), (_, .locked):
            return .locked
        case (.found(let accessData), let refreshResult):
            guard let access = String(data: accessData, encoding: .utf8) else { return .unreadable(errSecDecode) }
            var refresh: String?
            if case .found(let refreshData) = refreshResult { refresh = String(data: refreshData, encoding: .utf8) }
            if (try? save(access: access, refresh: refresh)) != nil {
                KeychainService.delete(legacyAccessAccount)
                KeychainService.delete(legacyRefreshAccount)
            }
            return .tokens(access: access, refresh: refresh)
        default:
            return .signedOut
        }
    }
}
```

3. **`Shared/Services/APIClient.swift`**: replace the whole file.
   - These are removed: `refreshAccessTokenIfPossible`, `authFailureHandler`, `accessTokenNearExpiry`, `shouldAttemptRefresh`, `isAuthFailure` and `extractErrorMessage`.
   - `rawData` and the refresh logic move to step 1a.4.
```swift
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

    // Single-flight refresh + back-off (APIClient+Session).
    var refreshTask: Task<String?, Error>?
    var refreshBlockedUntil: Date?
    var lastRefreshError: Error?

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

    /// Every JSON call: the authenticated path (`rawData`, APIClient+Session); non-2xx → `APIHTTPError`.
    func data(for request: URLRequest, allowRefresh: Bool = true) async throws -> Data {
        let (data, http) = allowRefresh ? try await rawData(for: request) : try await transport(request)
        guard 200..<300 ~= http.statusCode else { throw APIHTTPError.from(data, http) }
        return data
    }
}
```

4. **NEW `Shared/Services/APIClient+Session.swift`** (about 150 lines):
```swift
import Foundation

/// auth §3.1 client contract + observability §4.1 headers, for every API call. ONE token store (`SessionStore`) read
/// at send time; refresh only when the token expires within 60 s or on a 401; one refresh in flight, a failed one
/// retried once within 5 s, then ≥ 30 s of back-off; sign-out ONLY when `/auth/refresh` answers 401 (rule 3). This 401
/// path is the only retry any request gets — password writes are never retried after a 503 / 5xx / timeout (rule 6).
extension APIClient {

    static let refreshMargin: TimeInterval = 60
    static let refreshBackoff: TimeInterval = 30

    /// The observability §4.1 identity headers (the SSE client sends them too).
    static var identityHeaders: [String: String] {
        let info = Bundle.main.infoDictionary
        return ["X-App-Platform": "ios",
                "X-App-Version": info?["CFBundleShortVersionString"] as? String ?? "0",
                "X-App-Build": info?["CFBundleVersion"] as? String ?? "0"]
    }

    /// Paths whose bearer the caller owns: logout's captured token, the pending OAuth session, refresh (none).
    private static let callerOwnedBearer = ["auth/refresh", "auth/logout", "auth/oauth/complete"]

    /// One exchange on the 15 s session: identity headers + a fresh `X-Request-Id`. No auth logic.
    func transport(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        var request = request
        Self.identityHeaders.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Request-Id")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError(message: "No response") }
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
        guard let current = SessionStore.shared.accessToken else { return nil }
        guard Self.expiresSoon(current) else { return current }
        return (try? await refreshAccessToken()) ?? SessionStore.shared.accessToken
    }

    /// Single-flight refresh. nil = no refresh token. Throws the failure; a `401` has already run the forced
    /// teardown. After a retryable failure refreshes are refused for ≥ 30 s (board §2 client 2 "backs off").
    func refreshAccessToken() async throws -> String? {
        if let task = refreshTask { return try await task.value }
        if let until = refreshBlockedUntil, Date() < until, let error = lastRefreshError { throw error }
        let task = Task { try await self.performRefresh() }
        refreshTask = task
        defer { refreshTask = nil }
        do {
            let token = try await task.value
            resetRefreshBackoff()
            return token
        } catch {
            if Self.isRetryable(error) {
                lastRefreshError = error
                let wait = Double((error as? APIHTTPError)?.retryAfter ?? 0)
                refreshBlockedUntil = Date().addingTimeInterval(max(wait, Self.refreshBackoff))
            }
            throw error
        }
    }

    /// Teardown + a successful refresh: a new session never inherits the old one's back-off.
    func resetRefreshBackoff() {
        refreshBlockedUntil = nil
        lastRefreshError = nil
    }

    private func performRefresh() async throws -> String? {
        guard let refresh = SessionStore.shared.refreshToken else { return nil }
        do {
            return try await exchange(refresh)
        } catch let error where Self.isRetryable(error) {
            // Rule 2: one retry within 5 s (inside Supabase's 10 s reuse window), never a long-delayed replay.
            let wait = min(Double((error as? APIHTTPError)?.retryAfter ?? 1), 5)
            try await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            do {
                return try await exchange(refresh)
            } catch {
                if Self.isRetryable(error) { ClientEventQueue.shared.recordRefreshFailed(error) }
                throw error
            }
        }
    }

    private func exchange(_ refreshToken: String) async throws -> String {
        let epoch = SessionStore.shared.epoch
        do {
            let response = try await refreshSession(refreshToken: refreshToken)
            guard SessionStore.shared.epoch == epoch else { throw CancellationError() }   // signed out meanwhile
            let newRefresh = response.refreshToken ?? refreshToken
            try SessionStore.shared.save(access: response.token, refresh: newRefresh)
            tokenUpdateHandler?(response.token, newRefresh)
            return response.token
        } catch let error as APIHTTPError where error.statusCode == 401 {
            // `401 session_invalid`: the session is over (sign-out-everywhere / password change elsewhere / 90 days).
            if SessionStore.shared.epoch == epoch {
                SessionTeardown.end(.forced(reason: "refresh_session_invalid", status: 401, code: error.code))
            }
            throw error
        }
    }

    private func managesAuth(_ request: URLRequest) -> Bool {
        guard request.value(forHTTPHeaderField: "Authorization") != nil, let path = request.url?.path else { return false }
        return !Self.callerOwnedBearer.contains { path.hasSuffix($0) }
    }

    /// Keep-the-session failures (rule 3): 408 / 429 / 5xx, any transport error except a cancellation.
    static func isRetryable(_ error: Error) -> Bool {
        if let http = error as? APIHTTPError { return http.statusCode == 408 || http.statusCode == 429 || http.statusCode >= 500 }
        if let url = error as? URLError { return url.code != .cancelled }
        return false
    }

    static func expiresSoon(_ token: String) -> Bool {
        let parts = token.split(separator: ".")
        guard parts.count == 3 else { return true }
        var base64 = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        guard let payload = Data(base64Encoded: base64),
              let json = try? JSONSerialization.jsonObject(with: payload) as? [String: Any],
              let exp = json["exp"] as? TimeInterval else { return true }
        return Date(timeIntervalSince1970: exp).timeIntervalSinceNow < refreshMargin
    }
}

extension URLRequest {
    func withBearer(_ token: String) -> URLRequest {
        var request = self
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }
}
```

5. **`Shared/Services/APIClient+Auth.swift`**: replace these functions with the versions below and leave the rest as is:
   - `loginGlobal` (`:59`)
   - `registerDevice` (`:73`)
   - `socialSignIn` (`:133`)
   - `refreshSession` (`:182`)
   - `logout` (`:197`)

   Also add `unregisterDevice` and `logoutAll`. `deregisterDevice` (`:88`) stays until step 3.
```swift
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
```

6. **NEW `Shared/Services/DeviceRegistry.swift`**:
```swift
import Foundation
import Security

/// notifications §3.1 — this installation's push identity: a keychain install id (`…ThisDeviceOnly`, never copied to
/// another device) + ONE serial queue for register / unregister, so an unregister never lands after the next
/// sign-in's registration. iOS keeps the APNs token value itself (the login ride-along re-sends it); there is no
/// "already registered" memo to forget (D-IOS-PUSH-1).
final class DeviceRegistry {
    static let shared = DeviceRegistry()
    private init() {}

    private static let installService = "com.app.rasifiters.install-id"
    private static let installAccount = "install_id"
    private var tail: Task<Void, Never>?
    private var retryDelay: Task<Void, Never>?
    private var generation = 0

    /// The install UUID (lower-case), created on first use. nil only while the keychain is locked / failing.
    var installId: String? {
        switch KeychainService.read(Self.installAccount, service: Self.installService) {
        case .found(let data):
            return String(data: data, encoding: .utf8)
        case .notFound:
            let id = UUID().uuidString.lowercased()
            let status = KeychainService.write(Data(id.utf8), for: Self.installAccount, service: Self.installService)
            return status == errSecSuccess ? id : nil
        case .locked, .failure:
            return nil
        }
    }

    var pushToken: String? {
        guard let token = UserDefaults.standard.string(forKey: PushTokenNotification.userDefaultsKey), !token.isEmpty else { return nil }
        return token
    }

    /// The login ride-along fields for `/auth/login*` and `/auth/oauth` (call after `beginSignIn()`).
    func signInFields() -> [String: String] {
        var fields = ["platform": "ios"]
        if let pushToken { fields["push_token"] = pushToken }
        if let installId { fields["device_id"] = installId }
        return fields
    }

    /// Ordering rule: a sign-in drops a pending unregister retry and waits for anything in flight.
    func beginSignIn() async {
        generation += 1
        retryDelay?.cancel()
        await tail?.value
    }

    /// PUT /device while signed in (token rotation, foreground while authorized, after `/oauth/complete`).
    /// nil = re-send the stored APNs token.
    func register(pushToken token: String? = nil) {
        if let token { UserDefaults.standard.set(token, forKey: PushTokenNotification.userDefaultsKey) }
        guard let pushToken = token ?? self.pushToken else { return }
        enqueue {
            guard SessionStore.shared.accessToken != nil else { return }
            try? await APIClient.shared.registerDevice(pushToken: pushToken, deviceId: self.installId)
        }
    }

    /// POST /device/unregister on every sign-out path (voluntary + forced) and when notification permission is denied.
    /// Both fields; one retry after 2 s on a network error / 5xx, dropped if a sign-in begins meanwhile.
    func unregister() {
        let token = pushToken, id = installId, startedIn = generation
        guard token != nil || id != nil else { return }
        enqueue {
            if await self.sendUnregister(token, id) { return }
            guard startedIn == self.generation else { return }
            let delay = Task { try? await Task.sleep(nanoseconds: 2_000_000_000) }
            self.retryDelay = delay
            await delay.value
            self.retryDelay = nil
            guard startedIn == self.generation else { return }
            _ = await self.sendUnregister(token, id)
        }
    }

    private func enqueue(_ operation: @escaping () async -> Void) {
        let previous = tail
        tail = Task { await previous?.value; await operation() }
    }

    /// true = done (2xx, or a 4xx a retry can't fix); false = retry-worthy (transport error / 5xx).
    private func sendUnregister(_ token: String?, _ id: String?) async -> Bool {
        guard let status = try? await APIClient.shared.unregisterDevice(pushToken: token, deviceId: id) else { return false }
        return status < 500
    }
}
```

7. **NEW `Shared/Services/ClientEventQueue.swift`**:
```swift
import Foundation

/// observability §8 — the client event sender (`auth.*` §8, `sync.run` §8.1). Events queue on disk and SURVIVE
/// sign-out, carry a UUID `id` kept across retries, and POST in batches of ≤ 25 to `/api/client-events` with the
/// current Bearer when one exists (none is fine — this never refreshes).
final class ClientEventQueue {
    static let shared = ClientEventQueue()

    private static let maxQueued = 200
    private static let maxBatch = 25
    private let fileURL: URL
    private var events: [[String: Any]]
    private var isFlushing = false
    private var notBefore: Date?
    private let iso = ISO8601DateFormatter()

    private init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("client-events.json")
        let stored = (try? Data(contentsOf: fileURL)).flatMap { try? JSONSerialization.jsonObject(with: $0) }
        events = stored as? [[String: Any]] ?? []
    }

    /// Queue one event (props ≤ 2 KB; never tokens, emails, usernames or typed text) and flush shortly after.
    func record(_ type: String, props: [String: Any]) {
        events.append(["id": UUID().uuidString.lowercased(), "type": type,
                       "occurred_at": iso.string(from: Date()), "props": props])
        if events.count > Self.maxQueued { events.removeFirst(events.count - Self.maxQueued) }
        persist()
        Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            await self.flush()
        }
    }

    /// 2xx → drop · 400 / 415 → drop (never succeeds) · 413 → halve (a single event that still 413s is dropped) ·
    /// 429 → wait `Retry-After` · 5xx / offline → keep, retry no sooner than 30 s (next launch / foreground / event).
    func flush() async {
        guard !isFlushing, notBefore.map({ Date() >= $0 }) ?? true else { return }
        isFlushing = true
        defer { isFlushing = false }
        var size = Self.maxBatch
        while !events.isEmpty {
            let batch = Array(events.prefix(size))
            let (status, retryAfter) = await send(batch)
            switch status {
            case 200..<300, 400, 415:
                remove(batch); size = Self.maxBatch
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
        guard let data = try? JSONSerialization.data(withJSONObject: events) else { return }
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
        record("auth.sign_in_failed", props: Self.compact(["method": method, "kind": failure.kind,
                                                            "status": failure.status, "code": failure.code]))
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
        record("auth.refresh_failed", props: Self.compact(["kind": failure.kind, "status": failure.status, "code": failure.code]))
    }

    /// `sync.run` (§8.1) — props built by `HealthSyncRunSummary.eventProps` (step 2).
    func recordSyncRun(_ props: [String: Any]) { record("sync.run", props: props) }

    /// The §8 `kind` vocabulary from a thrown error.
    static func failure(_ error: Error) -> (kind: String, status: Int?, code: String?) {
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
            return (kind, http.statusCode, http.code)
        }
        if let url = error as? URLError { return (url.code == .timedOut ? "timeout" : "offline", nil, nil) }
        return ("unknown", nil, nil)
    }

    private static func compact(_ props: [String: Any?]) -> [String: Any] { props.compactMapValues { $0 } }
}
```

8. **NEW `Shared/Models/ProgramContext+Session.swift`**: the step-1 version. Steps 2 and 5 replace the marked lines.
```swift
import Foundation
import Combine
import UIKit

/// How a session ended (auth §3.1 client rules 1 + 5).
enum SessionEnd {
    case user                                                   // Sign Out — revoke THIS device (POST /auth/logout)
    case everywhere                                             // POST /auth/logout-all → 200: nothing left to revoke
    case accountDeleted                                         // DELETE /auth/account: device rows cascade server-side
    case forced(reason: String, status: Int?, code: String?)    // → auth.forced_sign_out
}

/// The ONE sign-out teardown for every path (board §2 client 5): revoke this session, unregister this device (no login
/// needed), report a forced reason, clear tokens + session defaults + caches. Static and scene-free, so APIClient can
/// run it from a HealthKit background wake; ProgramContext clears its in-memory state on `didEnd`. Events are kept.
enum SessionTeardown {
    static let didEnd = Notification.Name("RaSiFitersSessionDidEnd")

    static func end(_ reason: SessionEnd) {
        let store = SessionStore.shared
        let tokens = store.tokens
        var hasSession = tokens != nil
        if case .unreadable = store.read() { hasSession = true }
        guard hasSession else {                                  // already signed out (a second path racing the first)
            NotificationCenter.default.post(name: didEnd, object: nil)
            return
        }
        switch reason {
        case .user:
            if let tokens { Task { await APIClient.shared.logout(accessToken: tokens.access, refreshToken: tokens.refresh) } }
        case .forced(let why, let status, let code):
            ClientEventQueue.shared.recordForcedSignOut(reason: why, status: status, code: code)
        case .everywhere, .accountDeleted:
            break
        }
        if case .accountDeleted = reason {} else { DeviceRegistry.shared.unregister() }
        APIClient.shared.resetRefreshBackoff()
        // step 2 adds: HealthSyncEngine.shared.pause()
        // step 5 adds: LaunchCache.shared.clearAll()
        store.clear()
        NotificationCenter.default.post(name: didEnd, object: nil)
    }
}

/// Copy shared with web + Android (cross-track parity — identical strings on all three).
enum SessionCopy {
    static let signOutEverywhere = "Sign out everywhere"
    static let signOutEverywhereTitle = "Sign out everywhere?"
    static let signOutEverywhereMessage = "You'll be signed out of RaSi Fiters on all your devices, including this one."
    /// auth §3.1 rule 6 — after a 503 / 5xx / timeout the change may already have landed.
    static let passwordUnconfirmed = "We couldn't confirm the change. It may have gone through. Try signing in with your new password before trying again."
    static let samePassword = "New password must be different from your current password."

    /// Credential screens (frontend-kit §4 scope rule, D-IOS-AUTH-2): the server's text for 400 / 401 / 409 / 422,
    /// the kit's copy for everything else (offline, timeout, busy, server).
    static func credentialMessage(for error: Error) -> String {
        if let http = error as? APIHTTPError, [400, 401, 409, 422].contains(http.statusCode),
           let text = AppError.serverText(http.message) { return text }
        return AppError(error)?.message ?? KitCopy.message(for: .unknown)
    }

    /// Rule 6: a 5xx (incl. 503) / 408 or a client-side timeout / dropped connection → maybe landed.
    static func isUnconfirmedWrite(_ error: Error) -> Bool {
        if let http = error as? APIHTTPError { return http.statusCode >= 500 || http.statusCode == 408 }
        if let url = error as? URLError { return url.code == .timedOut || url.code == .networkConnectionLost }
        return false
    }
}

extension ProgramContext {

    /// Voluntary sign-out (AccountMenuSheet, Program tab) — this device only (auth D-C14).
    func signOut() { SessionTeardown.end(.user) }

    /// "Sign out everywhere" (AccountMenuSheet): every session ends, this one included → the full teardown.
    func signOutEverywhere() async throws {
        try await APIClient.shared.logoutAll()
        SessionTeardown.end(.everywhere)
    }

    func observeSessionLifecycle() {
        NotificationCenter.default.publisher(for: SessionTeardown.didEnd)
            .sink { [weak self] _ in self?.clearInMemorySession() }
            .store(in: &cancellables)
        // D-IOS-AUTH-3: a launch before the first unlock reads `.locked` (no sign-out) — read again once it unlocks.
        NotificationCenter.default.publisher(for: UIApplication.protectedDataDidBecomeAvailableNotification)
            .sink { [weak self] _ in
                guard let self, self.authToken == nil else { return }
                self.restorePersistedSession()
            }
            .store(in: &cancellables)
        // step 5 adds the NetworkMonitor → isOnline binding here
    }

    /// The in-memory half of the teardown (tokens + defaults were already cleared by SessionTeardown).
    func clearInMemorySession() {
        authToken = nil
        refreshToken = nil
        loggedInUserId = nil
        loggedInUserName = nil
        loggedInUsername = nil
        loggedInUserGender = nil
        loggedInUserProgramRole = "member"
        globalRole = "standard"
        programId = nil
        programs = []
        members = []
        workouts = []
        membershipDetails = []
        pendingInvites = []
        stopNotificationStream()
        // step 2 adds the health-sync lines here
    }

    /// Launch / foreground / sign-in. The data reload is decoupled from the token (rule 2: no refresh on foreground).
    func sessionDidBecomeActive() {
        startNotificationStreamIfNeeded()
        Task { await reloadSessionData() }
        Task { await ClientEventQueue.shared.flush() }
        Task {                                           // step 2 replaces this block with the HealthSyncEngine trigger
            if isHealthKitEnabled { await performHealthKitSync() }
            if isSleepSyncEnabled { await performSleepSync() }
        }
    }

    func reloadSessionData() async {
        await loadLookupData()
        if programId != nil { await loadMembershipDetails() }
    }
}
```

9. **`Shared/Models/ProgramContext.swift`**:
   - Replace the `authToken` / `refreshToken` lines (`:25-26`) with:
     ```swift
     /// UI mirror of `SessionStore` (the ONE token store) — written only from the store (restore / sign-in / refresh
     /// hook / teardown). APIClient reads the token at send time, so a stale mirror is harmless.
     @Published var authToken: String?
     @Published var refreshToken: String? = nil
     ```
   - After `let notificationDateFormatter = ISO8601DateFormatter()` (`:150`), add `var cancellables = Set<AnyCancellable>()`.
   - In `init`, replace `restorePersistedSession()` and `configureAPIClientHandlers()` (`:255-256`) with three lines: `restorePersistedSession()`, `configureAPIClientHandlers()`, `observeSessionLifecycle()`.

10. **`Shared/Models/ProgramContext+Auth.swift`**:
    - Delete `SessionDefaultsKeys` (`:11-19`). Use `SessionStore.Keys.*` everywhere in this file.
    - Replace `configureAPIClientHandlers()` (`:21-35`) with:
      ```swift
      func configureAPIClientHandlers() {
          APIClient.shared.tokenUpdateHandler = { [weak self] access, refresh in
              self?.authToken = access            // UI mirror only — SessionStore already holds the pair
              self?.refreshToken = refresh
          }
          APIClient.shared.updateRequiredHandler = { [weak self] in self?.isUpdateRequired = true }
      }
      ```
    - In `restorePersistedSession()`, replace the two token lines (`:38-39`) with the switch below, and keep the rest of the function using `SessionStore.Keys.*`:
      ```swift
      switch SessionStore.shared.read() {
      case .tokens(let access, let refresh):
          authToken = access
          refreshToken = refresh
      case .signedOut, .locked:
          authToken = nil                         // locked: read again on unlock / next foreground (D-IOS-AUTH-3)
          refreshToken = nil
      case .unreadable:
          authToken = nil
          refreshToken = nil
          SessionTeardown.end(.forced(reason: "token_store_unreadable", status: nil, code: nil))
      }
      ```
    - In `persistSession()` (`:59-70`), delete the `SessionStore.shared.saveTokens(…)` line. Replace its doc comment with: `/// The session.* defaults only — tokens live in SessionStore and are never written back from here (W1 F2).`
    - Delete these functions:
      - `clearPersistedSession()` (`:72-82`)
      - `refreshSessionIfNeeded()`
      - `performTokenRefresh(using:)`
      - `signOut()` (moved to +Session)
      - `isNetworkError` and `isAuthFailure`
    - Add the line `/// auth §3.1 rule 6: never auto-retried — the only retry is APIClient's 401 → refresh → once (the write never ran).` above `changePassword` (`:165`) and above `setPassword` (`:313`).
    - In `deleteAccount()`, replace `signOut()` with `SessionTeardown.end(.accountDeleted)`.
    - Replace the body of `registerPushTokenIfNeeded(_:)` with `DeviceRegistry.shared.register(pushToken: deviceToken)`. Step 3 deletes this function.
    - Replace `applyAuthResponse` with:
      ```swift
      /// The single session-write path (password login, sign-up, federated). Tokens go to SessionStore FIRST and the
      /// member defaults are persisted BEFORE the `authToken` mirror flips (that flip starts the session work).
      @MainActor
      func applyAuthResponse(_ r: AuthResponse) async throws {
          try SessionStore.shared.save(access: r.token, refresh: r.refreshToken)
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
          refreshToken = r.refreshToken
          authToken = r.token
          await loadLookupData()
      }
      ```

11. **`Shared/Services/APIClient+Workouts.swift`**:
    - `BulkWorkoutError` (`:163-167`): add `var status: Int? = nil` after `rowErrors`, with the doc comment `/// HTTP status (D-KIT-5) — the kit labels a batch 409 conflict, a 400 invalidInput.`
    - In `addWorkoutLogsBatch`, replace the `var (data, http)` line, the 401 retry block and `authFailureHandler` (`:200-206`) with `let (data, http) = try await rawData(for: try buildRequest(bearer: token))`.
    - Make its throw `throw BulkWorkoutError(message: message, rowErrors: payload?.rowErrors ?? [], status: http.statusCode)`.
    - In `writeHealthKitWorkoutLog` (step 2 deletes it), replace `var (_, http) = try await rawData(for: initial)` and its `if http.statusCode == 401 …` retry with `let (_, http) = try await rawData(for: initial)`.

12. **`Shared/Services/APIClient+DailyHealth.swift`**:
    - In `addDailyHealthLogsBatch`, replace `:256-262` with `let (data, http) = try await rawData(for: try buildRequest(bearer: token))`, and add `status: http.statusCode` to its `BulkWorkoutError` throw.
    - In both `send(method:)` helpers (`writeHealthKitSleepLog` `:50-53`, `writeHealthKitStepsLog` `:109-112`), replace the `var (_, http)…` line and its 401 retry with `let (_, http) = try await rawData(for: initial)`.

13. **`Shared/Kit/AppError.swift`**, inside `init?(_ error: Error)`:
    - Replace the `APIHTTPError` branch with: `self = AppError.fromHTTP(status: httpError.statusCode, code: httpError.code, retryAfter: httpError.retryAfter, serverMessage: httpError.message)`.
    - Replace the `BulkWorkoutError` branch with:
      ```swift
      } else if let bulkError = error as? APIClient.BulkWorkoutError {
          // D-KIT-5 closed (Phase 3): the batch writers carry the status; without one keep the Phase 2 fallback.
          if let status = bulkError.status {
              self = AppError.fromHTTP(status: status, serverMessage: bulkError.message, rowErrors: bulkError.rowErrors)
          } else {
              self = bulkError.rowErrors.isEmpty
                  ? AppError(kind: .unknown)
                  : AppError(kind: .invalidInput, message: AppError.serverText(bulkError.message), rowErrors: bulkError.rowErrors)
          }
      ```
    - Update the two "No status until Phase 3" comments to say "status since Phase 3 (D-KIT-5)". No copy changes.

14. **Call-site fixes so 1a compiles**, in `Features/Auth/LoginView.swift` and `Features/Auth/CreateAccountView.swift`:
    - Remove the `pushToken:` / `deviceId:` arguments and every `let pushToken = UserDefaults…` line.
    - Change every `await programContext.applyAuthResponse(…)` to `try await …`.
    - Make each `handleSocialResponse` `async throws` and call it with `try await`.

15. **`App/AppRootView.swift`**:
    - Replace `.task { … }` (`:42-56`) with:
      ```swift
      .task {
          if programContext.authToken != nil { programContext.sessionDidBecomeActive() }
          await programContext.checkMinimumSupportedVersion()
      }
      ```
    - Replace `.onChange(of: programContext.authToken)` (`:57-73`) with:
      ```swift
      .onChange(of: programContext.authToken) { oldToken, newToken in
          // Sign-in / restore (nil → token) only. A refresh (token → token) and the teardown (token → nil) need nothing:
          // sync state survives sign-out (rule 7) and the teardown already stopped the stream.
          if oldToken == nil, newToken != nil { programContext.sessionDidBecomeActive() }
      }
      ```
    - In `.onChange(of: scenePhase)` (`:87-118`), replace everything from `await programContext.refreshSessionIfNeeded()` through the sleep-sync `if`, inclusive, with the block below. Keep the notification-permission `switch` that follows unchanged.
      ```swift
      if programContext.authToken == nil {
          // D-IOS-AUTH-3: a launch before the first unlock read the keychain as `.locked` — read it again. A restored
          // token starts the session work through onChange(authToken).
          programContext.restorePersistedSession()
          return
      }
      programContext.sessionDidBecomeActive()
      ```
      Then remove the now-redundant `if programContext.authToken != nil {` wrapper around the permission `switch`, along with its closing brace.

**⌘B checkpoint 1a.** The user presses ⌘B. Fix the reported errors before continuing.

**1b: screens.**

16. **`Features/Auth/LoginView.swift`**:
    - Add `private func showAlert(_ message: String) { alertMessage = message; isShowingAlert = true }`.
    - Replace `handleLogin`, `handleGoogleSignIn` and `handleAppleSignIn` with the versions below. `handleSocialResponse` stays as `async throws`.
```swift
    private func handleLogin() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await APIClient.shared.loginGlobal(identifier: identifier, password: password)
            try await programContext.applyAuthResponse(response)
            navigateToProgramPicker = true
        } catch {
            ClientEventQueue.shared.recordSignInFailure(error, method: "password")
            showAlert(SessionCopy.credentialMessage(for: error))
        }
    }

    @MainActor
    private func handleGoogleSignIn() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        let google: (idToken: String, nonce: String)
        do {
            guard let presenter = AuthPresenter.rootViewController else {
                throw APIError(message: "Unable to present Google sign-in.")
            }
            google = try await programContext.startGoogleSignIn(presenting: presenter)
        } catch {
            guard !isGoogleCancellation(error) else { return }
            ClientEventQueue.shared.recordProviderFailure(error, method: "google")
            showAlert(KitCopy.message(for: .unknown))
            return
        }
        do {
            let response = try await APIClient.shared.socialSignIn(provider: "google", idToken: google.idToken, nonce: google.nonce)
            try await handleSocialResponse(response)
        } catch {
            ClientEventQueue.shared.recordSignInFailure(error, method: "google")
            showAlert(SessionCopy.credentialMessage(for: error))
        }
    }

    @MainActor
    private func handleAppleSignIn() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        let apple: (idToken: String, nonce: String, firstName: String?, lastName: String?)
        do {
            apple = try await programContext.startAppleSignIn()
        } catch {
            guard !isAppleCancellation(error) else { return }
            ClientEventQueue.shared.recordProviderFailure(error, method: "apple")
            showAlert(KitCopy.message(for: .unknown))
            return
        }
        do {
            let response = try await APIClient.shared.socialSignIn(provider: "apple", idToken: apple.idToken, nonce: apple.nonce,
                                                                   firstName: apple.firstName, lastName: apple.lastName)
            try await handleSocialResponse(response)
        } catch {
            ClientEventQueue.shared.recordSignInFailure(error, method: "apple")
            showAlert(SessionCopy.credentialMessage(for: error))
        }
    }
```
    If ⌘B reports a tuple-type mismatch on `google` or `apple`, match the declared tuple to the return type of `startGoogleSignIn` / `startAppleSignIn`.

17. **`Features/Auth/CreateAccountView.swift`**:
    - Add the same `showAlert` helper.
    - Replace `handleGoogleSignIn` and `handleAppleSignIn` with the two LoginView versions above, verbatim. They call this file's in-place `handleSocialResponse`.
    - Replace `handleCreateAccount` with:
      ```swift
      private func handleCreateAccount() async {
          guard !isLoading else { return }
          isLoading = true
          defer { isLoading = false }
          do {
              _ = try await APIClient.shared.registerAccount(firstName: firstName, lastName: lastName, username: username,
                                                              email: email, password: password, gender: gender)
          } catch {
              showAlert(SessionCopy.credentialMessage(for: error))        // sign-up, not a sign-in: no event
              return
          }
          do {
              let response = try await APIClient.shared.loginGlobal(identifier: username, password: password)
              try await programContext.applyAuthResponse(response)
              navigateToProgramPicker = true
          } catch {
              ClientEventQueue.shared.recordSignInFailure(error, method: "password")
              showAlert(SessionCopy.credentialMessage(for: error))
          }
      }
      ```
    - In `handleCompleteSocial`:
      - After `try await programContext.applyAuthResponse(response)`, add `DeviceRegistry.shared.register()`. `/oauth/complete` has no registration ride-along (notifications §3.1).
      - Change its catch to `showAlert(SessionCopy.credentialMessage(for: error))`.

18. **`Features/Home/Settings/ChangePasswordView.swift`**: add `@State private var hadUnconfirmedAttempt = false` and replace `save()`:
```swift
    /// auth §3.1 rule 6: never auto-retried. After a 503 / 5xx / timeout the change may have landed → say so; a
    /// same-password 400 on the user's manual retry means the first attempt landed → show it as done.
    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            try await programContext.changePassword(newPassword: newPassword)
            hadUnconfirmedAttempt = false
            showSuccessAlert = true
        } catch {
            if hadUnconfirmedAttempt, let http = error as? APIHTTPError, http.statusCode == 400,
               http.message == SessionCopy.samePassword {
                hadUnconfirmedAttempt = false
                showSuccessAlert = true
            } else if SessionCopy.isUnconfirmedWrite(error) {
                hadUnconfirmedAttempt = true
                errorMessage = SessionCopy.passwordUnconfirmed
            } else {
                errorMessage = SessionCopy.credentialMessage(for: error)
            }
        }
    }
```

19. **`Features/Home/Settings/MyProfileView.swift`**: rule 6 for set-password only; no layout change. Add `@State private var hadUnconfirmedSetPassword = false` and replace `addPassword()`:
```swift
    private func addPassword() async {
        isSettingPassword = true; linkError = nil
        defer { isSettingPassword = false }
        do {
            apply(try await programContext.setPassword(newPassword: newAccountPassword))
            showPasswordForm = false; newAccountPassword = ""; hadUnconfirmedSetPassword = false
        } catch {
            if hadUnconfirmedSetPassword, let http = error as? APIHTTPError, http.statusCode == 400,
               http.message == SessionCopy.samePassword {
                await loadIdentities()                                  // rule 6: the earlier attempt landed
                showPasswordForm = false; newAccountPassword = ""; hadUnconfirmedSetPassword = false
            } else if SessionCopy.isUnconfirmedWrite(error) {
                hadUnconfirmedSetPassword = true
                linkError = SessionCopy.passwordUnconfirmed
            } else {
                linkError = SessionCopy.credentialMessage(for: error)
            }
        }
    }
```

20. **`Features/Home/ProgramPickerView.swift`**: add "Sign out everywhere" (decision 1).
    - Add `@State private var showSignOutEverywhereConfirmation = false` after `showSignOutConfirmation` (`:15`).
    - In `.sheet(isPresented: $showAccountMenu)` (`:150-156`), pass a third argument: `onSignOutEverywhere: handleAccountSignOutEverywhere`.
    - After the "Sign Out" `.alert` (`:195-202`), add:
      ```swift
      .alert(SessionCopy.signOutEverywhereTitle, isPresented: $showSignOutEverywhereConfirmation) {
          Button("Cancel", role: .cancel) { }
          Button(SessionCopy.signOutEverywhere, role: .destructive) {
              Task { await signOutEverywhere() }
          }
      } message: {
          Text(SessionCopy.signOutEverywhereMessage)
      }
      ```
    - After `handleAccountSignOut()` (`:540-545`), add:
      ```swift
      private func handleAccountSignOutEverywhere() {
          showAccountMenu = false
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
              showSignOutEverywhereConfirmation = true
          }
      }

      /// auth §3.1: `POST /logout-all` → 200 → the full teardown (→ sign-in screen). A failure keeps the session.
      private func signOutEverywhere() async {
          do { try await programContext.signOutEverywhere() }
          catch { errorMessage = AppError(error)?.message }
      }
      ```
    - In `AccountMenuSheet`:
      - Add `let onSignOutEverywhere: () -> Void` after `let onSignOut` (`:564`).
      - After the Sign Out `Button { … }.buttonStyle(.plain)` (`:662-667`), add:
        ```swift
        Button {
            onSignOutEverywhere()
        } label: {
            SignOutRow(title: SessionCopy.signOutEverywhere, icon: "laptopcomputer.and.iphone")
        }
        .buttonStyle(.plain)
        ```
    - In `SignOutRow` (`:789`), add `var title = "Sign Out"` and `var icon = "rectangle.portrait.and.arrow.right"`, and use them in place of the literals at `:796` and `:800`. Same look.

**⌘B checkpoint 1b.** `ProgramCards.swift:434` still calls `programContext.signOut()`, which is now the teardown. No edit is needed there.

### Step 2: HealthKit sync v2 (health-sync §8) and `sync.run`

**2a: new code next to the old code, using two renames. ⌘B checkpoint at the end.**

1. Run `git mv Shared/Services/HealthKitAppliedLedger.swift Shared/Services/HealthSyncPrefs.swift`.
   - Replace that file's first line (`import Foundation`) with the block below.
   - **Keep** the old `enum HealthKitAppliedLedger { … }` and its doc comment below it until 2b.
   - The new content is about 150 lines.
```swift
import Foundation
import HealthKit

/// The three health-sync kinds (§3.2 `kind`).
enum HealthSyncKind: String, CaseIterable {
    case workout, sleep, steps

    var flow: PendingSyncConfirmation.Flow {
        switch self { case .workout: return .workouts; case .sleep: return .sleep; case .steps: return .steps }
    }

    /// Pre-1.5 global UserDefaults prefix (moved per member once by `HealthSyncPrefs.migrateLegacyIfNeeded`).
    var legacyPrefix: String {
        switch self { case .workout: return "healthkit."; case .sleep: return "healthkit.sleep."; case .steps: return "healthkit.steps." }
    }
}

struct HealthSyncKey: Hashable {
    let programId: String
    let kind: HealthSyncKind
}

/// Manual Sync Now result per kind (automatic triggers ignore it — D-SIL).
enum HealthSyncOutcome { case synced(Int), failed, skipped }

struct HealthSyncReport {
    var kinds: [HealthSyncKind: HealthSyncOutcome] = [:]
    /// Something was applied or removed server-side → the Summary reloads (`summaryRefreshToken`).
    var dataChanged = false
    func result(for kind: HealthSyncKind) -> HealthSyncOutcome { kinds[kind] ?? .skipped }
}

/// Per-member Apple Health sync settings (health-sync §8 rule 7: local sync state is per member — the same member
/// resumes after any sign-in, another account never inherits it). Disconnect clears the connection prefs only.
enum HealthSyncPrefs {
    /// One run's local outcome for one kind (D-SIL status line; rule 5 for "Last Synced").
    enum RunStatus {
        case success(Int)       // N new (workouts: applied samples; sleep / steps: created days)
        case held(Int)          // lock / pending review / skipped_locked: count lands, "Last Synced" doesn't move
        case failed             // server / request failure, or data with no resolvable program window
        case readFailed         // HealthKit read failed: a local condition, the status line is untouched
        var outcome: HealthSyncOutcome {
            switch self { case .success(let n), .held(let n): return .synced(n); case .failed, .readFailed: return .failed }
        }
    }

    private static var defaults: UserDefaults { .standard }
    /// Cleared by Disconnect. Exclusions + the upgrade marker survive it (rule 6 / rule 9 — D-IOS-SYNC-3).
    private static let connectionNames = ["enabled", "syncProgramIds", "lastSyncDate", "lastSyncCount", "lastSyncFailed", "connectDate"]
    private static let migratedKey = "healthsync.migratedV2"

    private static func key(_ member: String, _ kind: HealthSyncKind, _ name: String) -> String {
        "healthsync.\(member).\(kind.rawValue).\(name)"
    }

    static func isEnabled(_ kind: HealthSyncKind, member: String) -> Bool { defaults.bool(forKey: key(member, kind, "enabled")) }
    static func programIds(_ kind: HealthSyncKind, member: String) -> Set<String> {
        Set(defaults.stringArray(forKey: key(member, kind, "syncProgramIds")) ?? [])
    }
    /// Connected AND at least one program selected (faithful to 1.4's `!syncProgramIds.isEmpty` guard).
    static func isActive(_ kind: HealthSyncKind, member: String) -> Bool {
        isEnabled(kind, member: member) && !programIds(kind, member: member).isEmpty
    }
    static func save(_ kind: HealthSyncKind, member: String, enabled: Bool, programIds: Set<String>) {
        defaults.set(enabled, forKey: key(member, kind, "enabled"))
        defaults.set(Array(programIds), forKey: key(member, kind, "syncProgramIds"))
    }
    static func markConnected(_ kind: HealthSyncKind, member: String) {
        defaults.set(true, forKey: key(member, kind, "enabled"))
        if connectDate(kind, member: member) == nil { defaults.set(Date(), forKey: key(member, kind, "connectDate")) }
    }
    static func connectDate(_ kind: HealthSyncKind, member: String) -> Date? { defaults.object(forKey: key(member, kind, "connectDate")) as? Date }

    static func lastSyncDate(_ kind: HealthSyncKind, member: String) -> Date? { defaults.object(forKey: key(member, kind, "lastSyncDate")) as? Date }
    static func lastSyncCount(_ kind: HealthSyncKind, member: String) -> Int { defaults.integer(forKey: key(member, kind, "lastSyncCount")) }
    static func lastSyncFailed(_ kind: HealthSyncKind, member: String) -> Bool { defaults.bool(forKey: key(member, kind, "lastSyncFailed")) }

    static func recordRun(_ kind: HealthSyncKind, member: String, _ status: RunStatus) {
        switch status {
        case .readFailed:
            return
        case .failed:
            defaults.set(true, forKey: key(member, kind, "lastSyncFailed"))
        case .success(let count), .held(let count):
            defaults.set(false, forKey: key(member, kind, "lastSyncFailed"))
            defaults.set(lastSyncCount(kind, member: member) + count, forKey: key(member, kind, "lastSyncCount"))
            if case .success = status { defaults.set(Date(), forKey: key(member, kind, "lastSyncDate")) }   // rule 5
        }
    }

    // Review exclusions (D-CONF; honored by rule 3): workouts "programId|date|workoutName", sleep/steps "programId|date".
    static func exclusionKey(_ kind: HealthSyncKind, programId: String, date: String, workoutName: String? = nil) -> String {
        kind == .workout ? "\(programId)|\(date)|\(workoutName ?? "")" : "\(programId)|\(date)"
    }
    static func excluded(_ kind: HealthSyncKind, member: String) -> Set<String> {
        Set(defaults.stringArray(forKey: key(member, kind, "excludedKeys")) ?? [])
    }
    static func addExcluded(_ keys: [String], _ kind: HealthSyncKind, member: String) {
        guard !keys.isEmpty else { return }
        defaults.set(Array(excluded(kind, member: member).union(keys)), forKey: key(member, kind, "excludedKeys"))
    }
    /// Drop exclusions older than the 30-day catch-up window (+1 day) — they can never be read again.
    static func pruneExcluded(member: String) {
        let cal = Calendar.current
        let cutoff = HealthSyncItems.ymd(cal.date(byAdding: .day, value: -31, to: cal.startOfDay(for: Date())) ?? Date())
        for kind in HealthSyncKind.allCases {
            let all = excluded(kind, member: member)
            let kept = all.filter { entry in
                let parts = entry.split(separator: "|")
                return parts.count >= 2 && String(parts[1]) >= cutoff
            }
            if kept.count != all.count { defaults.set(Array(kept), forKey: key(member, kind, "excludedKeys")) }
        }
    }

    // Workout anchor + rule 9 upgrade state.
    static func anchor(member: String) -> HKQueryAnchor? {
        guard let data = defaults.data(forKey: key(member, .workout, "anchor")) else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }
    static func setAnchor(_ anchor: HKQueryAnchor?, member: String) {
        guard let anchor, let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true) else { return }
        defaults.set(data, forKey: key(member, .workout, "anchor"))
    }
    /// Rule 4/9: this member's device held an old-build ledger → workouts first-read from today − 30 d, never the connect date.
    static func hasUpgradeMarker(member: String) -> Bool { defaults.bool(forKey: key(member, .workout, "upgradeMarker")) }
    static func upgradePending(member: String) -> Bool { defaults.bool(forKey: "healthsync.\(member).upgradePending") }
    static func setUpgradePending(_ pending: Bool, member: String) { defaults.set(pending, forKey: "healthsync.\(member).upgradePending") }

    /// Disconnect (D-IOS-SYNC-3): this kind's connection prefs (+ the workout anchor). Nothing is sent to the server.
    static func disconnect(_ kind: HealthSyncKind, member: String) {
        connectionNames.forEach { defaults.removeObject(forKey: key(member, kind, $0)) }
        if kind == .workout { defaults.removeObject(forKey: key(member, .workout, "anchor")) }
    }

    /// One-time move of the pre-1.5 GLOBAL `healthkit.*` keys to the member signed in at upgrade time. Waits until a
    /// member is known (signed out / before the first unlock → retried at the next call; nothing is deleted). The old
    /// anchor is discarded (rule 9); the old ledger + confirmed lists stay for `HealthSyncUpgrade`. Idempotent.
    static func migrateLegacyIfNeeded() {
        guard !defaults.bool(forKey: migratedKey), let member = SessionStore.shared.memberId else { return }
        defaults.set(true, forKey: migratedKey)
        for kind in HealthSyncKind.allCases {
            for name in connectionNames + ["excludedKeys"] {
                let old = kind.legacyPrefix + name
                if let value = defaults.object(forKey: old) { defaults.set(value, forKey: key(member, kind, name)) }
                defaults.removeObject(forKey: old)
            }
        }
        defaults.removeObject(forKey: "healthkit.workoutAnchor")
        let hadLedger = !(defaults.dictionary(forKey: HealthSyncUpgrade.legacyLedgerKey) ?? [:]).isEmpty
        let hadConfirmed = HealthSyncUpgrade.legacyConfirmedKeys.values.contains { !(defaults.stringArray(forKey: $0) ?? []).isEmpty }
        if hadLedger || isEnabled(.workout, member: member) { defaults.set(true, forKey: key(member, .workout, "upgradeMarker")) }
        if hadLedger || hadConfirmed { setUpgradePending(true, member: member) }
    }
}
```

2. **NEW `Shared/Services/APIClient+HealthSync.swift`**:
```swift
import Foundation

/// health-sync §3 calls for integration `healthkit`. Every request takes the central auth path, so a 401 refreshes
/// once and retries the same request (rule 8); the batch is idempotent, so any later re-send is safe.
extension APIClient {

    struct HealthSyncItem: Encodable {
        let kind: String
        var program_id: String? = nil
        var date: String? = nil
        var sample_id: String? = nil
        var origin: String? = nil
        var workout_name: String? = nil
        var value: Double? = nil
        var start_at: String? = nil
        var end_at: String? = nil
        var deleted: Bool? = nil
        var legacy: Bool? = nil
    }

    struct HealthSyncItemResult: Decodable { let index: Int; let status: String; let error: String? }

    struct HealthSyncStateRow: Decodable {
        let integration: String
        let program_id: String
        let kind: String
        let review_done_at: String?
        let last_success_at: String?
    }

    struct HealthSyncStateResponse: Decodable { let server_time: String?; let states: [HealthSyncStateRow] }

    struct HealthSyncStateEntry: Encodable {
        let program_id: String
        let kind: String
        var review_done: Bool? = nil
        var sync_success: Bool? = nil
    }

    /// One upload: a result slot per item (nil = not uploaded), the batches that landed, the first request failure.
    struct HealthSyncUpload {
        var results: [HealthSyncItemResult?]
        var batches = 0
        var error: Error?
    }

    private struct BatchBody: Encodable { let integration = "healthkit"; let items: [HealthSyncItem] }
    private struct BatchResponse: Decodable { let results: [HealthSyncItemResult] }
    private struct StateBody: Encodable { let integration = "healthkit"; let entries: [HealthSyncStateEntry] }

    func fetchHealthSyncState() async throws -> HealthSyncStateResponse {
        let data = try await data(for: authorizedRequest("health-sync/state", method: "GET"))
        return try JSONDecoder().decode(HealthSyncStateResponse.self, from: data)
    }

    /// PUT /state in chunks of ≤ 60 entries (§3.4). No-op for no entries.
    func putHealthSyncState(_ entries: [HealthSyncStateEntry]) async throws {
        for start in stride(from: 0, to: entries.count, by: 60) {
            var request = authorizedRequest("health-sync/state", method: "PUT")
            request.httpBody = try JSONEncoder().encode(StateBody(entries: Array(entries[start..<min(start + 60, entries.count)])))
            _ = try await data(for: request)
        }
    }

    /// POST /batch (rule 2): ≤ 300 items and ≤ 250 kB per request; halved before sending when too big and on a 413.
    /// Stops at the first request-level failure (rule 8: the whole run retries later — idempotent).
    func uploadHealthSync(_ items: [HealthSyncItem]) async -> HealthSyncUpload {
        var upload = HealthSyncUpload(results: Array(repeating: nil, count: items.count))
        var pending: [Range<Int>] = stride(from: 0, to: items.count, by: 300).map { $0..<min($0 + 300, items.count) }
        while !pending.isEmpty {
            let range = pending.removeFirst()
            do {
                var request = authorizedRequest("health-sync/batch", method: "POST")
                request.httpBody = try JSONEncoder().encode(BatchBody(items: Array(items[range])))
                let tooBig = (request.httpBody?.count ?? 0) > 250_000
                let response: (Data, HTTPURLResponse)? = tooBig ? nil : try await rawData(for: request)
                if range.count > 1, tooBig || response?.1.statusCode == 413 {
                    let mid = range.lowerBound + range.count / 2
                    pending.insert(contentsOf: [range.lowerBound..<mid, mid..<range.upperBound], at: 0)
                    continue
                }
                guard let response else { throw APIHTTPError(statusCode: 413, message: "Payload too large.") }
                let (data, http) = response
                guard 200..<300 ~= http.statusCode else { throw APIHTTPError.from(data, http) }
                for result in try JSONDecoder().decode(BatchResponse.self, from: data).results
                where result.index >= 0 && result.index < range.count {
                    upload.results[range.lowerBound + result.index] = result
                }
                upload.batches += 1
            } catch {
                upload.error = error
                return upload
            }
        }
        return upload
    }
}
```

3. **NEW `Shared/Services/HealthSyncItems.swift`**: the run's plan and summary, plus item and date helpers. About 195 lines.
```swift
import Foundation
import HealthKit

/// One run's plan (health-sync §8 rules 3–6), built by `HealthSyncPlanner`.
struct HealthSyncPlan {
    var items: [APIClient.HealthSyncItem] = []
    var eligible = Set<HealthSyncKey>()              // may get `sync_success` if every item comes back final (rule 2)
    var autoReviewed = Set<HealthSyncKey>()          // unreviewed with 0 rows → review_done silently (D-CONF 0-row)
    var reviewRows: [HealthSyncKind: [String: [PendingSyncConfirmation.Row]]] = [:]
    var held = Set<HealthSyncKind>()                 // lock / pending review / server skipped_locked (rule 5)
    var lockHeld = false                             // an admin lock held data → event outcome `partial`
    var noWindow = Set<HealthSyncKind>()             // data, but no selected program resolves a window → hold + failed
    var readFailed = Set<HealthSyncKind>()
    var holdWorkoutAnchor = false                    // rule 5 — any hold / failure touching workouts
    var newWorkoutAnchor: HKQueryAnchor?
    var catchUpDays = 0

    /// Rule 5: a server `skipped_locked` (the only non-final status) holds that (program, kind) like a client-side skip.
    mutating func applyServerHolds(_ upload: APIClient.HealthSyncUpload) -> Set<HealthSyncKey> {
        var keys = Set<HealthSyncKey>()
        for (index, item) in items.enumerated() where upload.results[index]?.status == "skipped_locked" {
            guard let kind = HealthSyncKind(rawValue: item.kind) else { continue }
            if let programId = item.program_id { keys.insert(HealthSyncKey(programId: programId, kind: kind)) }
            held.insert(kind)
            lockHeld = true
            if kind == .workout { holdWorkoutAnchor = true }
        }
        return keys
    }

    /// Rule 2: `sync_success` for every eligible (program, kind) not held; + `review_done` for the 0-row auto reviews.
    func stateEntries(excluding heldKeys: Set<HealthSyncKey>) -> [APIClient.HealthSyncStateEntry] {
        eligible.subtracting(heldKeys).map {
            APIClient.HealthSyncStateEntry(program_id: $0.programId, kind: $0.kind.rawValue,
                                           review_done: autoReviewed.contains($0) ? true : nil, sync_success: true)
        }
    }
}

/// One finished run → each kind's local status, the Sync Now outcome and the `sync.run` props (observability §8.1).
struct HealthSyncRunSummary {
    let trigger: HealthSyncEngine.Trigger
    let kinds: [HealthSyncKind]
    let started: Date
    var plan: HealthSyncPlan? = nil
    var upload: APIClient.HealthSyncUpload? = nil
    var error: Error? = nil
    var legacyRecorded = 0
    var sessionEnded = false

    /// `{ sent, applied, unchanged, duplicate, skipped, removed, invalid }` + `created` (stripped before sending).
    func counts(_ kind: HealthSyncKind) -> [String: Int] {
        var counts: [String: Int] = [:]
        guard let plan, let upload else { return counts }
        for (index, item) in plan.items.enumerated() where item.kind == kind.rawValue {
            guard let status = upload.results[index]?.status else { continue }
            counts["sent", default: 0] += 1
            switch status {
            case "created": counts["applied", default: 0] += 1; counts["created", default: 0] += 1
            case "updated": counts["applied", default: 0] += 1
            case "unchanged", "duplicate", "removed", "invalid": counts[status, default: 0] += 1
            case let other where other.hasPrefix("skipped_"): counts["skipped", default: 0] += 1
            default: break                                                    // recorded / not_found
            }
        }
        return counts
    }

    /// Workouts count every applied sample; sleep / steps only brand-new days (D-S4 "notify on new").
    func newCount(_ kind: HealthSyncKind) -> Int {
        let c = counts(kind)
        return kind == .workout ? c["applied", default: 0] : c["created", default: 0]
    }

    func status(_ kind: HealthSyncKind) -> HealthSyncPrefs.RunStatus {
        guard let plan, error == nil else { return .failed }
        if plan.readFailed.contains(kind) { return .readFailed }
        if plan.noWindow.contains(kind) { return .failed }                    // faithful to 1.4's `windows.isEmpty`
        return plan.held.contains(kind) ? .held(newCount(kind)) : .success(newCount(kind))
    }

    var dataChanged: Bool { kinds.contains { counts($0)["applied", default: 0] + counts($0)["removed", default: 0] > 0 } }

    var eventProps: [String: Any] {
        var props: [String: Any] = ["integration": "healthkit", "trigger": trigger.rawValue, "outcome": "failed",
                                    "duration_ms": Int(Date().timeIntervalSince(started) * 1000),
                                    "catch_up_days": plan?.catchUpDays ?? 0, "batches": upload?.batches ?? 0]
        for kind in kinds {
            var c = counts(kind)
            c.removeValue(forKey: "created")
            if (c["sent"] ?? 0) > 0 { props[kind.rawValue] = c }
        }
        var errorClass: Any = NSNull()
        let readFailed = plan?.readFailed ?? []
        if sessionEnded || error != nil {
            props["outcome"] = (upload?.batches ?? 0) > 0 ? "partial" : "failed"
            errorClass = sessionEnded ? "signedOut" : Self.errorClass(error)
        } else if let plan {
            if readFailed.count == kinds.count { props["outcome"] = "failed" }
            else if plan.lockHeld || !plan.noWindow.isEmpty || !readFailed.isEmpty { props["outcome"] = "partial" }
            else if plan.items.isEmpty && plan.reviewRows.isEmpty { props["outcome"] = "skipped" }
            else { props["outcome"] = "success" }
            if !readFailed.isEmpty { errorClass = "health_read_failed" }
        }
        props["error_class"] = errorClass
        if legacyRecorded > 0 { props["legacy_recorded"] = legacyRecorded }
        return props
    }

    /// §8.1 allows only these kit kinds; forbidden / notFound / conflict / a cancellation → `unknown`.
    private static func errorClass(_ error: Error?) -> String {
        guard let kind = error.flatMap({ AppError($0)?.kind }) else { return "unknown" }
        switch kind {
        case .offline, .timeout, .signedOut, .unavailable, .server, .invalidInput, .updateRequired: return kind.rawValue
        case .forbidden, .notFound, .conflict, .unknown: return "unknown"
        }
    }
}

/// Item + date helpers shared by the planner and the upgrade run.
enum HealthSyncItems {
    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
    private static let instantFormatter = ISO8601DateFormatter()
    private static let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    /// `yyyy-MM-dd` in the device's local time zone (§3.2 `date`).
    static func ymd(_ date: Date) -> String { dayFormatter.string(from: date) }
    static func isWithin(_ ymd: String, _ window: (start: String, end: String)) -> Bool { ymd >= window.start && ymd <= window.end }
    static func days(since start: Date) -> Int { max(0, Calendar.current.dateComponents([.day], from: start, to: Date()).day ?? 0) }
    static func instant(_ text: String?) -> Date? {
        guard let text else { return nil }
        return fractionalFormatter.date(from: text) ?? instantFormatter.date(from: text)
    }

    /// One workout sample → one item (§3.2; per-sample minutes, no client grouping).
    static func workoutItem(_ workout: HKWorkout, programId: String, date: String, legacy: Bool = false) -> APIClient.HealthSyncItem {
        APIClient.HealthSyncItem(kind: "workout", program_id: programId, date: date, sample_id: workout.uuid.uuidString,
                                 origin: origin(workout),
                                 workout_name: HealthKitWorkoutTypeMap.workoutName(for: workout.workoutActivityType),
                                 value: Double(max(1, Int((workout.duration / 60).rounded()))),
                                 start_at: instantFormatter.string(from: workout.startDate),
                                 end_at: instantFormatter.string(from: workout.endDate),
                                 legacy: legacy ? true : nil)
    }

    /// `origin` = the recording app's bundle id, limited to `A-Z a-z 0-9 . _ : -`, ≤ 255 chars.
    static func origin(_ sample: HKSample) -> String {
        let cleaned = sample.sourceRevision.source.bundleIdentifier.filter {
            $0.isASCII && ($0.isLetter || $0.isNumber || "._:-".contains($0))
        }
        return cleaned.isEmpty ? "unknown" : String(cleaned.prefix(255))
    }
}

extension APIClient.ProgramDTO {
    /// D-LOCK predicate (also behind `ProgramContext.isDataEntryLocked`): admin-only data entry and the viewer is
    /// neither a global admin nor this program's admin.
    func isDataEntryLocked(globalAdmin: Bool) -> Bool {
        admin_only_data_entry == true && !(globalAdmin || my_role?.lowercased() == "admin")
    }
}
```

4. Run `git mv Shared/Models/ProgramContext+HealthKitWindows.swift Shared/Services/HealthSyncPlanner.swift`.
   - Replace that file's first line (`import Foundation`) with the block below.
   - **Keep** the old `extension ProgramContext { … }` (`loadSyncWindows`, `localYMD`, `date(_:isWithin:)`) and its doc comment below it until 2b.
   - The new content is about 185 lines.
```swift
import Foundation
import HealthKit

/// Builds one run's plan: windows (D-S5) + admin locks (D-LOCK) from GET /programs, review + catch-up state from
/// GET /state, the member's prefs, then the HealthKit reads. Self-contained, so a background wake needs no UI.
struct HealthSyncPlanner {
    let member: String
    let states: [APIClient.HealthSyncStateRow]
    private let windows: [String: (start: String, end: String)]
    private let locked: Set<String>

    init(member: String, programs: [APIClient.ProgramDTO], states: [APIClient.HealthSyncStateRow], isGlobalAdmin: Bool) {
        self.member = member
        self.states = states
        let today = HealthSyncItems.ymd(Date())
        var windows: [String: (start: String, end: String)] = [:]
        for program in programs {
            guard let start = program.start_date, !start.isEmpty else { continue }
            let end = min(program.end_date ?? today, today)
            if start <= end { windows[program.id] = (start, end) }
        }
        self.windows = windows
        self.locked = Set(programs.filter { $0.isDataEntryLocked(globalAdmin: isGlobalAdmin) }.map(\.id))
    }

    private struct DayValue {
        let date: String; let value: Double; let title: String; let detail: String
        let payload: PendingSyncConfirmation.Payload
    }

    func plan(kinds: [HealthSyncKind]) async -> HealthSyncPlan {
        var plan = HealthSyncPlan()
        let service = HealthKitService.shared
        for kind in kinds {
            let start = catchUpStart(kind)
            do {
                switch kind {
                case .workout:
                    let anchor = HealthSyncPrefs.anchor(member: member)
                    let changes = try await service.fetchWorkoutChanges(anchor: anchor, since: start)
                    if anchor == nil { plan.catchUpDays = max(plan.catchUpDays, HealthSyncItems.days(since: start)) }
                    addWorkouts(changes, to: &plan)
                case .sleep:
                    let samples = try await service.fetchSleepSamples(from: start)
                    plan.catchUpDays = max(plan.catchUpDays, HealthSyncItems.days(since: start))
                    addDays(.sleep, service.aggregateSleep(samples).map {
                        DayValue(date: $0.date, value: $0.hours, title: "Sleep", detail: ProgramContext.formatHours($0.hours), payload: .sleep($0))
                    }, to: &plan)
                case .steps:
                    let totals = try await service.fetchStepsDailyTotals(from: start)
                    plan.catchUpDays = max(plan.catchUpDays, HealthSyncItems.days(since: start))
                    addDays(.steps, totals.map {
                        DayValue(date: $0.date, value: Double($0.count), title: "Steps", detail: ProgramContext.formatSteps($0.count), payload: .steps($0))
                    }, to: &plan)
                }
            } catch {
                plan.readFailed.insert(kind)
                if kind == .workout { plan.holdWorkoutAnchor = true }
            }
        }
        return plan
    }

    private func addWorkouts(_ changes: HealthKitService.WorkoutChanges, to plan: inout HealthSyncPlan) {
        plan.newWorkoutAnchor = changes.newAnchor
        let deleted = Set(changes.deletedIds)
        plan.items += changes.deletedIds.map { APIClient.HealthSyncItem(kind: "workout", sample_id: $0, deleted: true) }
        let workouts = changes.workouts.filter { !deleted.contains($0.uuid.uuidString) }   // never add + delete one id
        let selected = HealthSyncPrefs.programIds(.workout, member: member)
        if !workouts.isEmpty, !selected.contains(where: { windows[$0] != nil }) {
            plan.noWindow.insert(.workout)                   // faithful to 1.4: hold the anchor, status "failed"
            plan.holdWorkoutAnchor = true
            return
        }
        let excluded = HealthSyncPrefs.excluded(.workout, member: member)
        for programId in selected {
            guard let window = windows[programId] else { continue }
            let rows = workouts.filter { workout in
                let date = HealthSyncItems.ymd(workout.startDate)
                let name = HealthKitWorkoutTypeMap.workoutName(for: workout.workoutActivityType)
                return HealthSyncItems.isWithin(date, window)
                    && !excluded.contains(HealthSyncPrefs.exclusionKey(.workout, programId: programId, date: date, workoutName: name))
            }
            distribute(HealthSyncKey(programId: programId, kind: .workout), hasRows: !rows.isEmpty, to: &plan,
                       items: { rows.map { HealthSyncItems.workoutItem($0, programId: programId, date: HealthSyncItems.ymd($0.startDate)) } },
                       review: {
                           HealthKitService.shared.aggregate(rows).map { group in
                               PendingSyncConfirmation.Row(
                                   title: group.workoutName,
                                   subtitle: "\(ProgramContext.displayDate(group.date)) · \(group.durationMinutes) min",
                                   exclusionKey: HealthSyncPrefs.exclusionKey(.workout, programId: programId, date: group.date,
                                                                              workoutName: group.workoutName),
                                   payload: .workout(group))
                           }
                       })
        }
    }

    private func addDays(_ kind: HealthSyncKind, _ days: [DayValue], to plan: inout HealthSyncPlan) {
        let selected = HealthSyncPrefs.programIds(kind, member: member)
        if !days.isEmpty, !selected.contains(where: { windows[$0] != nil }) { plan.noWindow.insert(kind); return }
        let excluded = HealthSyncPrefs.excluded(kind, member: member)
        for programId in selected {
            guard let window = windows[programId] else { continue }
            let rows = days.filter {
                HealthSyncItems.isWithin($0.date, window)
                    && !excluded.contains(HealthSyncPrefs.exclusionKey(kind, programId: programId, date: $0.date))
            }
            distribute(HealthSyncKey(programId: programId, kind: kind), hasRows: !rows.isEmpty, to: &plan,
                       items: { rows.map { APIClient.HealthSyncItem(kind: kind.rawValue, program_id: programId, date: $0.date, value: $0.value) } },
                       review: {
                           rows.map {
                               PendingSyncConfirmation.Row(title: $0.title, subtitle: "\(ProgramContext.displayDate($0.date)) · \($0.detail)",
                                                           exclusionKey: HealthSyncPrefs.exclusionKey(kind, programId: programId, date: $0.date),
                                                           payload: $0.payload)
                           }
                       })
        }
    }

    private func distribute(_ key: HealthSyncKey, hasRows: Bool, to plan: inout HealthSyncPlan,
                            items: () -> [APIClient.HealthSyncItem], review: () -> [PendingSyncConfirmation.Row]) {
        if locked.contains(key.programId) {                                   // D-LOCK: filtered before sending → hold
            if hasRows { plan.lockHeld = true; hold(key.kind, in: &plan) }
            return
        }
        guard isReviewed(key) else {                                          // rule 6: review before the first upload
            if hasRows {
                plan.reviewRows[key.kind, default: [:]][key.programId] = review()
                hold(key.kind, in: &plan)
            } else {
                plan.autoReviewed.insert(key)
                plan.eligible.insert(key)
            }
            return
        }
        plan.items += items()
        plan.eligible.insert(key)
    }

    private func hold(_ kind: HealthSyncKind, in plan: inout HealthSyncPlan) {
        plan.held.insert(kind)
        if kind == .workout { plan.holdWorkoutAnchor = true }
    }

    /// Rule 4: from max(start of the local day of the oldest last_success_at − 1 day, today − 30 d). A never-synced
    /// program adds the first-sync rule (workouts: connect date, or today − 30 d with the upgrade marker; sleep/steps:
    /// the last 14 days). Only selected programs this run can write to (in-window, unlocked) count.
    private func catchUpStart(_ kind: HealthSyncKind) -> Date {
        let cal = Calendar.current
        let startOfToday = cal.startOfDay(for: Date())
        let floor = cal.date(byAdding: .day, value: -30, to: startOfToday) ?? startOfToday
        let writable = HealthSyncPrefs.programIds(kind, member: member).filter { windows[$0] != nil && !locked.contains($0) }
        let successes = writable.map { lastSuccess(HealthSyncKey(programId: $0, kind: kind)) }
        var candidates: [Date] = []
        if let oldest = successes.compactMap({ $0 }).min() {
            candidates.append(cal.date(byAdding: .day, value: -1, to: cal.startOfDay(for: oldest)) ?? floor)
        }
        if successes.isEmpty || successes.contains(where: { $0 == nil }) {
            switch kind {
            case .workout:
                candidates.append(HealthSyncPrefs.hasUpgradeMarker(member: member)
                                  ? floor : (HealthSyncPrefs.connectDate(.workout, member: member) ?? startOfToday))
            case .sleep, .steps:
                candidates.append(cal.date(byAdding: .day, value: -14, to: startOfToday) ?? startOfToday)
            }
        }
        return max(candidates.min() ?? floor, floor)
    }

    /// Rule 6 / D-C9: reviewed if ANY integration's row has review_done_at.
    private func isReviewed(_ key: HealthSyncKey) -> Bool {
        states.contains { $0.program_id == key.programId && $0.kind == key.kind.rawValue && $0.review_done_at != nil }
    }

    /// Rule 4: last_success_at is per integration — the `healthkit` row only.
    private func lastSuccess(_ key: HealthSyncKey) -> Date? {
        states.first { $0.integration == "healthkit" && $0.program_id == key.programId && $0.kind == key.kind.rawValue }
            .flatMap { HealthSyncItems.instant($0.last_success_at) }
    }

    /// Review pages, A→Z by program, newest rows first (the former `buildConfirmationPages`).
    static func pages(_ rows: [String: [PendingSyncConfirmation.Row]], programs: [APIClient.ProgramDTO]) -> [PendingSyncConfirmation.ProgramPage] {
        let names = Dictionary(programs.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
        return rows.compactMap { programId, rows -> PendingSyncConfirmation.ProgramPage? in
            guard !rows.isEmpty else { return nil }
            return PendingSyncConfirmation.ProgramPage(id: programId, programName: names[programId] ?? "Program",
                                                       rows: rows.sorted { $0.payload.ymd > $1.payload.ymd })
        }.sorted { $0.programName.localizedCaseInsensitiveCompare($1.programName) == .orderedAscending }
    }
}
```

5. **NEW `Shared/Services/HealthSyncUpgrade.swift`**:
```swift
import Foundation
import HealthKit

/// health-sync §8 rule 9 — once per member, before any normal batch and before the run's GET /state: send the old
/// build's "already sent" workouts as `legacy: true` (re-read by UUID; skipped when Health no longer has them), carry its
/// confirmed reviews over (`PUT review_done: true`), then delete the old ledger. The old anchor was already discarded and
/// the upgrade marker set by `HealthSyncPrefs.migrateLegacyIfNeeded()`; the marker stays.
enum HealthSyncUpgrade {
    static let legacyLedgerKey = "healthkit.appliedWorkoutUUIDs"
    static let legacyConfirmedKeys: [HealthSyncKind: String] = [
        .workout: "healthkit.confirmedProgramIds",
        .sleep: "healthkit.sleep.confirmedProgramIds",
        .steps: "healthkit.steps.confirmedProgramIds"
    ]

    private struct LegacyEntry { let uuid: UUID; let programId: String; let date: String }

    /// `error` non-nil fails the run (retried next trigger — idempotent). `recorded` → `legacy_recorded`.
    static func runIfPending(member: String) async -> (recorded: Int, error: Error?) {
        guard HealthSyncPrefs.upgradePending(member: member) else { return (0, nil) }
        let defaults = UserDefaults.standard
        let ledger = (defaults.dictionary(forKey: legacyLedgerKey) as? [String: String]) ?? [:]
        let entries = ledger.compactMap { key, date -> LegacyEntry? in
            let parts = key.split(separator: "|", maxSplits: 1).map(String.init)       // "uuid|programId" → stored day
            guard parts.count == 2, let uuid = UUID(uuidString: parts[0]) else { return nil }
            return LegacyEntry(uuid: uuid, programId: parts[1], date: date)
        }
        var recorded = 0
        do {
            let workouts = try await HealthKitService.shared.fetchWorkouts(uuids: Set(entries.map { $0.uuid }))
            let byId = Dictionary(workouts.map { ($0.uuid, $0) }, uniquingKeysWith: { first, _ in first })
            let items = entries.compactMap { entry in
                byId[entry.uuid].map { HealthSyncItems.workoutItem($0, programId: entry.programId, date: entry.date, legacy: true) }
            }
            let upload = await APIClient.shared.uploadHealthSync(items)        // every legacy status is final
            if let error = upload.error { throw error }
            recorded = upload.results.filter { $0?.status == "recorded" }.count
            let reviews = legacyConfirmedKeys.flatMap { kind, key in
                (defaults.stringArray(forKey: key) ?? []).map {
                    APIClient.HealthSyncStateEntry(program_id: $0, kind: kind.rawValue, review_done: true)
                }
            }
            try await APIClient.shared.putHealthSyncState(reviews)
        } catch {
            return (recorded, error)
        }
        defaults.removeObject(forKey: legacyLedgerKey)
        legacyConfirmedKeys.values.forEach { defaults.removeObject(forKey: $0) }
        HealthSyncPrefs.setUpgradePending(false, member: member)
        return (recorded, nil)
    }
}
```

6. **NEW `Shared/Services/HealthSyncEngine.swift`** (about 175 lines):
```swift
import Foundation
import HealthKit
import UIKit

/// health-sync §8 on iOS — ONE engine per device, a singleton (not the view-owned ProgramContext), so a HealthKit
/// background wake syncs without a scene (W3 F1). One run in flight (rule 1). A run = the rule-9 upgrade (once) →
/// GET /programs + GET /state → HealthKit reads → POST /batch → PUT /state → advance or hold (rule 5) → `sync.run`.
final class HealthSyncEngine {
    static let shared = HealthSyncEngine()
    private init() {}

    enum Trigger: String {
        case launch, foreground, background, connect, manual
        case pullToRefresh = "pull_to_refresh"
        case programEntry = "program_entry"
        /// Screen triggers fold into a run in flight and are spaced ≥ 60 s (member rate limiter). User actions and
        /// HealthKit wakes are never dropped — a wake may carry a sample the run in flight already read past.
        var isSpaced: Bool { self == .launch || self == .foreground || self == .programEntry }
    }

    /// UI hooks, set by ProgramContext (nil on a scene-less background launch — the run still works).
    var onRunFinished: ((HealthSyncReport) -> Void)?
    var onReviewNeeded: ((PendingSyncConfirmation) -> Void)?

    private var inFlight: Task<HealthSyncReport, Never>?
    private var runId = 0
    private var lastStart: Date?
    private var notBefore: Date?                                   // Retry-After of a 429 / 503 (rule 8)
    private var lastReport = HealthSyncReport()
    private var observedMember: String?
    private var observedKinds: Set<HealthSyncKind>?
    private var backgroundTask = UIBackgroundTaskIdentifier.invalid
    private static let spacing: TimeInterval = 60

    // MARK: - Observers (rule 1: at launch, every launch; HealthKit's handler is called after the work — W3 F2)

    func registerObservers() {
        guard UIApplication.shared.isProtectedDataAvailable else { return }   // before the first unlock: retried later
        let member = SessionStore.shared.memberId
        let kinds = Set(HealthSyncKind.allCases.filter { kind in member.map { HealthSyncPrefs.isActive(kind, member: $0) } ?? false })
        if observedKinds == kinds, observedMember == member { return }
        observedMember = member
        observedKinds = kinds
        HealthKitService.shared.observe(kinds) { done in
            Task { @MainActor in
                _ = await HealthSyncEngine.shared.run(.background)
                done()
            }
        }
    }

    /// Any sign-out: the run in flight is cancelled, observers stop, spacing resets. Per-member prefs are kept (rule 7).
    func pause() {
        inFlight?.cancel()
        inFlight = nil
        runId += 1
        lastStart = nil
        notBefore = nil
        lastReport = HealthSyncReport()
        observedMember = nil
        observedKinds = []
        HealthKitService.shared.observe([]) { done in done() }
    }

    func trigger(_ trigger: Trigger) { Task { _ = await run(trigger) } }

    @discardableResult
    func run(_ trigger: Trigger) async -> HealthSyncReport {
        if let current = inFlight {
            let report = await current.value
            if trigger.isSpaced { return report }
            if let newer = inFlight { return await newer.value }      // began after this trigger → it already covers it
        }
        if trigger.isSpaced, let lastStart, Date().timeIntervalSince(lastStart) < Self.spacing { return lastReport }
        if trigger.isSpaced || trigger == .background, let notBefore, Date() < notBefore { return lastReport }
        lastStart = Date()
        runId += 1
        let id = runId
        let task = Task { () -> HealthSyncReport in
            let report = await self.perform(trigger)
            if self.runId == id {                                     // not superseded by pause()
                self.inFlight = nil
                self.lastReport = report
            }
            return report
        }
        inFlight = task
        return await task.value
    }

    /// Review page commit (D-CONF): `PUT review_done: true` for one (program, kind).
    func markReviewed(programId: String, kind: HealthSyncKind) async -> Bool {
        (try? await APIClient.shared.putHealthSyncState([.init(program_id: programId, kind: kind.rawValue, review_done: true)])) != nil
    }

    // MARK: - The run

    private func perform(_ trigger: Trigger) async -> HealthSyncReport {
        guard HealthKitService.shared.isAvailable, SessionStore.shared.accessToken != nil,
              let member = SessionStore.shared.memberId else { return HealthSyncReport() }
        let kinds = HealthSyncKind.allCases.filter { HealthSyncPrefs.isActive($0, member: member) }
        guard !kinds.isEmpty else { return HealthSyncReport() }
        let began = beginBackgroundTask()
        defer { if began { endBackgroundTask() } }
        HealthSyncPrefs.pruneExcluded(member: member)
        var run = HealthSyncRunSummary(trigger: trigger, kinds: kinds, started: Date())
        let api = APIClient.shared

        // Rule 9 FIRST — the state read below then already holds the reviews the upgrade carried over.
        let upgrade = await HealthSyncUpgrade.runIfPending(member: member)
        run.legacyRecorded = upgrade.recorded
        if let error = upgrade.error { run.error = error; return finish(run, member: member) }

        let token = SessionStore.shared.accessToken ?? ""          // read here: async-let children never touch the store
        async let programsCall = api.fetchPrograms(token: token)
        async let stateCall = api.fetchHealthSyncState()
        let programs: [APIClient.ProgramDTO]
        let states: [APIClient.HealthSyncStateRow]
        do {
            programs = try await programsCall
            states = try await stateCall.states
        } catch {
            run.error = error
            return finish(run, member: member)
        }
        var plan = await HealthSyncPlanner(member: member, programs: programs, states: states,
                                           isGlobalAdmin: SessionStore.shared.isGlobalAdmin).plan(kinds: kinds)
        let upload = await api.uploadHealthSync(plan.items)
        run.upload = upload
        run.plan = plan
        if SessionStore.shared.memberId != member || SessionStore.shared.accessToken == nil {
            run.sessionEnded = true                                    // signed out mid-run: touch nothing else
            return finish(run, member: member)
        }
        if Task.isCancelled { run.error = CancellationError(); return finish(run, member: member) }   // out of bg time: hold
        let serverHeld = plan.applyServerHolds(upload)
        run.plan = plan
        run.error = upload.error
        if upload.error == nil {
            try? await api.putHealthSyncState(plan.stateEntries(excluding: serverHeld))
            if kinds.contains(.workout), !plan.holdWorkoutAnchor, let anchor = plan.newWorkoutAnchor {
                HealthSyncPrefs.setAnchor(anchor, member: member)
            }
        }
        for (kind, rows) in plan.reviewRows {
            let pages = HealthSyncPlanner.pages(rows, programs: programs)
            if !pages.isEmpty { onReviewNeeded?(PendingSyncConfirmation(flow: kind.flow, pages: pages)) }
        }
        if let retryAfter = (upload.error as? APIHTTPError)?.retryAfter {
            notBefore = Date().addingTimeInterval(TimeInterval(retryAfter))
        }
        return finish(run, member: member)
    }

    /// Local status (D-SIL), the success notification (D7 / D-S4), the UI hook and the `sync.run` event. A run whose
    /// session ended only reports `signedOut`.
    private func finish(_ run: HealthSyncRunSummary, member: String) -> HealthSyncReport {
        var run = run
        if SessionStore.shared.memberId != member { run.sessionEnded = true }
        var report = HealthSyncReport()
        if !run.sessionEnded {
            for kind in run.kinds {
                let status = run.status(kind)
                HealthSyncPrefs.recordRun(kind, member: member, status)
                report.kinds[kind] = status.outcome
                switch status {
                case .success(let count), .held(let count):
                    switch kind {
                    case .workout: HealthKitSyncNotifier.notifySuccess(count: count)
                    case .sleep: HealthKitSyncNotifier.notifySleepSuccess(count: count)
                    case .steps: HealthKitSyncNotifier.notifyStepsSuccess(count: count)
                    }
                case .failed, .readFailed:
                    break
                }
            }
            report.dataChanged = run.dataChanged
            onRunFinished?(report)
        }
        ClientEventQueue.shared.recordSyncRun(run.eventProps)
        return report
    }

    /// true = this run began the background task (and must end it).
    private func beginBackgroundTask() -> Bool {
        guard backgroundTask == .invalid else { return false }
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "health-sync") { [weak self] in
            self?.inFlight?.cancel()                 // out of background time: the run holds, retried next trigger
            self?.endBackgroundTask()
        }
        return true
    }

    private func endBackgroundTask() {
        guard backgroundTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTask)
        backgroundTask = .invalid
    }
}
```

7. **`Shared/Services/HealthKitService.swift`**: additions only (the old code stays in 2a).
   - Under `private var observerQuery: HKObserverQuery?` (`:16`), add `private var observerQueries: [HealthSyncKind: HKObserverQuery] = [:]`.
   - Before `// MARK: - Aggregation` (`:120`), add:
```swift
    // MARK: - health-sync v2 (HealthSyncEngine / HealthSyncPlanner / HealthSyncUpgrade)

    static func sampleType(for kind: HealthSyncKind) -> HKSampleType {
        switch kind {
        case .workout: return HKObjectType.workoutType()
        case .sleep: return HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
        case .steps: return HKQuantityType.quantityType(forIdentifier: .stepCount)!
        }
    }

    func requestAuthorization(for kind: HealthSyncKind) async throws {
        switch kind {
        case .workout: try await requestAuthorization()
        case .sleep: try await requestSleepAuthorization()
        case .steps: try await requestStepsAuthorization()
        }
    }

    struct WorkoutChanges {
        let workouts: [HKWorkout]
        let deletedIds: [String]
        let newAnchor: HKQueryAnchor?
    }

    /// Workouts added since `anchor` + the ids HealthKit deleted (§8 rule 3). With no anchor (first run, a new member,
    /// the upgrade run) it reads from `start` — the rule-4 catch-up window. The caller persists the anchor.
    func fetchWorkoutChanges(anchor: HKQueryAnchor?, since start: Date) async throws -> WorkoutChanges {
        let predicate = anchor == nil ? HKQuery.predicateForSamples(withStart: start, end: nil, options: .strictStartDate) : nil
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKAnchoredObjectQuery(type: HKObjectType.workoutType(), predicate: predicate, anchor: anchor,
                                              limit: HKObjectQueryNoLimit) { _, samples, deleted, newAnchor, error in
                if let error { continuation.resume(throwing: error); return }
                continuation.resume(returning: WorkoutChanges(workouts: (samples ?? []).compactMap { $0 as? HKWorkout },
                                                              deletedIds: (deleted ?? []).map { $0.uuid.uuidString },
                                                              newAnchor: newAnchor))
            }
            healthStore.execute(query)
        }
    }

    /// Re-read workouts by UUID (rule 9). Samples Health no longer has are simply absent.
    func fetchWorkouts(uuids: Set<UUID>) async throws -> [HKWorkout] {
        guard !uuids.isEmpty else { return [] }
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: HKQuery.predicateForObjects(with: uuids),
                                      limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                if let error { continuation.resume(throwing: error); return }
                continuation.resume(returning: (samples ?? []).compactMap { $0 as? HKWorkout })
            }
            healthStore.execute(query)
        }
    }

    /// Rule 1, Apple's way: observer queries + background delivery for `kinds` (workouts `.immediate`, sleep / steps
    /// `.hourly` — Apple's cap), disabled for the rest. `onWake` receives HealthKit's completion handler and must call
    /// it once the run is over — never before the work (W3 F2).
    func observe(_ kinds: Set<HealthSyncKind>, onWake: @escaping @Sendable (@escaping () -> Void) -> Void) {
        guard isAvailable else { return }
        for kind in HealthSyncKind.allCases {
            if let query = observerQueries.removeValue(forKey: kind) { healthStore.stop(query) }
            let type = Self.sampleType(for: kind)
            guard kinds.contains(kind) else {
                healthStore.disableBackgroundDelivery(for: type) { _, _ in }
                continue
            }
            let query = HKObserverQuery(sampleType: type, predicate: nil) { _, completionHandler, error in
                guard error == nil else { completionHandler(); return }
                onWake(completionHandler)
            }
            observerQueries[kind] = query
            healthStore.execute(query)
            healthStore.enableBackgroundDelivery(for: type, frequency: kind == .workout ? .immediate : .hourly) { _, _ in }
        }
    }
```

8. **`Shared/Services/HealthKitService+Sleep.swift`**: replace `fetchSleepSamples()` (`:47-69`) with:
```swift
    func fetchSleepSamples() async throws -> [HKCategorySample] {      // 2b deletes this overload
        let startOfToday = Calendar.current.startOfDay(for: Date())
        return try await fetchSleepSamples(from: Calendar.current.date(byAdding: .day, value: -Self.sleepRecentDays, to: startOfToday) ?? startOfToday)
    }

    /// health-sync §8 rule 4: every sample overlapping `[start of start's day, now]` (the catch-up window).
    func fetchSleepSamples(from start: Date) async throws -> [HKCategorySample] {
        let predicate = HKQuery.predicateForSamples(withStart: Calendar.current.startOfDay(for: start), end: Date(), options: [])
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: Self.sleepType, predicate: predicate, limit: HKObjectQueryNoLimit,
                                      sortDescriptors: nil) { _, samples, error in
                if let error { continuation.resume(throwing: error); return }
                continuation.resume(returning: (samples ?? []).compactMap { $0 as? HKCategorySample })
            }
            Self.sleepStore.execute(query)
        }
    }
```

9. **`Shared/Services/HealthKitService+Steps.swift`**:
   - Rename the current `fetchStepsDailyTotals()` (`:47`) to `fetchStepsDailyTotals(from start: Date)`, with doc comment `/// health-sync §8 rule 4: per-day totals over the catch-up window.`
   - In its body, replace the two lines `let startOfToday = …` and `let start = …` (`:49-50`) with:
     `let startOfToday = Calendar.current.startOfDay(for: now)`
     `let start = Calendar.current.startOfDay(for: start)`
     Everything else stays: `anchorDate: startOfToday`, enumerating `from: start, to: now`.
   - Above it, add the forwarder:
     ```swift
     func fetchStepsDailyTotals() async throws -> [AggregatedSteps] {     // 2b deletes this overload
         let startOfToday = Calendar.current.startOfDay(for: Date())
         return try await fetchStepsDailyTotals(from: Calendar.current.date(byAdding: .day, value: -Self.stepsRecentDays, to: startOfToday) ?? startOfToday)
     }
     ```

**⌘B checkpoint 2a.**

**2b: switch over and delete. ⌘B checkpoint at the end.**

10. **`Shared/Services/HealthSyncPrefs.swift`**: delete the old `enum HealthKitAppliedLedger { … }` and its doc comment.
    **`Shared/Services/HealthSyncPlanner.swift`**: delete the old `extension ProgramContext { … }` (`loadSyncWindows`, `localYMD`, `date(_:isWithin:)`) and its doc comment.

11. **`Shared/Services/HealthKitService.swift`**:
    - Delete `observerQuery`, `anchorKey`, `loadAnchor`, `commitAnchor`, `clearAnchor`, `FetchResult`, `fetchNewWorkouts`, `startBackgroundDelivery` and `stopBackgroundDelivery`.
    - New type doc: `/// HealthKit access for the health-sync v2 engine: authorization, workout changes (anchored, with deletions), reads by UUID, observers + background delivery, and the (type, day) grouping used by the first-sync review rows.`

12. **`HealthKitService+Sleep.swift`**: delete the no-arg `fetchSleepSamples()`, `sleepRecentDays`, `sleepObserverQuery`, `startSleepBackgroundDelivery` and `stopSleepBackgroundDelivery`.
    **`HealthKitService+Steps.swift`**: delete the no-arg `fetchStepsDailyTotals()`, `stepsRecentDays`, `stepsObserverQuery`, `startStepsBackgroundDelivery` and `stopStepsBackgroundDelivery`.
    In both files, change doc comments that say "rolling 14 days" to say "catch-up window (health-sync §8 rule 4)".

13. **`Shared/Services/APIClient+Workouts.swift`**: delete from `// MARK: - HealthKit auto-sync write` (`:261`) through the end of `writeHealthKitWorkoutLog`. Keep the extension's closing `}`. This is health-sync rule 11.
    **`APIClient+DailyHealth.swift`**: delete the header doc comment, `DailyHealthWriteOutcome`, `writeHealthKitSleepLog` and `writeHealthKitStepsLog` (`:3-136`). Keep `import Foundation`, `extension APIClient {`, and everything from `// MARK: - Daily-health list` on.

14. **`Shared/Models/ProgramContext+HealthKit.swift`**: replace the whole file.
```swift
import Foundation

/// Apple Health on ProgramContext (health-sync §8 on iOS): the @Published mirror AppleHealthSettingsView binds to and
/// the connect / Sync Now / disconnect actions. The sync itself is `HealthSyncEngine` (a singleton, so a HealthKit
/// background wake syncs without a scene); settings live per member in `HealthSyncPrefs`. Workouts here;
/// `+HealthKitSleep` / `+HealthKitSteps` are the same four verbs for their kind.
extension ProgramContext {

    func configureHealthSyncHooks() {
        HealthSyncEngine.shared.onRunFinished = { [weak self] report in
            self?.reloadHealthSyncMirror()
            if report.dataChanged { self?.summaryRefreshToken += 1 }       // a sync that landed data reloads Summary
        }
        HealthSyncEngine.shared.onReviewNeeded = { [weak self] in self?.enqueuePendingConfirmation($0) }
    }

    /// Re-read the signed-in member's prefs into the mirror (everything off when signed out).
    func reloadHealthSyncMirror() {
        HealthSyncPrefs.migrateLegacyIfNeeded()
        let member = SessionStore.shared.memberId
        func enabled(_ kind: HealthSyncKind) -> Bool { member.map { HealthSyncPrefs.isEnabled(kind, member: $0) } ?? false }
        func ids(_ kind: HealthSyncKind) -> Set<String> { member.map { HealthSyncPrefs.programIds(kind, member: $0) } ?? [] }
        func last(_ kind: HealthSyncKind) -> Date? { member.flatMap { HealthSyncPrefs.lastSyncDate(kind, member: $0) } }
        func count(_ kind: HealthSyncKind) -> Int { member.map { HealthSyncPrefs.lastSyncCount(kind, member: $0) } ?? 0 }
        func failed(_ kind: HealthSyncKind) -> Bool { member.map { HealthSyncPrefs.lastSyncFailed(kind, member: $0) } ?? false }
        isHealthKitEnabled = enabled(.workout); healthKitSyncProgramIds = ids(.workout)
        lastHealthKitSyncDate = last(.workout); lastHealthKitSyncCount = count(.workout); lastHealthKitSyncFailed = failed(.workout)
        isSleepSyncEnabled = enabled(.sleep); sleepSyncProgramIds = ids(.sleep)
        lastSleepSyncDate = last(.sleep); lastSleepSyncCount = count(.sleep); lastSleepSyncFailed = failed(.sleep)
        isStepsSyncEnabled = enabled(.steps); stepsSyncProgramIds = ids(.steps)
        lastStepsSyncDate = last(.steps); lastStepsSyncCount = count(.steps); lastStepsSyncFailed = failed(.steps)
    }

    func startHealthKitSync() { connectHealthSync(.workout) }
    @discardableResult func performHealthKitSync() async -> HealthSyncOutcome { await syncNow(.workout) }
    func persistHealthKitSettings() { savePrefs(.workout, enabled: isHealthKitEnabled, programIds: healthKitSyncProgramIds) }
    func clearHealthKitSettings() { disconnectHealthSync(.workout) }

    // MARK: - Shared by the three kinds

    func connectHealthSync(_ kind: HealthSyncKind) {
        guard HealthKitService.shared.isAvailable, let member = SessionStore.shared.memberId else { return }
        HealthKitSyncNotifier.requestAuthorizationIfNeeded()
        Task {
            do {
                try await HealthKitService.shared.requestAuthorization(for: kind)
                HealthSyncPrefs.markConnected(kind, member: member)
                reloadHealthSyncMirror()
                HealthSyncEngine.shared.registerObservers()
                _ = await HealthSyncEngine.shared.run(.connect)
            } catch {
                reloadHealthSyncMirror()
            }
        }
    }

    /// Disconnect (D-IOS-SYNC-3): this kind's connection prefs (+ the workout anchor) and its observer. Exclusions and
    /// the server's review state are kept — a reconnect resumes without a review (health-sync rule 6).
    func disconnectHealthSync(_ kind: HealthSyncKind) {
        guard let member = SessionStore.shared.memberId else { return }
        HealthSyncPrefs.disconnect(kind, member: member)
        reloadHealthSyncMirror()
        HealthSyncEngine.shared.registerObservers()
    }

    /// Sync Now = the `manual` trigger (one run for every active kind); returns this kind's outcome.
    func syncNow(_ kind: HealthSyncKind) async -> HealthSyncOutcome {
        await HealthSyncEngine.shared.run(.manual).result(for: kind)
    }

    func savePrefs(_ kind: HealthSyncKind, enabled: Bool, programIds: Set<String>) {
        guard let member = SessionStore.shared.memberId else { return }
        HealthSyncPrefs.save(kind, member: member, enabled: enabled, programIds: programIds)
        HealthSyncEngine.shared.registerObservers()            // a kind gains / loses its first program
    }
}
```

15. **`ProgramContext+HealthKitSleep.swift`**: replace the whole file with the code below.
    **`ProgramContext+HealthKitSteps.swift`**: same shape, using `startStepsSync`, `performStepsSync`, `persistStepsSyncSettings`, `clearStepsSyncSettings`, `.steps`, `isStepsSyncEnabled` and `stepsSyncProgramIds`.
```swift
import Foundation

/// Apple Health SLEEP — the workouts verbs for `.sleep` over HealthSyncEngine (see ProgramContext+HealthKit).
extension ProgramContext {
    func startSleepSync() { connectHealthSync(.sleep) }
    @discardableResult func performSleepSync() async -> HealthSyncOutcome { await syncNow(.sleep) }
    func persistSleepSyncSettings() { savePrefs(.sleep, enabled: isSleepSyncEnabled, programIds: sleepSyncProgramIds) }
    func clearSleepSyncSettings() { disconnectHealthSync(.sleep) }
}
```

16. **`ProgramContext+HealthSyncGating.swift`**: replace the whole file. It contains, in order:
    - the extension below;
    - `enqueuePendingConfirmation` copied **verbatim** from `:158-191`;
    - `promoteDeferredConfirmation` copied **verbatim** from `:209-228`;
    - `displayDate`, `formatHours` and `formatSteps` copied **verbatim** from `:128-150`.

    Everything else in the old file is deleted.
```swift
/// First-sync review on ProgramContext (D-CONF on health-sync §8 rule 6): the presentation queue (one flow at a time,
/// workouts > sleep > steps), the per-page commit HealthSyncConfirmationView calls, and display helpers. Review state is
/// server-side (`review_done_at`, any integration — D-C9); exclusions are local per member (`HealthSyncPrefs`).
extension ProgramContext {

    @MainActor func commitWorkoutPage(_ page: PendingSyncConfirmation.ProgramPage) async -> Bool { await commitReviewPage(page, kind: .workout) }
    @MainActor func commitSleepPage(_ page: PendingSyncConfirmation.ProgramPage) async -> Bool { await commitReviewPage(page, kind: .sleep) }
    @MainActor func commitStepsPage(_ page: PendingSyncConfirmation.ProgramPage) async -> Bool { await commitReviewPage(page, kind: .steps) }

    /// Record this page's unchecked rows as excluded (never sent — rule 3), then `PUT review_done: true` for the
    /// (program, kind). `false` = couldn't reach the server (the view's retry notice). The checked rows upload in the
    /// follow-up run `finishConfirmation` starts (the workout anchor was held for them — D-IOS-SYNC-2).
    @MainActor private func commitReviewPage(_ page: PendingSyncConfirmation.ProgramPage, kind: HealthSyncKind) async -> Bool {
        guard let member = SessionStore.shared.memberId else { return false }
        HealthSyncPrefs.addExcluded(page.rows.filter { !$0.isChecked }.map(\.exclusionKey), kind, member: member)
        return await HealthSyncEngine.shared.markReviewed(programId: page.id, kind: kind)
    }

    /// Called by the view when it finishes (committed) or is dismissed (deferred — re-offered next trigger).
    @MainActor
    func finishConfirmation(_ flow: PendingSyncConfirmation.Flow, committed: Bool) {
        promoteDeferredConfirmation()
        if committed { HealthSyncEngine.shared.trigger(.manual) }    // upload what was just reviewed
    }
}
```

17. **`Shared/Models/ProgramContext.swift`**:
    - In `init`, after `observeSessionLifecycle()`, add `configureHealthSyncHooks()`.
    - Replace the body of `isDataEntryLocked(programId:)` with `programs.first(where: { $0.id == programId })?.isDataEntryLocked(globalAdmin: isGlobalAdmin) ?? false`. Keep its doc comment.

18. **`ProgramContext+Auth.swift`**:
    - In `restorePersistedSession()`, replace `restoreHealthKitSettings(); restoreSleepSyncSettings(); restoreStepsSyncSettings()` with `reloadHealthSyncMirror()`.
    - In `applyAuthResponse`, after `persistSession()`, add `reloadHealthSyncMirror()`. The signed-in member's prefs (and the legacy migration) load before the token flip.

19. **`ProgramContext+Session.swift`**:
    - In `SessionTeardown.end`, replace the `// step 2 adds` line with `HealthSyncEngine.shared.pause()`.
    - In `clearInMemorySession()`, replace the step-2 comment with:
      ```swift
      pendingSyncConfirmation = nil
      deferredSleepConfirmation = nil
      deferredStepsConfirmation = nil
      reloadHealthSyncMirror()
      ```
    - Replace `sessionDidBecomeActive()` with:
      ```swift
      /// Launch / foreground / sign-in: stream, data reload decoupled from the token (rule 2), event flush, and a
      /// health-sync run (rule 1). Observers re-register only when the member / active kinds changed.
      func sessionDidBecomeActive(_ trigger: HealthSyncEngine.Trigger) {
          startNotificationStreamIfNeeded()
          Task { await reloadSessionData() }
          Task { await ClientEventQueue.shared.flush() }
          HealthSyncEngine.shared.registerObservers()
          HealthSyncEngine.shared.trigger(trigger)
      }
      ```

20. **`App/AppRootView.swift`**: use `sessionDidBecomeActive(.launch)` in `.task` and in `onChange(authToken)`, and `sessionDidBecomeActive(.foreground)` in the scenePhase handler.

21. **`App/AppDelegate.swift`**: in `didFinishLaunchingWithOptions`, after the `UNUserNotificationCenter…delegate` line, add:
```swift
        // health-sync §8 rule 1 (W3 F1): observers + background delivery register at launch, every launch — a HealthKit
        // background launch has no scene. Before the first unlock nothing is readable: both retry once data is available.
        HealthSyncPrefs.migrateLegacyIfNeeded()
        HealthSyncEngine.shared.registerObservers()
        NotificationCenter.default.addObserver(forName: UIApplication.protectedDataDidBecomeAvailableNotification,
                                               object: nil, queue: .main) { _ in
            MainActor.assumeIsolated {
                HealthSyncPrefs.migrateLegacyIfNeeded()
                HealthSyncEngine.shared.registerObservers()
            }
        }
        Task { await ClientEventQueue.shared.flush() }
```

22. **`Features/Home/AdminHomeView.swift`**: replace the `.task { … }` (`:63-70`) with `.task { HealthSyncEngine.shared.trigger(.programEntry) }`.

23. **No change** is needed to `AppleHealthSettingsView.swift`, `HealthSyncConfirmationView.swift`, `PendingSyncConfirmation.swift` or `HealthKitSyncNotifier.swift`. Every symbol they use keeps its name and shape.
    - "Last Synced" now means the last unheld, fully uploaded run.
    - Sync Now is the `manual` trigger.
    - Disconnect follows D-IOS-SYNC-3.

**⌘B checkpoint 2b.**

### Step 3: Push and invites (notifications §3.1–3.3, invites §3.1)

1. **`Shared/Services/NotificationStreamClient.swift`**: replace the whole file.
```swift
import Foundation

/// notifications §3.3 SSE client. Frames: `event: ready` (opened) · `event: ping` (25 s keepalive) · `event:
/// notification` + the 7-field payload. EVERY close or error is reported through `onClose` and the owner reconnects
/// (a plain close on deploy is not an error). Delegate callbacks run on the main queue; no resource cap (60 s idle
/// timeout > the 25 s ping, so a silent stream times out and reconnects). The session is invalidated on every close
/// (a URLSession retains its delegate until then).
final class NotificationStreamClient: NSObject {
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var buffer = ""
    private var refusedStatus: Int?
    private var closed = false
    private let decoder = JSONDecoder()

    var onReady: (() -> Void)?
    var onNotification: ((APIClient.NotificationDTO) -> Void)?
    /// The HTTP status when the open was refused (401 → refresh first), nil for a plain close / network error.
    var onClose: ((Int?) -> Void)?

    func connect(token: String, baseURL: URL = APIConfig.activeBaseURL) {
        disconnect()
        closed = false
        refusedStatus = nil
        var request = URLRequest(url: baseURL.appendingPathComponent("notifications/stream"))
        request.httpMethod = "GET"
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        APIClient.identityHeaders.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Request-Id")
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 60
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
        self.session = session
        let task = session.dataTask(with: request)
        self.task = task
        task.resume()
    }

    /// Intentional close — never reported through `onClose`.
    func disconnect() {
        closed = true
        task?.cancel()
        task = nil
        session?.invalidateAndCancel()
        session = nil
        buffer = ""
    }

    private func dispatch(event: String?, data: String) {
        switch event {
        case "ready": onReady?()
        case "ping": return
        default:                                                    // "notification" (unnamed frames tolerated)
            guard !data.isEmpty, data != "{}", let bytes = data.data(using: .utf8),
                  let notification = try? decoder.decode(APIClient.NotificationDTO.self, from: bytes) else { return }
            onNotification?(notification)
        }
    }

    private func processBuffer() {
        while let range = buffer.range(of: "\n\n") {
            let rawEvent = String(buffer[..<range.lowerBound])
            buffer.removeSubrange(buffer.startIndex..<range.upperBound)
            var event: String?
            var dataLines: [String] = []
            for line in rawEvent.split(separator: "\n") {
                if line.hasPrefix("event:") { event = line.dropFirst(6).trimmingCharacters(in: .whitespaces) }
                else if line.hasPrefix("data:") { dataLines.append(line.dropFirst(5).trimmingCharacters(in: .whitespaces)) }
            }
            dispatch(event: event, data: dataLines.joined(separator: "\n"))
        }
    }
}

extension NotificationStreamClient: URLSessionDataDelegate {
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        if dataTask === task, let http = response as? HTTPURLResponse, http.statusCode != 200 {
            refusedStatus = http.statusCode                          // 401 token / 503 auth_unavailable
            completionHandler(.cancel)
            return
        }
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard dataTask === task, let chunk = String(data: data, encoding: .utf8) else { return }
        buffer.append(chunk)
        processBuffer()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        session.finishTasksAndInvalidate()                          // releases the delegate (no leak per reconnect)
        guard task === self.task, !closed else { return }
        closed = true
        self.task = nil
        self.session = nil
        onClose?(refusedStatus)
    }
}
```

2. **`Shared/Models/ProgramContext.swift`**: after `notificationIds` (`:149`), add `var streamReconnectTask: Task<Void, Never>?` and `var streamAttempt = 0`.

3. **`Shared/Models/ProgramContext+Notifications.swift`**: replace the whole file.
```swift
import Foundation

extension ProgramContext {
    // MARK: - Real-time stream (notifications §3.3): foreground only; every close reconnects with a fresh token,
    // exponential backoff + full jitter (1 s base, 30 s cap); every `ready` re-fetches /unacknowledged + merges by id.

    @MainActor
    func startNotificationStreamIfNeeded() {
        guard authToken != nil, notificationStreamClient == nil, streamReconnectTask == nil else { return }
        streamReconnectTask = Task { @MainActor [weak self] in
            guard let self else { return }
            let token = await APIClient.shared.validAccessToken()      // refreshed when it expires within 60 s
            self.streamReconnectTask = nil
            guard let token, self.authToken != nil else { return }
            let client = NotificationStreamClient()
            client.onReady = { [weak self] in
                self?.streamAttempt = 0
                Task { await self?.loadUnacknowledgedNotifications() }
            }
            client.onNotification = { [weak self] notification in self?.enqueueNotification(notification) }
            client.onClose = { [weak self] status in self?.streamClosed(status: status) }
            self.notificationStreamClient = client
            client.connect(token: token)
        }
    }

    @MainActor
    private func streamClosed(status: Int?) {
        notificationStreamClient = nil
        guard authToken != nil else { return }
        streamAttempt += 1
        let delay = Double.random(in: 0...min(30, pow(2, Double(streamAttempt - 1))))
        streamReconnectTask = Task { @MainActor [weak self] in
            if status == 401 { _ = try? await APIClient.shared.refreshAccessToken() }   // a 401 here → teardown
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard let self, !Task.isCancelled else { return }
            self.streamReconnectTask = nil
            self.startNotificationStreamIfNeeded()
        }
    }

    /// Backgrounded: close the stream, keep the modal queue (resumes on foreground).
    @MainActor
    func suspendNotificationStream() {
        streamReconnectTask?.cancel()
        streamReconnectTask = nil
        notificationStreamClient?.disconnect()
        notificationStreamClient = nil
        streamAttempt = 0
    }

    /// Sign-out teardown: close + clear.
    @MainActor
    func stopNotificationStream() {
        suspendNotificationStream()
        notificationQueue = []
        notificationIds = []
    }

    /// Idempotent re-fetch after every `ready` — MERGE by id (the stream never replays).
    @MainActor
    func loadUnacknowledgedNotifications() async {
        guard let token = authToken,
              let items = try? await APIClient.shared.fetchUnacknowledgedNotifications(token: token) else { return }
        for item in items where !notificationIds.contains(item.id) {
            notificationIds.insert(item.id)
            notificationQueue.append(item)
        }
        notificationQueue = sortNotifications(notificationQueue)
    }

    @MainActor
    func acknowledgeNotification(_ notification: APIClient.NotificationDTO) async {
        guard let token = authToken else { return }
        notificationQueue.removeAll { $0.id == notification.id }
        notificationIds.remove(notification.id)
        do {
            _ = try await APIClient.shared.acknowledgeNotification(token: token, notificationId: notification.id)
        } catch {
            await loadUnacknowledgedNotifications()
        }
    }

    @MainActor
    func acknowledgeNotificationById(_ notificationId: String) {
        guard let token = authToken, !notificationId.isEmpty else { return }
        notificationQueue.removeAll { $0.id == notificationId }
        notificationIds.remove(notificationId)
        Task { _ = try? await APIClient.shared.acknowledgeNotification(token: token, notificationId: notificationId) }
    }

    /// notifications §3.2 clients: a tapped push = acknowledge + re-fetch what it is about. No new navigation
    /// (D-IOS-PUSH-2) — push is only a hint.
    @MainActor
    func handlePushTap(notificationId: String, type: String?) {
        acknowledgeNotificationById(notificationId)
        Task { await refreshData(forType: type ?? "") }
    }

    @MainActor
    private func enqueueNotification(_ notification: APIClient.NotificationDTO) {
        guard !notificationIds.contains(notification.id) else { return }
        notificationIds.insert(notification.id)
        notificationQueue.append(notification)
        notificationQueue = sortNotifications(notificationQueue)
        Task { @MainActor in await refreshData(forType: notification.type) }
    }

    @MainActor
    private func refreshData(forType type: String) async {
        if type == "program.invite_received" {          // invites §3.1: the inbox is always GET /my-invites
            try? await loadPendingInvites()
            await loadLookupData()
            return
        }
        if ["program.role_changed", "program.member_removed", "program.member_left", "program.member_joined",
            "program.admin_transferred", "program.updated", "program.deleted"].contains(type) {
            await loadLookupData()
            if programId != nil { await loadMembershipDetails() }
        }
    }

    private func sortNotifications(_ items: [APIClient.NotificationDTO]) -> [APIClient.NotificationDTO] {
        return items.sorted { lhs, rhs in
            let lhsDate = lhs.createdAt.flatMap { notificationDateFormatter.date(from: $0) } ?? .distantPast
            let rhsDate = rhs.createdAt.flatMap { notificationDateFormatter.date(from: $0) } ?? .distantPast
            return lhsDate < rhsDate
        }
    }
}
```

4. **`App/AppDelegate.swift`**: replace the whole file. Step 5 adds one more line.
```swift
import UIKit
import UserNotifications

/// The stored APNs device token (DeviceRegistry re-sends it with every sign-in's registration ride-along).
enum PushTokenNotification {
    static let userDefaultsKey = "rf_push_device_token"
}

/// Push hand-offs to AppRootView: a tap (notification_id + type) and a foreground `program.invite_received`.
enum PushNotificationTapped {
    static let notificationName = Notification.Name("RaSiFitersPushNotificationTapped")
    static let inviteReceived = Notification.Name("RaSiFitersInviteReceived")
    static let notificationIdKey = "notification_id"
    static let typeKey = "type"
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        // health-sync §8 rule 1 (W3 F1): observers + background delivery register at launch, every launch — a HealthKit
        // background launch has no scene. Before the first unlock nothing is readable: both retry once data is available.
        HealthSyncPrefs.migrateLegacyIfNeeded()
        HealthSyncEngine.shared.registerObservers()
        NotificationCenter.default.addObserver(forName: UIApplication.protectedDataDidBecomeAvailableNotification,
                                               object: nil, queue: .main) { _ in
            MainActor.assumeIsolated {
                HealthSyncPrefs.migrateLegacyIfNeeded()
                HealthSyncEngine.shared.registerObservers()
            }
        }
        Task { await ClientEventQueue.shared.flush() }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        DeviceRegistry.shared.register(pushToken: tokenString)       // notifications §3.1: rotation → the registry queue
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Simulator or misconfiguration; token will not be available.
    }

    /// Foreground: show the banner; an invite push also refreshes the inbox (invites §3.1).
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        if notification.request.content.userInfo[PushNotificationTapped.typeKey] as? String == "program.invite_received" {
            NotificationCenter.default.post(name: PushNotificationTapped.inviteReceived, object: nil)
        }
        completionHandler([.banner, .sound, .badge])
    }

    /// Tap → acknowledge + re-fetch (AppRootView → ProgramContext.handlePushTap). `program_id` is unused (no routing).
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        if let notificationId = userInfo[PushNotificationTapped.notificationIdKey] as? String, !notificationId.isEmpty {
            var info: [String: String] = [PushNotificationTapped.notificationIdKey: notificationId]
            if let type = userInfo[PushNotificationTapped.typeKey] as? String { info[PushNotificationTapped.typeKey] = type }
            NotificationCenter.default.post(name: PushNotificationTapped.notificationName, object: nil, userInfo: info)
        }
        completionHandler()
    }
}
```

5. **`App/AppRootView.swift`**:
   - Delete the `.onReceive(PushTokenNotification.didUpdate …)` handler (`:74-77`).
   - Replace the tap `.onReceive` (`:78-81`) with:
     ```swift
     .onReceive(NotificationCenter.default.publisher(for: PushNotificationTapped.notificationName)) { note in
         guard let id = note.userInfo?[PushNotificationTapped.notificationIdKey] as? String else { return }
         programContext.handlePushTap(notificationId: id, type: note.userInfo?[PushNotificationTapped.typeKey] as? String)
     }
     .onReceive(NotificationCenter.default.publisher(for: PushNotificationTapped.inviteReceived)) { _ in
         Task { try? await programContext.loadPendingInvites() }
     }
     ```
   - Replace the whole `.onChange(of: scenePhase)` with the version below. The self-healing comment is copied verbatim from the current `:103-108`.
     ```swift
     .onChange(of: scenePhase) { _, phase in
         switch phase {
         case .active:
             Task { @MainActor in
                 await programContext.checkMinimumSupportedVersion()
                 if programContext.authToken == nil {
                     programContext.restorePersistedSession()      // D-IOS-AUTH-3; a restored token → onChange(authToken)
                     return
                 }
                 programContext.sessionDidBecomeActive(.foreground)
                 let settings = await UNUserNotificationCenter.current().notificationSettings()
                 switch settings.authorizationStatus {
                 case .authorized, .provisional, .ephemeral:
                     // Self-healing registration: re-request a fresh APNs token on every
                     // foreground while authorized. iOS does NOT re-register when the user flips
                     // the OS-level toggle — the app must call this itself — so a token that was
                     // pruned server-side (e.g. after an APNs sandbox→production env change) is
                     // otherwise never resent. The call is cheap + idempotent; the resulting
                     // didRegister callback re-sends the token through DeviceRegistry.
                     UIApplication.shared.registerForRemoteNotifications()
                 case .denied:
                     DeviceRegistry.shared.unregister()     // §3.1: permission revoked → POST /device/unregister (no login)
                 default:
                     break
                 }
             }
         case .background:
             programContext.suspendNotificationStream()     // §3.3: the stream lives in the foreground only
         default:
             break
         }
     }
     ```

6. **`ProgramContext+Auth.swift`**: delete `registerPushTokenIfNeeded(_:)` and `deregisterPushTokenIfDenied(deviceToken:)`.
   **`APIClient+Auth.swift`**: delete `deregisterDevice(token:pushToken:)` (`:88-100`).

7. **`Shared/Models/ProgramContext+ProgramManagement.swift`**:
   - Replace `loadPendingInvites()` (`:113-127`) with the version below.
   - In `respondToInvite(…)`, change `await loadPendingInvites()` to `try? await loadPendingInvites()`.
```swift
    /// The invite inbox (invites §3.1): global admins GET /all-invites, everyone else GET /my-invites. Throws — the
    /// caller decides (InvitesTabView shows the kit error view; the picker badge stays silent).
    @MainActor
    func loadPendingInvites() async throws {
        guard let token = authToken, !token.isEmpty else { return }
        pendingInvites = isGlobalAdmin
            ? try await APIClient.shared.fetchAllInvites(token: token)
            : try await APIClient.shared.fetchMyInvites(token: token)
    }
```

8. **`Features/Home/ProgramActions/InvitesTabView.swift`**:
   - Add `@State private var loadError: AppError?`.
   - In the content chain, right after the `if isLoading { … }` branch (`:46-53`), insert:
     ```swift
     } else if let loadError, programContext.pendingInvites.isEmpty {
         ErrorStateView(error: loadError, onRetry: { Task { await refreshInvites() } })   // W7 i10: never "No pending invitations" on failure
             .padding(.horizontal, 20)
             .padding(.top, 20)
     ```
   - Move the `.alert("Unable to update invitation", …)` from `adminInvitesList` (`:172-176`) to the root view, right after its `.task { … }`. Use the binding `Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })` so both lists show response errors.
   - After that `.alert`, add:
     ```swift
     .floatingBanner {
         if loadError != nil, !programContext.pendingInvites.isEmpty {
             FloatingBanner(variant: .stale, onRetry: { Task { await refreshInvites() } })
         }
     }
     ```
   - Replace `refreshInvites()` with:
     ```swift
     private func refreshInvites() async {
         isLoading = programContext.pendingInvites.isEmpty
         defer { isLoading = false }
         do { try await programContext.loadPendingInvites(); loadError = nil }
         catch { loadError = AppError(error) }
     }
     ```
   - In `respondToInvite`, change the catch to `errorMessage = AppError(error)?.message`. A 400 shows the server's text; everything else shows kit copy.

9. **`Features/Home/ProgramManagement/InviteMemberView.swift`**:
   - Replace the header comment (`:8-11`) with: `// invites §3.1 (0.2.0): privacy is server-side — POST /invite answers 200 "Invitation sent" for unknown / blocked / already-member usernames. "Invitation sent" shows ONLY on 200; every other status goes through the frontend kit (the old client-side swallow is removed).`
   - Replace the catch block (`:161-172`) with `errorMessage = AppError(error)?.message`.
   - Change `Text("Invite sent")` (`:181`) to `Text("Invitation sent")`.

10. **`Features/Home/ProgramPickerView.swift`**: change `await programContext.loadPendingInvites()` at `:128` and `:145` to `try? await programContext.loadPendingInvites()`. Step 5 rewrites these anyway.

**⌘B checkpoint 3.**

### Step 4: Google button

Not applicable to iOS (Android W5 only).

### Step 5: Kit adoption and instant opens (board §6 item 5, D-9)

1. **NEW `Shared/Services/LaunchCache.swift`**:
```swift
import Foundation
import CryptoKit

/// Instant opens (board §6 item 5, D-9): the last good 2xx body of each launch-screen GET (program picker + Summary),
/// on disk per member, shown first and then refreshed. Raw bytes, so no DTO needs Encodable. Cleared by the sign-out
/// teardown (every member).
final class LaunchCache {
    static let shared = LaunchCache()
    private init() {}

    private let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("launch-cache", isDirectory: true)

    func data(for url: URL) -> Data? {
        guard let file = fileURL(for: url) else { return nil }
        return try? Data(contentsOf: file)
    }

    func store(_ data: Data, for url: URL) {
        guard let file = fileURL(for: url) else { return }
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: file, options: .atomic)
    }

    func clearAll() { try? FileManager.default.removeItem(at: root) }

    /// `<root>/<member id>/<sha256 of path?query>`; nil when nobody is signed in.
    private func fileURL(for url: URL) -> URL? {
        guard let member = SessionStore.shared.memberId else { return nil }
        let key = url.path + "?" + (url.query ?? "")
        let digest = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
        return root.appendingPathComponent(member, isDirectory: true).appendingPathComponent(digest)
    }
}

extension APIClient {
    enum LaunchRead { case network, cacheOnly }
    struct LaunchCacheMiss: Error {}

    /// Launch-screen GET: `.network` fetches (central auth path) and stores the 2xx body; `.cacheOnly` returns the
    /// stored body for the identical URL or throws `LaunchCacheMiss`.
    func launchData(for request: URLRequest, _ read: LaunchRead) async throws -> Data {
        guard let url = request.url else { throw LaunchCacheMiss() }
        switch read {
        case .cacheOnly:
            guard let cached = LaunchCache.shared.data(for: url) else { throw LaunchCacheMiss() }
            return cached
        case .network:
            let data = try await data(for: request)
            LaunchCache.shared.store(data, for: url)
            return data
        }
    }
}
```

2. **`Shared/Services/APIClient+Programs.swift`**, `fetchPrograms` (`:44`): add a last parameter `read: LaunchRead = .network`, and replace `let data = try await data(for: request)` with `let data = try await launchData(for: request, read)`.
   **`Shared/Services/APIClient+Analytics.swift`**: make the same two edits in:
   - `fetchAnalyticsSummary` (`:108`)
   - `fetchMTDParticipation` (`:129`)
   - `fetchTotalWorkoutsMTD` (`:143`)
   - `fetchTotalDurationMTD` (`:157`)
   - `fetchAvgDurationMTD` (`:171`)
   - `fetchActivityTimeline` (`:185`)
   - `fetchDistributionByDay` (`:228`)
   - `fetchWorkoutTypes` (`:242`, with `read` after `limit`)

   Other callers compile unchanged through the default value.

3. **`Shared/Models/ProgramContext+Analytics.swift`**:
   - Delete `loadAnalytics`, `loadDistributionByDay`, `loadMTDParticipation`, `loadTotalWorkoutsMTD`, `loadTotalDurationMTD` and `loadAvgDurationMTD` (`:6-124`). Only `AdminSummaryTab` called them.
   - Keep `loadActivityTimeline` and `loadWorkoutTypes` untouched.
   - Insert at the top of the extension:
```swift
    /// Summary tab (board §6 item 5 + D-9): the 8 loads in PARALLEL, cache-only when `read == .cacheOnly`. Every load
    /// that succeeded is applied; the first failure is rethrown so the tab goes stale / failed (frontend-kit §5).
    @MainActor
    func loadSummary(period: String, timelinePeriod: String, read: APIClient.LaunchRead) async throws {
        guard let pid = programId else { throw AppError(kind: .notFound) }
        let api = APIClient.shared
        let token = authToken ?? ""
        async let summaryCall = api.fetchAnalyticsSummary(token: token, period: period, programId: pid, read: read)
        async let mtdCall = api.fetchMTDParticipation(token: token, programId: pid, read: read)
        async let workoutsCall = api.fetchTotalWorkoutsMTD(token: token, programId: pid, read: read)
        async let durationCall = api.fetchTotalDurationMTD(token: token, programId: pid, read: read)
        async let averageCall = api.fetchAvgDurationMTD(token: token, programId: pid, read: read)
        async let timelineCall = api.fetchActivityTimeline(token: token, period: timelinePeriod, programId: pid, read: read)
        async let distributionCall = api.fetchDistributionByDay(token: token, programId: pid, read: read)
        async let typesCall = api.fetchWorkoutTypes(token: token, programId: pid, read: read)
        var failure: Error?
        var summary: AnalyticsSummary?
        var mtd: APIClient.MTDParticipationDTO?
        var workouts: APIClient.TotalWorkoutsMTDDTO?
        var duration: APIClient.TotalDurationMTDDTO?
        var average: APIClient.AvgDurationMTDDTO?
        var timeline: APIClient.ActivityTimelineResponse?
        var distribution: APIClient.DistributionByDayDTO?
        var types: [APIClient.WorkoutTypeDTO]?
        do { summary = try await summaryCall } catch { failure = failure ?? error }
        do { mtd = try await mtdCall } catch { failure = failure ?? error }
        do { workouts = try await workoutsCall } catch { failure = failure ?? error }
        do { duration = try await durationCall } catch { failure = failure ?? error }
        do { average = try await averageCall } catch { failure = failure ?? error }
        do { timeline = try await timelineCall } catch { failure = failure ?? error }
        do { distribution = try await distributionCall } catch { failure = failure ?? error }
        do { types = try await typesCall } catch { failure = failure ?? error }
        try Task.checkCancellation()                     // superseded by a newer .task(id:) — never apply late results
        if let s = summary {
            totalLogsThisPeriod = s.totals.logs
            totalWorkouts = s.totals.logs
            totalDurationHours = Int(round(Double(s.totals.duration_minutes) / 60.0))
            averageDurationMinutes = s.totals.avg_duration_minutes
            logsChangePct = s.totals.logs_change_pct
            durationChangePct = s.totals.duration_change_pct
            avgDurationChangePct = s.totals.avg_duration_change_pct
            atRiskMembers = s.members.at_risk
            timelinePoints = s.timeline
            distributionByDay = s.distribution_by_day
            topPerformers = s.top_performers
            topWorkoutTypes = s.top_workout_types
            lastFetchedPeriod = period
            distributionByDayCounts = s.distribution_by_day.mapValues { $0.workouts }
        }
        if let mtd { mtdParticipation = mtd }
        if let workouts { totalWorkoutsMTD = workouts.total_workouts; totalWorkoutsChangePct = workouts.change_pct }
        if let duration {
            totalDurationHoursMTD = ((Double(duration.total_minutes) / 60.0) * 10).rounded() / 10.0
            totalDurationChangePct = duration.change_pct
        }
        if let average { avgDurationMinutesMTD = average.avg_minutes; avgDurationChangePctMTD = average.change_pct }
        if let timeline {
            activityTimeline = timeline.buckets
            activityTimelineLabel = timeline.label
            activityTimelineDailyAverage = timeline.daily_average
        }
        if let d = distribution {
            distributionByDayCounts = ["Sunday": d.Sunday, "Monday": d.Monday, "Tuesday": d.Tuesday, "Wednesday": d.Wednesday,
                                       "Thursday": d.Thursday, "Friday": d.Friday, "Saturday": d.Saturday]
        }
        if let types { workoutTypes = types }
        if let failure { throw failure }
    }
```

4. **`Features/Home/Tabs/AdminSummaryTab.swift`**:
   - Replace `@State private var isLoading` and `errorMessage` (`:15-16`) with `@State private var loadState: LoadState<Void> = .idle`.
   - Replace `if let errorMessage { errorBanner(errorMessage) }` (`:40-42`) with:
     ```swift
     if case .failed(let error) = loadState {
         ErrorStateView(error: error, onRetry: { Task { await load() } })   // no data: kit error view, cards stay usable
     }
     ```
   - On the `ScrollView`, after its `.frame(maxWidth: .infinity)` (`:80`), add:
     ```swift
     .refreshable {
         let report = await HealthSyncEngine.shared.run(.pullToRefresh)       // health-sync rule 1
         if !report.dataChanged { await load() }    // data landed → the hook bumped summaryRefreshToken → .task(id:) reloads
     }
     ```
   - Replace the modifiers `:82-97` (`.task` through the `summaryRefreshToken` `onChange`) with:
     ```swift
     .floatingBanner { LaunchScreenBanner(screenBanner: staleBanner) }
     .onAppear { restoreOrder() }
     .task(id: SummaryLoadKey(programId: programContext.programId, period: period.apiValue,
                              timelinePeriod: timelinePeriod.apiValue, refresh: programContext.summaryRefreshToken)) {
         await load()          // a newer key cancels the running load (W7 F5 — replaces `guard !isLoading`)
     }
     .onChange(of: programContext.programId) { _, _ in
         restoreOrder()
         Task { await programContext.loadLookupData() }
     }
     .onChange(of: programContext.isOnline) { _, online in
         if online, loadState.error != nil { Task { await load() } }       // D-IOS-KIT-3: refetch on reconnect
     }
     ```
   - Delete `errorBanner(_:)` (`:102-122`).
   - Replace `load()` (`:146-160`) with the code below.
   - At the end of the file, add `private struct SummaryLoadKey: Equatable { let programId: String?; let period: String; let timelinePeriod: String; let refresh: Int }`.
```swift
    /// Instant open (D-9): cached Summary first, then the network; the 8 loads run in parallel (ProgramContext.loadSummary).
    private func load() async {
        if loadState.value == nil,
           (try? await programContext.loadSummary(period: period.apiValue, timelinePeriod: timelinePeriod.apiValue, read: .cacheOnly)) != nil {
            loadState = .loaded((), fetchedAt: Date(), refreshing: true)
        }
        loadState = loadState.refreshing()
        do {
            try await programContext.loadSummary(period: period.apiValue, timelinePeriod: timelinePeriod.apiValue, read: .network)
            loadState = .fresh(())
        } catch {
            guard let appError = AppError(error) else { return }      // cancelled = superseded, not a failure
            loadState = loadState.failing(with: appError)
        }
    }

    private var staleBanner: FloatingBanner? {
        guard case .stale = loadState else { return nil }
        return FloatingBanner(variant: .stale, onRetry: { Task { await load() } })
    }
```

5. **`Features/Home/Tabs/SummaryChartCards.swift`**: delete the `ProgressView()` line (`:94`) inside `if points.isEmpty` in `ActivityTimelineCardSummary`. "No data yet" stays. This fixes W7 F3. Nothing else changes.

6. **`Features/Home/ProgramPickerView.swift`**:
   - Replace `isLoading` / `errorMessage` (`:7-8`) with `@State private var loadState: LoadState<[APIClient.ProgramDTO]> = .idle` and `@State private var actionError: AppError?`.
   - Replace the List rows `:49-71`, from the `// D-C1` comment through the opening of the `noMatchesState` branch, with the block below. The existing `noMatchesState` and `ForEach` branches continue unchanged.
     ```swift
     if case .failed(let error) = loadState, programContext.programs.isEmpty {
         ErrorStateView(error: error, onRetry: { Task { await load() } })
             .listRowSeparator(.hidden)
             .listRowBackground(Color.clear)
     } else if case .loading = loadState {
         ProgressView()
             .padding(.top, 12)
             .listRowSeparator(.hidden)
             .listRowBackground(Color.clear)
     } else if programContext.programs.isEmpty {
         emptyState
             .listRowSeparator(.hidden)
             .listRowBackground(Color.clear)
     } else if visiblePrograms.isEmpty {
     ```
   - Directly before `.navigationBarBackButtonHidden(true)` (`:125`), add:
     `.floatingBanner(bottomInset: 150) { LaunchScreenBanner(screenBanner: pickerBanner) }   // clears the FAB stack (56+14+56+24)`
   - Replace `.task { … }` (`:126-129`) with:
     ```swift
     .task { await load() }
     .onChange(of: programContext.isOnline) { _, online in
         if online, loadState.error != nil { Task { await load() } }       // D-IOS-KIT-3
     }
     ```
   - Replace the ProgramActionsSheet `onDismiss` body (`:143-146`) with `Task { await load() }`.
   - In `deleteProgram`, change the catch body to `actionError = AppError(error)`.
   - In `respondToInvite(program:accept:)`, change the success line to `await load()` and the catch body to `actionError = AppError(error)`.
   - In `moveProgram`, inside `MainActor.run`: keep `programContext.programs = previousOrder`, and replace the `errorMessage = …` line with:
     `if let appError = AppError(error) { actionError = AppError(kind: appError.kind, message: "Couldn't save program order. \(appError.message)") }`
   - In `signOutEverywhere()` (step 1.20), change the catch to `actionError = AppError(error)`.
   - Delete `errorBanner(_:)` (`:428-449`).
   - Replace `loadPrograms()` (`:513-531`) with:
```swift
    /// Instant open (D-9): cached programs first, then the network; programs + invites load in parallel (board §6.5).
    private func load() async {
        if loadState.value == nil {
            if !programContext.programs.isEmpty {
                loadState = .loaded(programContext.programs, fetchedAt: Date(), refreshing: true)
            } else if let cached = try? await APIClient.shared.fetchPrograms(token: programContext.authToken ?? "", read: .cacheOnly) {
                programContext.programs = cached
                loadState = .loaded(cached, fetchedAt: Date(), refreshing: true)
            }
        }
        loadState = loadState.refreshing()
        async let invites: Void = loadInvites()
        do {
            let programs = try await APIClient.shared.fetchPrograms(token: programContext.authToken ?? "")
            programContext.programs = programs
            loadState = .fresh(programs)
        } catch {
            if let appError = AppError(error) { loadState = loadState.failing(with: appError) }
        }
        await invites
    }

    /// The picker's invite badge — silent on failure (InvitesTabView shows the error).
    private func loadInvites() async { try? await programContext.loadPendingInvites() }

    /// The screen's own banner: a failed action (dismissable) beats "Couldn't refresh" over kept data.
    private var pickerBanner: FloatingBanner? {
        if let actionError { return FloatingBanner(variant: .error(actionError), onDismiss: { self.actionError = nil }) }
        if case .stale = loadState { return FloatingBanner(variant: .stale, onRetry: { Task { await load() } }) }
        return nil
    }
```
   - No pull-to-refresh on the picker: the custom header overlay would hide the control (D-IOS-KIT-2).

7. **`App/AppRootView.swift`**:
   - Delete the `"You're offline"` `.alert` (`:164-178`).
   - At the end of the file, before `#Preview`, add:
```swift
/// The ONE floating banner of a launch screen (program picker, Summary — frontend-kit §6, D-KIT-8, D-IOS-KIT-1):
/// offline beats the screen's own stale / error banner, which beats update-available (step 6). Never two at once.
struct LaunchScreenBanner: View {
    @EnvironmentObject private var programContext: ProgramContext
    var screenBanner: FloatingBanner? = nil

    var body: some View {
        if !programContext.isOnline {
            FloatingBanner(variant: .offline)
        } else if let screenBanner {
            screenBanner
        }
    }
}
```

8. **`Shared/Models/ProgramContext.swift`**: replace `@Published var isOffline` and `offlineNotice` (`:99-100`) with:
   `@Published var isOnline = true          // mirror of NetworkMonitor (frontend-kit §5, one monitor per app)`

9. **`ProgramContext+Session.swift`**:
   - In `SessionTeardown.end`, replace the `// step 5 adds` line with `LaunchCache.shared.clearAll()`.
   - In `observeSessionLifecycle()`, replace the step-5 comment with `NetworkMonitor.shared.$isOnline.removeDuplicates().assign(to: &$isOnline)`.

10. **`App/AppDelegate.swift`**: in `didFinishLaunching`, before `return true`, add `NetworkMonitor.shared.start()   // frontend-kit §5: started once, at launch`.

**⌘B checkpoint 5.**

### Step 6: Version-gate UI (app-config §3, iOS consumption)

1. **`Shared/Models/ProgramContext.swift`**: after `minimumSupportedVersion` (`:98`), add `@Published var updateAvailableVersion: String?`.

2. **`Shared/Models/ProgramContext+VersionCheck.swift`**: replace `checkMinimumSupportedVersion()` (`:6-23`) with the code below. The private helpers (`:25-49`) stay.
```swift
    private static let dismissedUpdateKey = "appconfig.dismissedLatestIOSVersion"

    /// app-config §3: installed < min_ios_version → the blocking ForcedUpdateModalView (unchanged); else installed <
    /// latest_ios_version → the dismissable "Update available" banner, once per version (D-KIT-9). Fails open.
    @MainActor
    func checkMinimumSupportedVersion() async {
        guard let config = try? await APIClient.shared.fetchAppConfig() else { return }
        let current = currentAppVersion()
        let minimum = Self.normalized(config.min_ios_version)
        minimumSupportedVersion = minimum
        isUpdateRequired = minimum.map { isVersion(current, lessThan: $0) } ?? false
        if !isUpdateRequired, let latest = Self.normalized(config.latest_ios_version), isVersion(current, lessThan: latest),
           UserDefaults.standard.string(forKey: Self.dismissedUpdateKey) != latest {
            updateAvailableVersion = latest
        } else {
            updateAvailableVersion = nil
        }
    }

    @MainActor
    func dismissUpdateBanner() {
        guard let version = updateAvailableVersion else { return }
        UserDefaults.standard.set(version, forKey: Self.dismissedUpdateKey)
        updateAvailableVersion = nil
    }

    private static func normalized(_ value: String?) -> String? {
        let text = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return text.isEmpty ? nil : text
    }
```

3. **`App/AppRootView.swift`**, in `LaunchScreenBanner`:
   - Add `@Environment(\.openURL) private var openURL`.
   - Append this branch after the `screenBanner` branch. `ForcedUpdateModalView` stays the blocking screen, unchanged.
```swift
        } else if programContext.updateAvailableVersion != nil {
            FloatingBanner(variant: .updateAvailable,
                           onDismiss: { programContext.dismissUpdateBanner() },
                           onUpdate: { openURL(APIConfig.appStoreURL) })
        }
```

**⌘B checkpoint 6.**

### Step 7: Binary version and surface docs

1. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App.xcodeproj/project.pbxproj`** (USER DECISION, recommended):
   - All 4 `CURRENT_PROJECT_VERSION = 57;` (`:374`, `:413`, `:450`, `:475`) → `58;`.
   - All 4 `MARKETING_VERSION = 1.4.3;` (`:393`, `:432`, `:461`, `:486`) → `1.5.0;`.
   - Nothing else changes.
   - After 1.5.0 (58) is uploaded as the App Store candidate, the orchestrator pre-bumps to 1.5.1 (59).

2. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/CONTEXT.md`**:
   - **"Apple Health auto-sync"**: rewrite as health-sync v2.
     - The `HealthSyncEngine` singleton; observers in `AppDelegate`, acknowledged after the run inside `beginBackgroundTask`.
     - `POST /api/health-sync/batch` and `GET|PUT /state`; per-sample items with deletions; the 30-day catch-up.
     - Per-member `HealthSyncPrefs`. Sign-out pauses; Disconnect clears the connection prefs only.
     - The rule-9 upgrade runs before the state read.
     - The review is server-side.
     - `sync.run` events.
     - Screen triggers are spaced 60 s apart; background wakes never.
   - **"Auth (client side)"**: add §3.1 bullets.
     - One cached keychain pair item (`AfterFirstUnlockThisDeviceOnly`); the old items migrate on first read.
     - A locked keychain at launch is re-read on unlock or foreground.
     - The token is read at send time. Refresh happens within 60 s of expiry or on a 401, single-flight, with one retry within 5 s and then 30 s of back-off.
     - Sign-out happens only on a `/refresh` 401.
     - `SessionTeardown` is the single teardown; the event queue survives it.
     - Sign out everywhere is in the account menu.
     - 15 s timeout; `X-App-*` and `X-Request-Id` headers.
   - **"Staging"**: "Run session/auth checks (sign out everywhere, password change) on the Staging scheme first. Launch cache, sync prefs and the event queue are per member/install, so switching schemes after a sign-out is safe."
   - **"Deploy"**: `latest_ios_version` drives the soft "Update available" banner.

3. **iOS page SPECs** under `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/ios/`. For each one:
   - bump the header Version MINOR where the page has one;
   - add the §9 row below;
   - add a §11 changelog row in the file's own format, dated 2026-10-13, reading "reliability Phase 3 C2".

| Page | Version | §9 row |
|---|---|---|
| `login` | 0.2.2→0.3.0 | **D-C5** `auth.sign_in_failed` (password / google / apple; `provider` kind for an SDK failure; cancellations excluded). Credential copy: server text for 400/401/409/422, kit copy otherwise (D-IOS-AUTH-2). Device-registry ride-along. |
| `create-account` | 0.2.2→0.3.0 | **D-C11**: same events for the social buttons and the post-register login; `/oauth/complete` → `DeviceRegistry.register()`. |
| `program-picker` | 0.2.2→0.3.0 | **D-C2**: instant open (cache, then network); programs and invites in parallel; the kit `ErrorStateView`, stale banner and dismissable action-error banner replace the D-C1 inline banner; one `LaunchScreenBanner` at `bottomInset: 150` (offline > screen > update); refetch on reconnect; no pull-to-refresh (D-IOS-KIT-2). **D-C3**: `AccountMenuSheet` gains a "Sign out everywhere" row and alert (`SessionCopy`); Sign Out runs the teardown. Update §8 States. |
| `program-actions` | 0.1.0→0.2.0 | **D-C1**: a failed inbox load shows `ErrorStateView`; a failed refresh with data shows the stale banner; response errors use kit copy in both lists. |
| `program-member-management` | 0.1.0→0.2.0 | **D-C4**: "Invitation sent" only on 200; the swallow is removed. |
| `admin-members` | changelog only | **D-C1**: same note for the Invite entry. |
| `admin-home` | changelog only | **D-C1**: program entry = `HealthSyncEngine.trigger(.programEntry)`, all active kinds. |
| `admin-summary` | changelog only | **D-C3**: 8 parallel loads; `LoadState` + `.task(id:)`; cache-first; `ErrorStateView` replaces the D-C1 banner; stale banner; `.refreshable` awaits a `pull_to_refresh` sync; reload when a sync lands data; refetch on reconnect; the timeline spinner fix. |
| `apple-health` | 0.4.0→0.5.0 | **D-V2**: health-sync v2 under the same UI. Last Synced = last unheld, fully uploaded run. Sync Now = `manual`. Disconnect clears connection prefs only, with no review on reconnect (rule 6). Sign-out pauses. The review is server-side across devices and platforms. |
| `change-password` | 0.1.0→0.2.0 | **D-C4**: rule-6 copy; a same-password 400 after an unconfirmed attempt counts as success; never auto-retried. |
| `my-profile` | 0.1.0→0.2.0 | **D-C4**: rule 6 for set-password. No layout change. |
| `notifications` | 0.1.0→0.2.0 | **D-C1**: permission denied → `POST /device/unregister` (no login), replacing the Bearer DELETE. |

`splash` gets no change: the root decision is unchanged, and a locked keychain only defers the restore.

## Endgame

8. **Compile checks.**
   - iOS: the **user presses ⌘B** in Xcode at checkpoints 1a, 1b, 2a, 2b, 3, 5 and 6, and after 7.1. Never use the xcode MCP build. Claude fixes the reported errors per the `ios-build` skill.
   - Backend, web and Android are untouched, so they need no commands.
   - There are no test suites. All runtime and visual testing is the user's, on prod by default.
   - **User test checklist (iPhone; health data entered by hand in the Health app):**
     - **STAGING FIRST** (`RaSi-Fiters-App-Staging` scheme, a `+stg` account, wake `rasifiters-api-staging` first):
       - **S1:** Sign in on the iPhone and on web staging. Account menu → "Sign out everywhere" → confirm. The iPhone returns to sign-in; web staging signs out at its next refresh.
       - **S2:** Change the password on the iPhone. The iPhone stays signed in; the other device signs out within about 1 h. Turn on airplane mode, try again, then go back online and retry the same password by hand → "Password Updated".
       - **S3:** Leave the app for more than 1 h, then reopen. No logout, and staging `[refresh]` logs show exactly one refresh.
       - **S4:** With the iPhone app open, use Sign out everywhere from web. The iPhone signs out at its next refresh with no alert, and `app_events` has `auth.forced_sign_out` with reason `refresh_session_invalid`.
     - **PROD, upgrade:** install 1.5.0 over App Store 1.4.2 with workouts, sleep and steps connected.
       - No review screen appears.
       - A known day's workout minutes are unchanged.
       - Settings shows Last Synced.
       - `app_events` has a `sync.run` with `legacy_recorded` > 0.
     - **PROD, sync:**
       - Add a workout by hand and return to the app. It appears in Summary within about a minute, or right away after pull-to-refresh.
       - Delete it in Health and return → the minutes subtract.
       - Deselect every workout program, add a workout, reselect the program, pull to refresh → it syncs (anchor held).
       - Sign out and back in as the same member → toggles stay on, no review. A different member sees toggles off.
       - Disconnect sleep and reconnect → no review; Last Synced fills after the connect run.
     - **PROD, instant opens and offline:**
       - Kill and reopen the app → the picker and Summary show the last data instantly, then refresh.
       - In airplane mode → cached data plus the "You're offline" banner; no logout and no alert. Back online → the data refreshes by itself.
     - **PROD, push and invites:**
       - Invite a real username and an unknown one → "Invitation sent" both times. Invite while offline → kit offline text.
       - A web invite while the app is open → the badge updates.
       - Tap a push → it is acknowledged and no modal appears.
       - Background the app, then foreground it → an SSE notification missed while backgrounded shows on return.
     - **PROD, version gate** (the orchestrator sets the Render env):
       - `LATEST_IOS_VERSION=1.5.1` → the banner shows on the picker and Summary; dismiss it → it stays gone.
       - `MIN_IOS_VERSION` above the installed version → the blocking modal (try this on staging).

9. **Migration:** none. No DB change; only live routes are used.

10. **git-version:** one commit per step on `main`, in C2's order.
    - Step 1: auth PATCH + observability MINOR.
    - Step 2: apple-health MINOR + health-sync MINOR.
    - Step 3: notifications PATCH + invites PATCH.
    - Step 5: frontend-kit MINOR.
    - Step 6: app-config PATCH.
    - Step 7: the page bumps + `chore(ios): 1.5.0 (58)`.
    - The orchestrator reconciles the shared feature bumps with C1 and C3 (multi-track lesson); tag only on `main`.

## Risks the implementer must watch

- **Concurrency mode.**
  - Everything is implicitly `@MainActor`.
  - `NotificationStreamClient` uses `delegateQueue: .main`.
  - `observe`'s `@Sendable onWake` only hops with `Task { @MainActor in }`.
  - Never read `SessionStore` or `ProgramContext` inside an `async let` initializer: hoist the value into a local first, as `token` / `pid` are.
- **Only two paths may sign anyone out:** `exchange()` on a `/refresh` 401, and `token_store_unreadable` at restore. Never on a request 401 or a 403.
- **No token twin.** Only `SessionStore.save` (called from `applyAuthResponse` and `exchange`) and `SessionStore.clear` write tokens. `persistSession()` never touches the keychain.
- **Upgrade safety.**
  - `HealthSyncUpgrade.runIfPending` runs before `GET /state` and before any normal batch. The engine returns early if it fails.
  - `migrateLegacyIfNeeded` never deletes anything without a member.
  - Accepted risk (health-sync F1): a member running the old and new builds at once can double count until `MIN_IOS_VERSION` is raised.
- **Anchor holds.** Each of these holds the anchor, and forgetting any one drops samples for good:
  - a client-side lock with in-window data;
  - a pending workout review;
  - a server `skipped_locked`;
  - an upload error;
  - a cancellation (background time ran out);
  - a workout read failure;
  - workouts with no resolvable program window.
- **Rate limits.**
  - A run is about 4 requests against the 60-per-10-min member limit.
  - Screen triggers are spaced 60 s apart.
  - Background wakes are unspaced; HealthKit caps sleep/steps at hourly, and workouts fire only on new data.
  - The follow-up run after a review is `manual`, so it skips the spacing on purpose.
- **CFNetwork may replay `PUT /auth/change-password` once** on a dropped reused connection. Rare and accepted; rule 6's manual-retry path covers it.
- **UI fit (standing gate).**
  - Every banner floats via `.floatingBanner`: inset 150 on the picker, 0 on Summary. No header buttons.
  - The new menu row reuses `SignOutRow`.
  - Check the offline, update and stale combinations on a 375 pt phone and on iPad (520 column).
  - Check that `laptopcomputer.and.iphone` renders. If it doesn't, use `rectangle.portrait.and.arrow.right`.
- **Parity items the orchestrator must mirror on C1 and C3:**
  - "Sign out everywhere" placement (account menu) and its copy.
  - Rule-6 copy.
  - "Invitation sent".
  - Provider failure shows kit `unknown` copy.
  - Credential screens show server text for 400/401/409/422.
  - Disconnect = local only, no review on reconnect.
  - Review commit = exclusions + PUT, then a `manual` run.
  - Sleep and steps notify on `created` only.
  - SSE backoff: 1 s base, 30 s cap, full jitter, 60 s idle.
  - `sync.run` trigger `launch` after sign-in.
  - Refetch on reconnect.
  - Push tap = acknowledge + re-fetch (D-IOS-PUSH-2) while Android's board says "open the target". **The orchestrator must decide parity.**
- **Backend changes needed: none.** Every route and shape used is live: auth 0.13.0, health-sync 0.1.0, notifications 0.4.0, invites 0.2.0, observability 0.2.2, app-config 0.2.0.

## Docs for the orchestrator

- **Brief:** two briefed files are renamed: `HealthKitAppliedLedger.swift` → `HealthSyncPrefs.swift`, and `ProgramContext+HealthKitWindows.swift` → `Services/HealthSyncPlanner.swift`. Acknowledge them.
- **`specs/features/auth/SPEC.md`**:
  - §9: add **D-C16 (iOS client)**.
    - One cached keychain pair item; a locked read at launch is re-read on unlock or foreground (D-IOS-AUTH-3).
    - Token read at send time; 60 s proactive refresh; single-flight; one retry within 5 s, then 30 s of back-off, reset on teardown.
    - `SessionTeardown` is the single teardown.
    - "Sign out everywhere" lives in the account menu (cross-track placement).
    - Password writes get only the 401 retry path.
    - Credential copy follows D-IOS-AUTH-2.
  - §11: row 0.13.1.
- **`specs/features/health-sync/SPEC.md`**:
  - §9: add **D-C13 (iOS)**.
    - Engine singleton; observers at launch; `beginBackgroundTask`.
    - Screen triggers spaced 60 s apart; background wakes never dropped.
    - Upgrade before `GET /state`.
    - Review commit = PUT + a `manual` run.
    - Disconnect is local only (D-IOS-SYNC-3).
    - Sign-out pauses.
    - No resolvable window → hold + failed.
    - Notifications count workouts as `applied`, sleep/steps as `created`.
  - §11: row 0.2.0. `registry.json` `consumed_by` += `ios`.
- **`specs/features/apple-health/SPEC.md`**:
  - §11: row 0.8.0.
  - Superseded:
    - D-SUM and the ledger (now rule-9 adoption);
    - D-S2's POST→409→PUT;
    - D-S1's 14-day window (now the rule-4 catch-up);
    - D-CONF storage (server `review_done_at`; exclusions per member);
    - **D-CONF's "a reconnect re-gates" (now rule 6).**
  - Rewrite §3/§3a/§3b/§6.
  - `reference_impl.paths`: remove the ledger and Windows files; add `Shared/Services/{HealthSyncEngine,HealthSyncPlanner,HealthSyncItems,HealthSyncUpgrade,HealthSyncPrefs,APIClient+HealthSync}.swift`.
- **`specs/features/notifications/SPEC.md`**:
  - §9: add **D-C17 (iOS)**: the APNs token is kept with no memo (D-IOS-PUSH-1); a tap acknowledges and re-fetches, with no routing (D-IOS-PUSH-2); permission denied → unregister.
  - **Amend §3.2 "Clients (next builds)"** so it records the iOS no-routing decision, or schedule routing for both mobile clients.
  - §11: row 0.4.1.
- **`specs/features/invites/SPEC.md`**: §11 row 0.2.1 (the iOS swallow is removed; "Invitation sent"); refresh the iOS file refs in §3.1.
- **`specs/features/observability/SPEC.md`**: §11 row 0.3.0. `consumed_by` += `ios` (`ClientEventQueue.swift`; `sync.run` props from `HealthSyncRunSummary`).
- **`specs/features/app-config/SPEC.md`**: in "iOS consumption", record that the soft nudge is built (`updateAvailableVersion`, `appconfig.dismissedLatestIOSVersion`, `LaunchScreenBanner`). Fix the stale `AppRootView` line refs. §11 row 0.2.1.
- **`specs/features/frontend-kit/SPEC.md`**:
  - §9: add **D-KIT-13 (iOS adoption)**: `LaunchScreenBanner` priority (D-IOS-KIT-1); no picker pull-to-refresh (D-IOS-KIT-2); refetch on reconnect (D-IOS-KIT-3); D-KIT-5 closed on iOS.
  - §10: the 15 s timeout, cache and offline banner are delivered on iOS.
  - §11: row 0.2.0. Status moves built → deployed once all tracks adopt.
- **`specs/features/REGISTRY.md` and `specs/pages/REGISTRY.md`**: update the version cells.
- **`RELEASES.md`**: on upload, add "iOS 1.5.0 (58) — TestFlight/App Store, reliability release", then the 1.5.1 (59) pre-bump. After adoption, set `MIN_IOS_VERSION` / `LATEST_IOS_VERSION` on Render.
- **`PROGRESS.md` and `specs/initiatives/reliability-overhaul/{BRIEF.md §7, HANDOFF.md}`**: mark C2 built, then shipped after the user's tests. File this plan at `plans/phase-3-c2-ios/plan.md`.

## Approval amendments

Apply [`../phase-3-client-amendments.md`](../phase-3-client-amendments.md) on top of this plan (user decisions, shared rules,
health-sync rules and this track's fixes). Where they disagree, the amendments win.
