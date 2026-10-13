import SwiftUI

/// Staff "Open full stats" from a profile (D-P11): the member's Members cards — overview, workout history, streaks,
/// recent workouts, health — with their detail screens, on the same S5 recipe as the Members tabs. The cards read
/// ProgramContext's shared member state, so this screen OWNS it while it loads (the card-owner rule): whenever it
/// (re)appears and someone else loaded that state (a Members tab, another full-stats screen, an unowned write), it shows
/// placeholders and reloads — never another member's numbers.
struct MemberFullStatsView: View {
    @EnvironmentObject private var programContext: ProgramContext
    let member: APIClient.MemberDTO
    @State private var ownerId = UUID().uuidString
    @State private var loadState: LoadState<String> = .idle
    @State private var cards = MemberCardsState()
    @State private var refreshCount = 0
    /// On screen right now — only the visible screen reloads when the shared cards turn out to be someone else's.
    @State private var isVisible = false

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 16) {
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
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, isBannerShowing ? 88 : 24)
            .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
            .frame(maxWidth: .infinity)
        }
        .refreshable {
            refreshCount += 1
            await load()
        }
        .adaptiveBackground(topLeading: true)
        .navigationTitle(member.member_name)
        .navigationBarTitleDisplayMode(.inline)
        .floatingBanner { ScreenBanner(banner: staleBanner) }
        .task { await load() }                                            // every appearance (pop back / tab switch)
        .onAppear { isVisible = true }
        .onDisappear { isVisible = false }
        .onChange(of: programContext.isOnline) { _, online in
            // D-KIT-13, only while this screen still owns the cards — another owner's screen reloads its own.
            if online, loadState.error != nil, ownsOrFree { Task { await load() } }
        }
        .onChange(of: programContext.memberCardsIdentity) { _, _ in
            // A late write that isn't this member's (the cards already show placeholders — render-time identity).
            guard isVisible, loadState.value != nil, ownsOrFree,
                  programContext.memberCardsMismatch(cards, memberId: member.id) else { return }
            Task { await load() }
        }
    }

    /// The shared cards are this screen's or unowned.
    private var ownsOrFree: Bool {
        let owner = programContext.memberCardsOwner
        return owner == nil || owner == ownerId
    }

    private var staleBanner: FloatingBanner? {
        guard case .stale = loadState else { return nil }
        return FloatingBanner(variant: .stale, onRetry: retry)
    }

    private var isBannerShowing: Bool { programContext.isOnline && staleBanner != nil }

    private func retry() {
        refreshCount += 1
        Task { await load() }
    }

    /// `retried`: the one re-run after a late write landed mid-load (never stuck on placeholders).
    private func load(retried: Bool = false) async {
        guard let programId = programContext.programId else { return }
        let key = "\(programId)|\(member.id)"
        // Another screen loaded its member into the shared card state, or a first load: placeholders.
        if loadState.value != key || programContext.memberCardsOwner != ownerId {
            cards = MemberCardsState()
            loadState = .loading
        } else {
            loadState = loadState.refreshing()
        }
        programContext.memberCardsOwner = ownerId
        let result = await programContext.loadMemberCards(memberId: member.id)
        // Superseded (cancelled, another program, or another screen took the cards over meanwhile).
        guard !Task.isCancelled, programContext.programId == programId else { return }
        guard programContext.memberCardsOwner == ownerId else {
            // An unowned write (a detail screen's own read) landed meanwhile: re-run once rather than stay on placeholders.
            if programContext.memberCardsOwner == nil, !retried { await load(retried: true) }
            return
        }
        cards = loadState.value == key ? cards.merging(result.cards) : result.cards
        loadState = loadState.applying(cards: cards, error: result.error, key: key, online: programContext.isOnline)
        // A late write that isn't this member's landed while loading (its card shows a placeholder): re-run once.
        if !retried, programContext.memberCardsMismatch(cards, memberId: member.id) { await load(retried: true) }
    }
}
