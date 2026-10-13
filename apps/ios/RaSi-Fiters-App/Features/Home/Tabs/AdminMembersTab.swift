import SwiftUI

// MARK: - Members Tab (program-admin + global-admin variant)
// Ported faithfully from legacy Features/Home/Tabs/AdminOtherTabs.swift (the AdminMembersTab struct).
// People entry decision: the header button opens People (it was Invite; Invite moved to People's "Invite member" row and
// stays on the Program tab). polish #32 (people S5): the View-as cards on the kit's Summary recipe — placeholders while
// loading, "—" per failed card, ErrorStateView + Retry when nothing loaded, "Couldn't refresh · Retry" over kept data,
// pull-to-refresh, reload on reconnect; never another member's / program's numbers (#10, the card-owner rule).
// polish #5 kept: the reads run in parallel; the preview + health cards load themselves.

struct AdminMembersTab: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var showMemberPicker = false
    @State private var selectedMember: APIClient.MemberDTO?
    /// "<program>|<member>" whose cards are on screen (frontend-kit §5).
    @State private var loadState: LoadState<String> = .idle
    @State private var cards = MemberCardsState()
    /// Bumped by pull-to-refresh / Retry — the self-loading preview + health cards reload too.
    @State private var refreshCount = 0
    /// The View-as load in flight — cancelled when a newer one starts or another screen takes the cards over.
    @State private var loadTask: Task<Void, Never>?
    /// The tab's own screen is on screen (not covered by People / a profile / "Open full stats" / a detail).
    @State private var isVisible = false
    private var canViewAs: Bool { programContext.isProgramAdmin }

    /// The shared card state is ours or unowned — a background reload may write it. While another screen ("Open full
    /// stats") owns it, only this tab's own appearance reloads (the card-owner rule).
    private var cardsFree: Bool {
        let owner = programContext.memberCardsOwner
        return owner == nil || owner == MemberCardsOwner.membersTab
    }

    private var viewAsLabel: String {
        if let selectedMember {
            return selectedMember.member_name
        }
        if programContext.isGlobalAdmin {
            return "None"
        }
        return programContext.loggedInUserName ?? "Member"
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
                        // People — the admins' entry (D-P2; Invite lives in People's first row)
                        NavigationLink {
                            PeopleListView()
                        } label: {
                            GlassButton(icon: "person.2")
                        }
                        .accessibilityLabel(PeopleCopy.title)
                    }
                    .padding(.top, 24)

                    NavigationLink {
                        MemberMetricsDetailView()
                    } label: {
                        MemberMetricsPreviewCard(refreshToken: refreshCount)
                    }
                    .buttonStyle(.plain)

                    if canViewAs {
                        viewAsSelector
                        if let member = selectedMember {
                            memberCards(member)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, isBannerShowing ? 88 : 24)          // A6: the stale banner never covers the last card
                .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
                .frame(maxWidth: .infinity)
            }
            .refreshable {
                refreshCount += 1
                loadTask?.cancel()
                if let selectedMember { await loadMemberData(for: selectedMember) }
            }
            .adaptiveBackground(topLeading: true)
            .navigationBarBackButtonHidden(true)
            .floatingBanner { ScreenBanner(banner: staleBanner) }
            .onAppear {
                isVisible = true
                // Back from "Open full stats" / a detail screen: another member — or an unowned write — is in the shared
                // card state. Placeholders, then our View-as member again.
                let owner = programContext.memberCardsOwner
                guard let selectedMember, owner != nil || loadState.value != nil else { return }
                guard owner != MemberCardsOwner.membersTab
                        || programContext.memberCardsMismatch(cards, memberId: selectedMember.id) else { return }
                cards = MemberCardsState()
                loadState = .loading
                startLoad(for: selectedMember)
            }
            .onDisappear { isVisible = false }
        }
        .task {
            applyDefaultSelectionIfNeeded()
        }
        .onChange(of: programContext.programId) { _, _ in
            if !programContext.isGlobalAdmin {
                selectedMember = nil
            }
            applyDefaultSelectionIfNeeded()
        }
        .onChange(of: programContext.members.count) { _, _ in
            if cardsFree { applyDefaultSelectionIfNeeded() }
        }
        .onChange(of: programContext.loggedInUserId) { _, _ in
            if !programContext.isGlobalAdmin {
                selectedMember = nil
            }
            applyDefaultSelectionIfNeeded()
        }
        .onChange(of: programContext.isOnline) { _, online in
            // D-KIT-13: back online after a failed load → reload by itself (not while another screen owns the cards).
            if online, loadState.error != nil, cardsFree, let selectedMember { startLoad(for: selectedMember) }
        }
        .onChange(of: programContext.memberCardsIdentity) { _, _ in
            guard let selectedMember else { return }
            // Ownership moved ("Open full stats" is loading): stop our writes.
            guard cardsFree else {
                loadTask?.cancel()
                loadTask = nil
                return
            }
            // A late write that isn't our member's (the cards already show placeholders — render-time identity).
            guard isVisible, loadState.value != nil,
                  programContext.memberCardsMismatch(cards, memberId: selectedMember.id) else { return }
            startLoad(for: selectedMember)
        }
    }

    @ViewBuilder
    private func memberCards(_ member: APIClient.MemberDTO) -> some View {
        if case .failed(let error) = loadState {
            ErrorStateView(error: error, onRetry: retry)
        } else {
            MemberOverviewCard(member: member, state: cards.overview)
            MemberHistoryCard(selectedMember: member, state: cards.history)
            MemberStreakCard(selectedMember: member, state: cards.streaks)
            MemberRecentCard(selectedMember: member, state: cards.recent)
            MemberHealthCard(selectedMember: member, refreshToken: refreshCount)
        }
    }

    private var viewAsSelector: some View {
        Button {
            showMemberPicker = true
        } label: {
            HStack {
                Text("View as")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Spacer()
                Text(viewAsLabel)
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
        .sheet(isPresented: $showMemberPicker) {
            MemberPickerView(
                members: programContext.members,
                selected: selectedMember,
                showNoneOption: programContext.isGlobalAdmin,
                onSelect: { member in
                    applySelection(member)
                }
            )
        }
    }

    private var staleBanner: FloatingBanner? {
        guard case .stale = loadState, selectedMember != nil else { return nil }
        return FloatingBanner(variant: .stale, onRetry: retry)
    }

    private var isBannerShowing: Bool { programContext.isOnline && staleBanner != nil }

    /// Retry (error view / banner): the View-as cards + the self-loading preview and health cards.
    private func retry() {
        refreshCount += 1
        if let selectedMember { startLoad(for: selectedMember) }
    }

    private func applySelection(_ member: APIClient.MemberDTO?) {
        selectedMember = member
        showMemberPicker = false
        startLoad(for: member)
    }

    /// One View-as load at a time; the handle lets a newer load or another owner cancel it.
    private func startLoad(for member: APIClient.MemberDTO?) {
        loadTask?.cancel()
        loadTask = Task { await loadMemberData(for: member) }
    }

    /// `retried`: the one re-run after a late write landed mid-load (never stuck on placeholders).
    @MainActor
    private func loadMemberData(for member: APIClient.MemberDTO?, retried: Bool = false) async {
        let pc = programContext
        guard let member, let programId = pc.programId else {
            loadState = .idle
            cards = MemberCardsState()
            pc.memberCardsOwner = MemberCardsOwner.membersTab
            pc.selectedMemberOverview = nil
            pc.memberHistory = []
            pc.memberStreaks = nil
            pc.memberRecent = []
            pc.memberHealthLogs = []
            pc.memberHistoryMemberId = nil
            pc.memberStreaksMemberId = nil
            pc.memberRecentMemberId = nil
            return
        }
        let key = "\(programId)|\(member.id)"
        // Another member / program, or another screen / an unowned write in the shared state: placeholders.
        if loadState.value != key || pc.memberCardsOwner != MemberCardsOwner.membersTab {
            cards = MemberCardsState()
            loadState = .loading
        } else {
            loadState = loadState.refreshing()
        }
        pc.memberCardsOwner = MemberCardsOwner.membersTab
        let result = await pc.loadMemberCards(memberId: member.id)
        // Superseded (another selection / program, the view went away, or another screen took the cards over).
        guard !Task.isCancelled, selectedMember?.id == member.id, pc.programId == programId, cardsFree else { return }
        cards = loadState.value == key ? cards.merging(result.cards) : result.cards
        loadState = loadState.applying(cards: cards, error: result.error, key: key, online: pc.isOnline)
        // A late write that isn't this member's landed while loading (its card shows a placeholder): re-run once.
        if !retried, pc.memberCardsMismatch(cards, memberId: member.id) { await loadMemberData(for: member, retried: true) }
    }

    private func applyDefaultSelectionIfNeeded() {
        guard !programContext.isGlobalAdmin else { return }
        guard selectedMember == nil else { return }
        guard let userId = programContext.loggedInUserId else { return }
        guard programContext.membersProgramId == programContext.programId else { return }
        guard let member = programContext.members.first(where: { $0.id == userId }) else { return }
        applySelection(member)
    }
}
