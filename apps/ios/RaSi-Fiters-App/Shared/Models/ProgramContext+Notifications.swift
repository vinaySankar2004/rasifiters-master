import Foundation

extension ProgramContext {
    // MARK: - Notifications

    @MainActor
    func startNotificationStreamIfNeeded() {
        guard let token = authToken, !token.isEmpty else { return }
        if notificationStreamClient != nil {
            notificationStreamClient?.disconnect()
            notificationStreamClient = nil
        }

        let streamClient = NotificationStreamClient()
        streamClient.onNotification = { [weak self] notification in
            Task { @MainActor in
                self?.enqueueNotification(notification)
            }
        }
        streamClient.onError = { _ in }
        streamClient.connect(token: token)
        notificationStreamClient = streamClient

        Task {
            await loadUnacknowledgedNotifications()
        }
    }

    @MainActor
    func stopNotificationStream() {
        notificationStreamClient?.disconnect()
        notificationStreamClient = nil
        notificationQueue = []
        notificationIds = []
    }

    @MainActor
    func loadUnacknowledgedNotifications() async {
        guard let token = authToken, !token.isEmpty else { return }
        do {
            let items = try await APIClient.shared.fetchUnacknowledgedNotifications(token: token)
            notificationIds = Set(items.map { $0.id })
            notificationQueue = sortNotifications(items)
        } catch {
            // Ignore; retry on next refresh or stream event
        }
    }

    @MainActor
    func acknowledgeNotification(_ notification: APIClient.NotificationDTO) async {
        guard let token = authToken, !token.isEmpty else { return }
        notificationQueue.removeAll { $0.id == notification.id }
        notificationIds.remove(notification.id)
        do {
            _ = try await APIClient.shared.acknowledgeNotification(token: token, notificationId: notification.id)
        } catch {
            await loadUnacknowledgedNotifications()
        }
    }

    /// Call when the user opened the app by tapping a push (so we acknowledge that notification and do not show the in-app modal).
    @MainActor
    func acknowledgeNotificationById(_ notificationId: String) {
        guard let token = authToken, !token.isEmpty, !notificationId.isEmpty else { return }
        notificationQueue.removeAll { $0.id == notificationId }
        notificationIds.remove(notificationId)
        Task {
            _ = try? await APIClient.shared.acknowledgeNotification(token: token, notificationId: notificationId)
        }
    }

    /// Call when the user has disabled notifications in system settings; removes this device from the backend so we stop sending push.
    @MainActor
    func deregisterPushTokenIfDenied(deviceToken: String?) async {
        guard let token = authToken, !token.isEmpty else { return }
        _ = try? await APIClient.shared.deregisterDevice(token: token, pushToken: deviceToken)
    }

    @MainActor
    private func enqueueNotification(_ notification: APIClient.NotificationDTO) {
        guard !notificationIds.contains(notification.id) else { return }
        notificationIds.insert(notification.id)
        notificationQueue.append(notification)
        notificationQueue = sortNotifications(notificationQueue)
        Task { @MainActor in
            await refreshDataForNotification(notification)
        }
    }

    @MainActor
    private func refreshDataForNotification(_ notification: APIClient.NotificationDTO) async {
        let type = notification.type

        if type == "program.invite_received" {
            await loadPendingInvites()
            await loadLookupData()
            return
        }

        if [
            "program.role_changed",
            "program.member_removed",
            "program.member_left",
            "program.member_joined",
            "program.admin_transferred",
            "program.updated",
            "program.deleted"
        ].contains(type) {
            await loadLookupData()
            if programId != nil {
                await loadMembershipDetails()
            }
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
