import SwiftUI

/// The notification inbox (D-N3 · D-N4 · D-N5 · D-N14; specs/pages/ios/inbox/SPEC.md): pending invitations first with
/// their actions (A10), then notifications newest first, paged by `next_cursor`. The reading rule: a visit whose first
/// page loaded marks everything read (POST /inbox/read {all:true}); an item that arrives while it is on screen is marked
/// read on arrival ({ids}) and merged into the loaded pages; an item unread when the visit began keeps its dot for the
/// whole visit (paged-in rows too). Hosts: the "+" sheet's Inbox tab, both
/// account-menu Inbox rows and the root Inbox sheet (NotificationToast.swift).
struct InboxView: View {
    @EnvironmentObject private var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss
    /// false while the "+" sheet shows Create — nothing loads or is marked read until the Inbox is on screen.
    var isActive = true
    /// true ONLY in the "+" sheet's paged TabView, which the sheet's offline inset doesn't reach (D-KIT-17): the page
    /// clears the 116-pt offline band itself. Every other host gets the band from a safe-area inset.
    var reservesOfflineBand = false
    /// After an accepted invite: the host closes (the sheet dismisses / the account-menu push pops); nil = stay.
    var onAcceptedInvite: (() -> Void)? = nil

    @StateObject private var feed = InboxFeed()
    /// On screen right now — a pushed inbox stays alive under another tab and must not mark live items read.
    @State private var isVisible = false
    /// Counted in ProgramContext.visibleInboxCount (no toast / no second Inbox while one is on screen).
    @State private var isCounted = false
    /// This visit's first page loaded (and the mark-all ran); later loads mark only what arrived ({ids}).
    @State private var visitLoaded = false
    /// When this visit began — an item read since then still shows its unread dot.
    @State private var visitStart: Date?
    @State private var invitesError: AppError?
    @State private var isResponding = false
    @State private var respondError: String?
    @State private var inviteToDecline: APIClient.PendingInviteDTO?
    @State private var blockFutureInvites = false

    private var onScreen: Bool { isActive && isVisible }

    var body: some View {
        ZStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(InboxCopy.title)
                            .font(.title2.weight(.bold))
                            .foregroundColor(Color(.label))
                        Text(InboxCopy.subtitle)
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)

                    InboxInvitesSection(
                        invites: programContext.pendingInvites,
                        isGlobalAdmin: programContext.isGlobalAdmin,
                        loadError: feed.state.isFailed ? nil : invitesError,     // one error view per screen
                        isBusy: isResponding,
                        onRetry: { Task { await reload() } },
                        onAccept: { invite in Task { await respond(invite, action: "accept") } },
                        onDecline: { invite in inviteToDecline = invite },
                        onRevoke: { invite in Task { await respond(invite, action: "revoke") } }
                    )

                    notificationsSection

                    // A6 / D-KIT-17: neither the offline banner nor the stale banner ever covers the last row.
                    Spacer(minLength: reservesOfflineBand && !programContext.isOnline ? 116 : (isBannerShowing ? 104 : 40))
                }
                .frame(maxWidth: AdaptiveLayout.contentMaxWidth)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await reload() }

            if let invite = inviteToDecline {
                DeclineInviteDialog(
                    programName: invite.program_name ?? "this program",
                    blockFutureInvites: $blockFutureInvites,
                    onDecline: { Task { await respond(invite, action: "decline", blockFuture: blockFutureInvites) } },
                    onCancel: {
                        inviteToDecline = nil
                        blockFutureInvites = false
                    }
                )
                .transition(.opacity)
            }
        }
        .onAppear {
            isVisible = true
            updateOnScreen()
        }
        .onDisappear {
            isVisible = false
            updateOnScreen()
        }
        .onChange(of: isActive) { _, _ in updateOnScreen() }
        .task(id: isActive) {                                        // also on every re-appearance (tab switch / pop)
            if isActive { await reload() }
        }
        .onChange(of: programContext.inboxRevision) { _, _ in
            // Only an inbox on screen takes a live item (and marks it read); a hidden one reloads when it reappears.
            if onScreen { Task { await reload(merging: true) } }
        }
        .onChange(of: programContext.isOnline) { _, online in
            // D-KIT-13: back online after a failed load → reload by itself.
            if online, onScreen, feed.state.error != nil || invitesError != nil { Task { await reload() } }
        }
        .alert(InboxCopy.respondFailedTitle, isPresented: Binding(
            get: { respondError != nil },
            set: { if !$0 { respondError = nil } }
        )) {
            Button("OK") { respondError = nil }
        } message: {
            Text(respondError ?? "")
        }
        // Hidden while offline (ScreenBanner) — the host's offline banner wins (A6).
        .floatingBanner { ScreenBanner(banner: staleBanner) }
    }

    private var notificationsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(InboxCopy.notificationsHeader)
                .font(.headline.weight(.semibold))
                .foregroundColor(Color(.label))
            switch feed.state {
            case .idle, .loading:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.top, 24)
            case .failed(let error):
                ErrorStateView(error: error, onRetry: { Task { await reload() } })
            case .loaded(let items, _, _), .stale(let items, _, _):
                if items.isEmpty {
                    InboxEmptyState()
                } else {
                    LazyVStack(spacing: 10) {
                        ForEach(items) { item in
                            InboxRow(item: item, showsUnread: item.wasUnread(atVisitStart: visitStart),
                                     onOpen: item.opensElsewhere ? { open(item) } : nil)
                                .onAppear {
                                    if item.id == items.last?.id { Task { await feed.loadMore() } }
                                }
                        }
                        if feed.isLoadingMore {
                            ProgressView().padding(.vertical, 8)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 20)
    }

    /// Kept data whose refresh failed (the list or the invitations) → "Couldn't refresh" + Retry (frontend-kit §6).
    private var staleBanner: FloatingBanner? {
        var listStale = false
        if case .stale = feed.state { listStale = true }
        let invitesStale = invitesError != nil && !programContext.pendingInvites.isEmpty
        guard listStale || invitesStale else { return nil }
        return FloatingBanner(variant: .stale, onRetry: { Task { await reload() } })
    }

    private var isBannerShowing: Bool { programContext.isOnline && staleBanner != nil }

    /// A visit starts when the inbox comes on screen and ends when it leaves it.
    private func updateOnScreen() {
        if onScreen, !isCounted {
            isCounted = true
            visitStart = Date()
            programContext.visibleInboxCount += 1
            programContext.dismissToast()                            // never a toast over the inbox itself
        } else if !onScreen, isCounted {
            isCounted = false
            programContext.visibleInboxCount -= 1
            visitLoaded = false
            visitStart = nil
        }
    }

    /// Invitations + the first page in parallel (`merging`: a live reload — page 1 merged into the loaded pages); then —
    /// only when this load really landed while on screen — the read mark: everything on the visit's first page, else
    /// just the items that arrived meanwhile.
    private func reload(merging: Bool = false) async {
        async let invites: Void = refreshInvites()
        let listLoaded: Bool
        if merging {
            listLoaded = await feed.refreshHead(online: programContext.isOnline)
        } else {
            listLoaded = await feed.reload(online: programContext.isOnline)
        }
        await invites
        guard listLoaded, !Task.isCancelled, onScreen else { return }
        let unreadIds = (feed.state.value ?? []).filter(\.isUnread).map(\.id)
        if !visitLoaded {
            visitLoaded = true
            if !unreadIds.isEmpty || (programContext.inboxCounts?.unread ?? 0) > 0 { await programContext.markAllInboxRead() }
        } else if !unreadIds.isEmpty {
            await programContext.markInboxRead(ids: unreadIds)
        }
    }

    private func refreshInvites() async {
        do {
            try await programContext.loadPendingInvites()
            invitesError = nil
        } catch {
            if let appError = AppError(error) { invitesError = appError.labeled(online: programContext.isOnline) }
        }
    }

    /// A row whose target is elsewhere: mark read + route (ProgramPickerView), then close this host.
    private func open(_ item: APIClient.NotificationDTO) {
        programContext.openInboxItem(item, fromInbox: true)
        dismiss()
    }

    private func respond(_ invite: APIClient.PendingInviteDTO, action: String, blockFuture: Bool = false) async {
        isResponding = true
        defer {
            isResponding = false
            inviteToDecline = nil
            blockFutureInvites = false
        }
        // C7.7: that program's invite notifications are read once the answer lands (usually already — a visit marks all).
        let inviteItemIds = action == "revoke" ? [] : feed.inviteItemIds(programId: invite.program_id)
        do {
            _ = try await programContext.respondToInvite(inviteId: invite.invite_id, action: action, blockFuture: blockFuture)
            if action == "accept" { onAcceptedInvite?() }                // close first — the read mark never delays it
            let context = programContext
            Task { await context.markInboxRead(ids: inviteItemIds) }    // no ids → just fresh counts (pending changed)
        } catch {
            respondError = SessionCopy.kitMessage(for: error)            // kit copy (a 400 keeps the server's text)
        }
    }
}

private extension LoadState {
    var isFailed: Bool {
        if case .failed = self { return true }
        return false
    }
}
