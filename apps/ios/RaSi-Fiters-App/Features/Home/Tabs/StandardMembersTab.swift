import SwiftUI

// MARK: - Standard Members Tab (for non-admin users)
// Ported faithfully from legacy Features/Home/Tabs/StandardMembersTab.swift.
// D-P2: the header button opens People (was the roster list). polish #32 (people S5): the cards run on the kit's Summary
// recipe — placeholders while loading, "—" per failed card, ErrorStateView + Retry when nothing loaded, "Couldn't
// refresh · Retry" over kept data, pull-to-refresh, reload on reconnect; never another program's or member's numbers
// (#10, the card-owner rule). polish #5 kept: every read in parallel; the self metric row IS the overview row (no
// all-member download, member-analytics D-C10); a logger's Recent + Health follow the View-as member (QA2).

struct StandardMembersTab: View {
    @EnvironmentObject var programContext: ProgramContext
    /// The program whose cards are on screen (frontend-kit §5).
    @State private var loadState: LoadState<String> = .idle
    @State private var cards = MemberCardsState()
    /// Bumped by pull-to-refresh / Retry — the self-loading health card reloads too.
    @State private var refreshCount = 0
    @State private var loggedInUserMetrics: APIClient.MemberMetricsDTO?
    @State private var loggerViewAsMember: APIClient.MemberDTO?
    @State private var showLoggerMemberPicker = false
    /// The tab's own screen is on screen (not covered by People / a profile / "Open full stats" / a detail).
    @State private var isVisible = false

    private var isLogger: Bool {
        programContext.loggedInUserProgramRole == "logger"
    }

    private var loggedInMember: APIClient.MemberDTO? {
        guard let userId = programContext.loggedInUserId else { return nil }
        return programContext.members.first { $0.id == userId }
    }

    /// Recent + Health: the logger's View-as member; everyone else sees themself.
    private var logsMember: APIClient.MemberDTO? {
        isLogger ? (loggerViewAsMember ?? loggedInMember) : loggedInMember
    }

    private var loggerViewAsLabel: String {
        loggerViewAsMember?.member_name ?? programContext.loggedInUserName ?? "Member"
    }

    /// The member Recent shows: a logger's View-as member, else the signed-in member.
    private var recentMemberId: String? {
        (isLogger ? loggerViewAsMember?.id : nil) ?? programContext.loggedInUserId
    }

    /// The shared card state is ours or unowned — a background reload may write it (the card-owner rule).
    private var cardsFree: Bool {
        let owner = programContext.memberCardsOwner
        return owner == nil || owner == MemberCardsOwner.membersTab
    }

    var body: some View {
        NavigationStack {
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 16) {
                    HStack(alignment: .center) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Members")
                                .font(.largeTitle.weight(.bold))
                                .foregroundColor(Color(.label))
                            Text(programContext.name)
                                .font(.headline.weight(.semibold))
                                .foregroundColor(Color(.secondaryLabel))
                        }
                        Spacer()
                        // People — the standard / logger entry (D-P2; replaces the roster list)
                        NavigationLink {
                            PeopleListView()
                        } label: {
                            GlassButton(icon: "person.2")
                        }
                        .accessibilityLabel(PeopleCopy.title)
                    }
                    .padding(.top, 24)

                    if case .failed(let error) = loadState {
                        ErrorStateView(error: error, onRetry: retry)
                    } else {
                        MemberOverviewCard(member: loggedInMember, state: cards.overview)
                        // The self metric row — needs a concrete row, so it keeps its own gate.
                        if let metrics = loggedInUserMetrics {
                            MemberMetricsCard(metric: metrics, hero: .active_days)
                        }
                        // History and Streak: always the signed-in member (standard and logger).
                        MemberHistoryCard(selectedMember: loggedInMember, state: cards.history)
                        MemberStreakCard(selectedMember: loggedInMember, state: cards.streaks)
                        if isLogger {
                            loggerViewAsSelector                          // right above the two log cards only
                        }
                        MemberRecentCard(selectedMember: logsMember, state: cards.recent)
                        MemberHealthCard(selectedMember: logsMember, refreshToken: refreshCount)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, isBannerShowing ? 88 : 24)              // A6: the stale banner never covers the last card
                .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
                .frame(maxWidth: .infinity)
            }
            .refreshable {
                refreshCount += 1
                await loadUserData()
            }
            .adaptiveBackground(topLeading: true)
            .navigationBarBackButtonHidden(true)
            .floatingBanner { ScreenBanner(banner: staleBanner) }
            // Whenever THIS screen comes on screen (first open, tab re-entry, back from People / "Open full stats" / a
            // detail) — never while another screen of this stack is on top and owns the shared cards.
            .task { await loadUserData() }
            .onAppear { isVisible = true }
            .onDisappear { isVisible = false }
        }
        .onChange(of: programContext.programId) { _, _ in
            Task { await loadUserData() }
        }
        .onChange(of: programContext.loggedInUserId) { _, _ in
            Task { await loadUserData() }
        }
        .onChange(of: programContext.members.count) { _, _ in
            if isLogger {
                applyDefaultLoggerSelectionIfNeeded()
            }
        }
        .onChange(of: programContext.isOnline) { _, online in
            // D-KIT-13: refetch on reconnect — not while another screen owns the shared cards.
            if online, loadState.error != nil, cardsFree { Task { await loadUserData() } }
        }
        .onChange(of: programContext.memberCardsIdentity) { _, _ in
            // A late write that isn't ours (the cards already show placeholders — render-time identity): reload.
            guard isVisible, loadState.value != nil, cardsFree, let userId = programContext.loggedInUserId,
                  programContext.memberCardsMismatch(cards, memberId: userId, recentMemberId: recentMemberId) else { return }
            Task { await loadUserData() }
        }
    }

    private var loggerViewAsSelector: some View {
        Button {
            showLoggerMemberPicker = true
        } label: {
            HStack {
                Text("View as")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Spacer()
                Text(loggerViewAsLabel)
                    .font(.subheadline)
                    .foregroundColor(Color(.secondaryLabel))
                Image(systemName: "chevron.up.chevron.down")
                    .font(.footnote.weight(.bold))
                    .foregroundColor(Color(.tertiaryLabel))
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showLoggerMemberPicker) {
            MemberPickerView(
                members: programContext.members,
                selected: loggerViewAsMember,
                showNoneOption: false,
                onSelect: { member in
                    showLoggerMemberPicker = false
                    guard let m = member else {
                        loggerViewAsMember = loggedInMember
                        if let me = loggedInMember { Task { await loadLoggerLogsData(memberId: me.id) } }
                        return
                    }
                    loggerViewAsMember = m
                    Task {
                        await loadLoggerLogsData(memberId: m.id)
                    }
                }
            )
        }
    }

    private var staleBanner: FloatingBanner? {
        guard case .stale = loadState else { return nil }
        return FloatingBanner(variant: .stale, onRetry: retry)
    }

    private var isBannerShowing: Bool { programContext.isOnline && staleBanner != nil }

    /// Retry (error view / banner): the tab's cards + the self-loading health card.
    private func retry() {
        refreshCount += 1
        Task { await loadUserData() }
    }

    private func applyDefaultLoggerSelectionIfNeeded() {
        guard isLogger else { return }
        guard loggerViewAsMember == nil else { return }
        guard let userId = programContext.loggedInUserId else { return }
        guard programContext.membersProgramId == programContext.programId else { return }
        guard let member = programContext.members.first(where: { $0.id == userId }) else { return }
        loggerViewAsMember = member
    }

    /// A logger's View-as change re-reads Recent only (MemberHealthCard loads its own preview) — all four cards when the
    /// shared state isn't this tab's any more.
    @MainActor
    private func loadLoggerLogsData(memberId: String) async {
        guard programContext.memberCardsOwner == MemberCardsOwner.membersTab else { return await loadUserData() }
        cards.recent = .loading
        let error = await programContext.loadMemberRecent(memberId: memberId, limit: 10, ownedWrite: true)
        guard !Task.isCancelled else { return }
        cards.recent = error == nil ? .loaded : .failed
    }

    /// `retried`: the one re-run after a late write landed mid-load (never stuck on placeholders).
    @MainActor
    private func loadUserData(retried: Bool = false) async {
        guard let userId = programContext.loggedInUserId, let programId = programContext.programId else { return }
        let pc = programContext
        // A new program, or another screen / an unowned write in the shared card state: placeholders — never those
        // numbers. Otherwise keep the cards and refresh under them.
        if loadState.value != programId || pc.memberCardsOwner != MemberCardsOwner.membersTab {
            cards = MemberCardsState()
            loadState = .loading
        } else {
            loadState = loadState.refreshing()
        }
        pc.memberCardsOwner = MemberCardsOwner.membersTab
        let lookup: Task<Void, Never>? = isLogger && (pc.members.isEmpty || pc.membersProgramId != programId)
            ? Task { await pc.loadLookupData() } : nil
        // A logger's Recent follows the View-as member, so it never shows the logger's own rows under another name.
        let recentId = recentMemberId ?? userId
        let result = await pc.loadMemberCards(memberId: userId, recentMemberId: recentId)
        await lookup?.value
        // Superseded (a program switch, the screen went away, or another screen took the cards over).
        guard !Task.isCancelled, pc.programId == programId, cardsFree else { return }
        cards = loadState.value == programId ? cards.merging(result.cards) : result.cards
        loadState = loadState.applying(cards: cards, error: result.error, key: programId, online: pc.isOnline)
        // The self metric row IS the overview row (same memberId-scoped /member-metrics DTO) — no all-member download.
        loggedInUserMetrics = pc.selectedMemberOverview?.member_id == userId ? pc.selectedMemberOverview : nil
        if isLogger, loggerViewAsMember == nil, let member = loggedInMember {
            loggerViewAsMember = member
        }
        // A late write that isn't ours landed while loading (its card shows a placeholder): re-run once.
        if !retried, pc.memberCardsMismatch(cards, memberId: userId, recentMemberId: recentMemberId ?? userId) {
            await loadUserData(retried: true)
        }
    }
}
