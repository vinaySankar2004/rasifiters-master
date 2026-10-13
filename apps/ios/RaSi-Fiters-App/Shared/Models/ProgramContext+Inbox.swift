import Foundation
import UIKit
import UserNotifications

/// Where a notification opens (notifications contract C2 targets). An unknown / missing target opens the inbox — except
/// a legacy invite push (no `target`), which keeps opening the invitations (U2).
enum InboxTarget: Equatable {
    case invites
    case program(String)
    case programs
    case logWorkout
    case inbox

    init(target: String?, type: String?, programId: String?) {
        switch target {
        case "invites": self = .invites
        case "program": self = programId.map { .program($0) } ?? .programs
        case "programs": self = .programs
        case "log_workout": self = .logWorkout
        case "inbox": self = .inbox
        default: self = type == "program.invite_received" ? .invites : .inbox
        }
    }

    /// Shown by the Inbox itself (the root Inbox sheet / the "+" sheet's Inbox tab).
    var isInbox: Bool { self == .inbox || self == .invites }
}

extension APIClient.NotificationDTO {
    /// C2: an item without a category (a legacy frame) counts as `program`.
    var resolvedCategory: String { category ?? "program" }
    var resolvedTarget: InboxTarget { InboxTarget(target: target, type: type, programId: programId) }
    var isUnread: Bool { readAt == nil }
    /// Opens somewhere other than the inbox itself (a program, the programs list, the workout log).
    var opensElsewhere: Bool { !resolvedTarget.isInbox }
    /// `created_at` / `read_at` — ISO-8601 with or without fractional seconds.
    var createdDate: Date? { createdAt.flatMap { Self.isoDate($0) } }
    var readDate: Date? { readAt.flatMap { Self.isoDate($0) } }

    /// The reading rule's dots: unread when this visit began — unread now, or read since `visitStart` (2 min of
    /// allowance for a device clock ahead of the server's).
    func wasUnread(atVisitStart visitStart: Date?) -> Bool {
        if isUnread { return true }
        guard let visitStart, let readDate else { return false }
        return readDate >= visitStart.addingTimeInterval(-120)
    }

    private static func isoDate(_ text: String) -> Date? {
        fractionalISO.date(from: text) ?? plainISO.date(from: text)
    }
    private static let fractionalISO: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private static let plainISO = ISO8601DateFormatter()
}

/// The inbox state behind the "+" badge, the app-icon badge, the toast, the catch-up and push / toast routing
/// (D-N3 · D-N4 · D-N5 · D-N12 · D-N14; notifications contract C7; the badge, catch-up, toast and routing rules).
extension ProgramContext {
    /// C2 defaults for the settings screen until GET /preferences answers (reminders + digest are opt-in).
    static let defaultNotificationCategories: [String: Bool] = [
        "program": true, "activity": true, "reminders": false, "digest": false, "announcements": true
    ]
    private static let permissionAskedKey = "push.permissionAsked"

    /// The "+" badge (D-N4, the badge rule): the server's `badge`; until it first answers, the member's own pending
    /// invites (0 for global admins — their invite list holds every invitation).
    var inboxBadgeCount: Int { inboxCounts?.badge ?? (isGlobalAdmin ? 0 : pendingInvites.count) }

    /// The badge as shown — capped at "99+".
    var inboxBadgeLabel: String { inboxBadgeCount > 99 ? "99+" : "\(inboxBadgeCount)" }

    /// The toast's category gate: missing preferences or an unknown key → show.
    func isCategoryEnabled(_ category: String) -> Bool {
        notificationPreferences?.categories[category] ?? true
    }

    // MARK: Counts + read

    /// GET /inbox/unread-count → the "+" badge + the app-icon badge (C7.8). Silent on failure (badges keep their value).
    func refreshInboxCounts() async {
        guard authToken != nil, let counts = try? await APIClient.shared.fetchInboxCounts() else { return }
        applyInboxCounts(counts)
    }

    /// POST /inbox/read { ids } (idempotent) → fresh counts; no ids → just refresh the counts.
    func markInboxRead(ids: [String]) async {
        guard authToken != nil else { return }
        guard !ids.isEmpty else { return await refreshInboxCounts() }
        guard let counts = try? await APIClient.shared.markInboxRead(ids: ids) else { return }
        applyInboxCounts(counts)
    }

    /// A visit whose first page loaded reads everything (D-N5) — the app-icon badge drops to the pending invites (D-N14).
    func markAllInboxRead() async {
        guard authToken != nil, let counts = try? await APIClient.shared.markAllInboxRead() else { return }
        applyInboxCounts(counts)
    }

    private func applyInboxCounts(_ counts: APIClient.InboxCountsDTO) {
        guard authToken != nil else { return }                          // an answer landing after sign-out
        inboxCounts = counts
        setAppBadge(counts.badge)
    }

    /// The app-icon badge (D-N14, per device): this build registers `inbox: true`, so the server's pushes carry
    /// aps.badge too. The only writer of the icon badge.
    func setAppBadge(_ count: Int) {
        Task { try? await UNUserNotificationCenter.current().setBadgeCount(max(count, 0)) }
    }

    /// The catch-up rule: on every stream `ready` and every foreground start, at most once per 5 s — the counts, a
    /// visible inbox, the invites, and the programs (+ the open program's role-dependent membership data; a program
    /// that is gone closes — loadLookupData).
    func catchUp() {
        guard authToken != nil else { return }
        if let last = lastCatchUpAt, Date().timeIntervalSince(last) < 5 { return }
        lastCatchUpAt = Date()
        inboxRevision += 1
        Task { await refreshInboxCounts() }
        Task { _ = try? await loadPendingInvites() }
        Task { await reloadSessionData() }
    }

    // MARK: Preferences cache (C7.5)

    func loadNotificationPreferences() async throws -> APIClient.NotificationPreferencesDTO {
        let preferences = try await APIClient.shared.fetchNotificationPreferences()
        if authToken != nil { notificationPreferences = preferences }
        return preferences
    }

    func refreshNotificationPreferences() async {
        _ = try? await loadNotificationPreferences()
    }

    // MARK: Toast (D-N3, the toast rule) + routing (C2 / C7.6, the routing rule)

    /// The newest live item replaces the previous toast. Never while an Inbox is on screen or a sheet / cover / alert
    /// is up (the root overlay would sit under it).
    func showToast(_ item: APIClient.NotificationDTO) {
        guard visibleInboxCount == 0, !Self.isPresentingModal else { return }
        toastItem = item
        toastDismissTask?.cancel()
        toastDismissTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            guard !Task.isCancelled else { return }
            self?.toastItem = nil
        }
    }

    func dismissToast() {
        toastDismissTask?.cancel()
        toastDismissTask = nil
        toastItem = nil
    }

    /// The toast's "View" / an inbox row: mark it read, then open its target. From inside the inbox only targets
    /// elsewhere route (InboxView.open closes its host); `inbox` / `invites` are already on screen.
    func openInboxItem(_ item: APIClient.NotificationDTO, fromInbox: Bool) {
        if item.isUnread { Task { await markInboxRead(ids: [item.id]) } }
        if fromInbox {
            if item.opensElsewhere { inboxRoute = item.resolvedTarget }
            return
        }
        dismissToast()
        openTarget(item.resolvedTarget)
    }

    /// `inbox` / `invites` → the root Inbox sheet over whatever is on screen (an open program stays open); an Inbox
    /// already on screen (the sheet or a pushed one) just reloads. When something else is presented — and for every
    /// other target — the program picker routes it (`inboxRoute`, ProgramPickerView.openInboxRoute).
    func openTarget(_ target: InboxTarget) {
        if target.isInbox {
            if showInboxSheet || visibleInboxCount > 0 {
                inboxRevision += 1
                return
            }
            if !Self.isPresentingModal {
                showInboxSheet = true
                return
            }
        }
        inboxRoute = target
    }

    /// A sheet, cover or alert is already up over the root — a root presentation would silently not show.
    static var isPresentingModal: Bool {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .rootViewController?
            .presentedViewController != nil
    }

    // MARK: Permission (D-N12) — once per install, at the first signed-in start

    /// Once per install, at the first signed-in start (sign-in or a restored session) while undecided. An authorized
    /// device re-requests its APNs token, so PUT /device carries `inbox: true` right after a sign-in (C7.4). Then, on a
    /// phone syncing Apple Health workouts, the one-time visibility notice — only after the system prompt was
    /// answered and the launch health sync settled (its review goes first).
    func preparePushOnSessionStart() async {
        let center = UNUserNotificationCenter.current()
        let status = await center.notificationSettings().authorizationStatus
        switch status {
        case .notDetermined:
            if !UserDefaults.standard.bool(forKey: Self.permissionAskedKey) {
                UserDefaults.standard.set(true, forKey: Self.permissionAskedKey)
                if (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) == true {
                    DeviceRegistry.shared.notificationPermission(granted: true)
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        case .authorized, .provisional, .ephemeral:
            UIApplication.shared.registerForRemoteNotifications()
        default:
            break
        }
        guard authToken != nil, isHealthKitEnabled else { return }
        _ = await HealthSyncEngine.shared.run(.launch)
        await offerActivityVisibilityNotice()
    }

    /// The sign-out teardown's inbox half (ProgramContext+Session.clearInMemorySession).
    func resetInboxState() {
        dismissToast()
        inboxCounts = nil
        notificationPreferences = nil
        inboxRoute = nil
        showInboxSheet = false
        inboxRevision = 0
        lastCatchUpAt = nil
        showActivityVisibilityNotice = false
        activityNoticeDeferred = false
        widgetRouteFromNotification = false
        setAppBadge(0)
    }
}
