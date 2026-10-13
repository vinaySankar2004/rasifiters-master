import Foundation

extension ProgramContext {
    // MARK: - Real-time stream (notifications §3.3, amendment A4): foreground only; every close reconnects with a fresh
    // token, exponential backoff + full jitter (1 s base, ×2, 30 s cap), paused while offline; every `ready` resets the
    // backoff and re-fetches /unacknowledged.

    private static let acknowledgedMemory: TimeInterval = 5 * 60

    @MainActor
    func startNotificationStreamIfNeeded() {
        guard authToken != nil, isOnline, notificationStreamClient == nil, streamReconnectTask == nil else { return }
        streamReconnectTask = Task { @MainActor [weak self] in
            let token = await APIClient.shared.validAccessToken()      // refreshed when it expires within 60 s
            guard let self, !Task.isCancelled else { return }          // backgrounded meanwhile (C2#9)
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
        guard authToken != nil, isOnline else { return }               // offline: resumes when the link is back (A4)
        streamAttempt += 1
        let delay = Double.random(in: 0...min(30, pow(2, Double(streamAttempt - 1))))
        streamReconnectTask = Task { @MainActor [weak self] in
            if status == 401 { _ = try? await APIClient.shared.refreshAccessToken() }   // a session_invalid → teardown
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard let self, !Task.isCancelled else { return }
            self.streamReconnectTask = nil
            self.startNotificationStreamIfNeeded()
        }
    }

    /// Backgrounded / offline: close the stream, keep the modal queue (resumes on foreground / reconnect).
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

    /// Idempotent re-fetch after every `ready` (A4): items acknowledged elsewhere leave the queue, items this device
    /// acknowledged moments ago never come back, new items merge by id, and new invite / membership items refresh
    /// what they are about.
    @MainActor
    func loadUnacknowledgedNotifications() async {
        guard let token = authToken else { return }
        let before = notificationIds
        guard let items = try? await APIClient.shared.fetchUnacknowledgedNotifications(token: token) else { return }
        let cutoff = Date().addingTimeInterval(-Self.acknowledgedMemory)
        acknowledgedNotificationIds = acknowledgedNotificationIds.filter { $0.value > cutoff }
        let serverIds = Set(items.map(\.id))
        let goneElsewhere = before.subtracting(serverIds)
        notificationQueue.removeAll { goneElsewhere.contains($0.id) }
        notificationIds.subtract(goneElsewhere)
        var newTypes = Set<String>()
        for item in items where !notificationIds.contains(item.id) && acknowledgedNotificationIds[item.id] == nil {
            notificationIds.insert(item.id)
            notificationQueue.append(item)
            newTypes.insert(item.type)
        }
        notificationQueue = sortNotifications(notificationQueue)
        for type in newTypes { await refreshData(forType: type) }
    }

    @MainActor
    func acknowledgeNotification(_ notification: APIClient.NotificationDTO) async {
        guard let token = authToken else { return }
        rememberAcknowledged(notification.id)
        do {
            _ = try await APIClient.shared.acknowledgeNotification(token: token, notificationId: notification.id)
        } catch {
            acknowledgedNotificationIds[notification.id] = nil
            await loadUnacknowledgedNotifications()
        }
    }

    @MainActor
    func acknowledgeNotificationById(_ notificationId: String) {
        guard let token = authToken, !notificationId.isEmpty else { return }
        rememberAcknowledged(notificationId)
        Task { _ = try? await APIClient.shared.acknowledgeNotification(token: token, notificationId: notificationId) }
    }

    /// notifications §3.2 clients (amendment U2): a tapped push is acknowledged; an invite opens the invite inbox
    /// (ProgramPickerView consumes `openInvitesRequested`), any other type re-fetches what it is about.
    @MainActor
    func handlePushTap(notificationId: String, type: String?) {
        guard authToken != nil else { return }
        acknowledgeNotificationById(notificationId)
        if type == "program.invite_received" { openInvitesRequested = true }
        Task { await refreshData(forType: type ?? "") }
    }

    @MainActor
    private func rememberAcknowledged(_ id: String) {
        acknowledgedNotificationIds[id] = Date()
        notificationQueue.removeAll { $0.id == id }
        notificationIds.remove(id)
    }

    @MainActor
    private func enqueueNotification(_ notification: APIClient.NotificationDTO) {
        guard !notificationIds.contains(notification.id), acknowledgedNotificationIds[notification.id] == nil else { return }
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
