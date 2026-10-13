import Foundation

extension ProgramContext {
    // MARK: - Real-time stream (notifications §3.3 + contract C7): foreground only, opened with `?inbox=1` so every type
    // arrives as a C3 inbox item. Every close reconnects with a fresh token — exponential backoff + full jitter (1 s base,
    // ×2, 30 s cap), paused while offline (A4). Every `ready` resets the backoff and runs the catch-up (C7.3 retires
    // A4's /unacknowledged re-fetch and the blocking modal queue, D-N3).

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
                self?.catchUp()
            }
            client.onNotification = { [weak self] item in self?.receiveInboxItem(item) }
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

    /// Backgrounded / offline: close the stream (it resumes on foreground / reconnect).
    @MainActor
    func suspendNotificationStream() {
        streamReconnectTask?.cancel()
        streamReconnectTask = nil
        notificationStreamClient?.disconnect()
        notificationStreamClient = nil
        streamAttempt = 0
    }

    /// Sign-out teardown: close it (the inbox state is reset by `resetInboxState`).
    @MainActor
    func stopNotificationStream() {
        suspendNotificationStream()
    }

    /// C7.5: a live item → fresh counts, a visible InboxView reloads (and reads it), a toast when its category is on,
    /// and an invite / membership item refreshes what it is about.
    @MainActor
    private func receiveInboxItem(_ item: APIClient.NotificationDTO) {
        inboxRevision += 1
        Task { await refreshInboxCounts() }
        if isCategoryEnabled(item.resolvedCategory) { showToast(item) }
        Task { await refreshData(forType: item.type) }
    }

    /// C7.6 (the routing rule): a tapped push is marked read, then opens its target (`openTarget`).
    @MainActor
    func handlePushTap(notificationId: String, type: String?, target: String?, programId: String?) {
        guard authToken != nil else { return }
        Task { await markInboxRead(ids: [notificationId]) }
        openTarget(InboxTarget(target: target, type: type, programId: programId))
        Task { await refreshData(forType: type ?? "") }
    }

    /// A remote push shown while the app is in front (AppDelegate.willPresent): counts, a visible inbox, and invites.
    /// Skipped while the stream is connected — it delivers the same item (receiveInboxItem).
    @MainActor
    func foregroundPushReceived(type: String?) {
        guard !NotificationStreamClient.isConnected else { return }
        inboxRevision += 1
        Task { await refreshInboxCounts() }
        Task { await refreshData(forType: type ?? "") }
    }

    @MainActor
    private func refreshData(forType type: String) async {
        if type == "program.invite_received" {          // invites §3.1: the invitations are always GET /my-invites
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
}
