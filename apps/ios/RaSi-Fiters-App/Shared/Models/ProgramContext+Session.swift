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
    /// Amendment A2: a forced sign-out is explained once, on the login screen (survives a scene-less teardown).
    private static let forcedNoticeKey = "auth.forcedSignOutNotice"

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
            DeviceRegistry.shared.unregister()
        case .everywhere:
            DeviceRegistry.shared.unregister()
        case .accountDeleted:
            break
        case .forced(let why, let status, let code):
            ClientEventQueue.shared.recordForcedSignOut(reason: why, status: status, code: code)
            DeviceRegistry.shared.unregister()
            UserDefaults.standard.set(true, forKey: forcedNoticeKey)
        }
        APIClient.shared.resetRefreshBackoff()
        HealthSyncEngine.shared.pause()                          // per-member sync prefs are kept (rule 7)
        LaunchCache.shared.clearAll()
        store.clear()
        NotificationCenter.default.post(name: didEnd, object: nil)
    }

    /// true once after a forced sign-out — the splash (signed-out root) shows kit `signedOut` in its subheadline slot,
    /// else the login screen in its alert slot (A2). Whichever shows it first consumes it.
    static func consumeForcedSignOutNotice() -> Bool {
        guard UserDefaults.standard.bool(forKey: forcedNoticeKey) else { return false }
        UserDefaults.standard.removeObject(forKey: forcedNoticeKey)
        return true
    }

    /// Any successful sign-in: a notice nobody showed yet is stale now.
    static func clearForcedSignOutNotice() {
        UserDefaults.standard.removeObject(forKey: forcedNoticeKey)
    }
}

/// Copy shared with web + Android (approval amendment A1 — identical strings on all three).
enum SessionCopy {
    static let signOutEverywhere = "Sign out everywhere"
    static let signOutEverywhereHint = "Signs you out on every device, including this one."
    static let signOutEverywhereTitle = "Sign out everywhere?"
    static let signOutEverywhereMessage = "You'll be signed out on all your devices, including this one."
    static let passwordUpdated = "Password updated. Your other devices will be signed out."
    static let passwordSet = "Password set. Your other devices will be signed out."
    /// auth §3.1 rule 6 — after a 503 / 5xx / timeout the change may already have landed.
    static let passwordUnconfirmed = "We couldn't confirm your password change. It may have gone through, so try signing in with your new password."
    static let samePassword = "New password must be different from your current password."

    /// Public sign-in routes + link / unlink / email (frontend-kit §4 scope rule, A8): the server's text for
    /// 400 / 401 / 409 / 422, the kit's copy for everything else (offline, timeout, busy, server).
    static func credentialMessage(for error: Error) -> String {
        if let http = error as? APIHTTPError, [400, 401, 409, 422].contains(http.statusCode),
           let text = AppError.serverText(http.message) { return text }
        return kitMessage(for: error)
    }

    /// Authenticated routes (incl. the password writes — A8: never a raw "Invalid token."): the kit's copy.
    static func kitMessage(for error: Error) -> String {
        AppError(error)?.message ?? KitCopy.message(for: .unknown)
    }

    /// Rule 6: a 5xx (incl. 503) / 408, a client-side timeout / dropped connection, or a refused body replay (the
    /// one-shot stream, APIClient+Session) → maybe landed.
    static func isUnconfirmedWrite(_ error: Error) -> Bool {
        if let http = error as? APIHTTPError { return http.statusCode >= 500 || http.statusCode == 408 }
        if let url = error as? URLError {
            return url.code == .timedOut || url.code == .networkConnectionLost || url.code == .requestBodyStreamExhausted
        }
        return false
    }
}

extension ProgramContext {

    /// Voluntary sign-out (AccountMenuSheet, Program tab) — this device only (auth D-C14).
    func signOut() { SessionTeardown.end(.user) }

    /// "Sign out everywhere" (My Profile, U3): every session ends, this one included → the full teardown.
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
        NetworkMonitor.shared.$isOnline.removeDuplicates().assign(to: &$isOnline)
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
        memberCardsOwner = nil                  // the Members-card owner token + the render-time identity tags
        memberHistoryMemberId = nil
        memberStreaksMemberId = nil
        memberRecentMemberId = nil
        stopNotificationStream()
        resetInboxState()                       // counts, toast, prefs cache, routes, Inbox sheet, notice; app badge → 0
        pendingSyncConfirmation = nil
        deferredSleepConfirmation = nil
        deferredStepsConfirmation = nil
        reloadHealthSyncMirror()
    }

    /// Launch / foreground / sign-in: stream, the catch-up (data reload decoupled from the token — rule 2 — plus the
    /// inbox counts + app-icon badge and invites, ≤ once per 5 s), event flush, and a health-sync run (rule 1).
    /// Observers re-register only when the member / active kinds changed.
    func sessionDidBecomeActive(_ trigger: HealthSyncEngine.Trigger) {
        startNotificationStreamIfNeeded()
        catchUp()
        Task { await refreshNotificationPreferences() }           // C7.5: the toast's category gate
        if trigger == .launch { Task { await preparePushOnSessionStart() } }   // D-N12: first signed-in start
        Task { await ClientEventQueue.shared.flush() }
        HealthSyncEngine.shared.registerObservers()
        HealthSyncEngine.shared.trigger(trigger)
    }

    func reloadSessionData() async {
        await loadLookupData()
        if programId != nil { await loadMembershipDetails() }
    }
}
