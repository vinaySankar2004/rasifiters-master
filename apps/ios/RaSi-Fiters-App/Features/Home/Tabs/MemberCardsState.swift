import SwiftUI

// MARK: - Members-card load states (polish #32, people S5 — the Summary recipe, A13)
// The Members tabs and "Open full stats" show the shared ProgramContext member cards. Each card takes its own state: a
// placeholder while loading and "—" when its read failed — never a fake zero or "No workouts logged yet." on a failure.

/// The owner token of the shared Members-card state for both Members tabs (ProgramContext.memberCardsOwner — the
/// card-owner rule). MemberFullStatsView uses its own UUID; nil = an unowned write (a detail screen's own read).
enum MemberCardsOwner {
    static let membersTab = "members-tab"
}

/// One Members card's load state.
enum MemberCardState: Equatable {
    case loading
    case loaded
    case failed
}

/// The four ProgramContext-backed Members cards (overview · history · streaks · recent — loaded together by
/// `ProgramContext.loadMemberCards`). MemberHealthCard and MemberMetricsPreviewCard load themselves.
struct MemberCardsState: Equatable {
    var overview = MemberCardState.loading
    var history = MemberCardState.loading
    var streaks = MemberCardState.loading
    var recent = MemberCardState.loading

    var allFailed: Bool { [overview, history, streaks, recent].allSatisfy { $0 == .failed } }

    /// A failed refresh keeps a card that already shows data (W7-D2: keep the data + "Couldn't refresh").
    func merging(_ next: MemberCardsState) -> MemberCardsState {
        func keep(_ old: MemberCardState, _ new: MemberCardState) -> MemberCardState {
            new == .failed && old == .loaded ? .loaded : new
        }
        return MemberCardsState(overview: keep(overview, next.overview), history: keep(history, next.history),
                                streaks: keep(streaks, next.streaks), recent: keep(recent, next.recent))
    }
}

extension ProgramContext {
    /// Whose numbers the four shared card values hold right now — the screens watch it for a write that isn't theirs.
    var memberCardsIdentity: [String?] {
        [selectedMemberOverview?.member_id, memberHistoryMemberId, memberStreaksMemberId, memberRecentMemberId]
    }

    /// A card the screen shows as loaded holds another member's value than `memberId` (Recent may follow
    /// `recentMemberId`) — it renders a placeholder (render-time identity) until the screen reloads.
    func memberCardsMismatch(_ cards: MemberCardsState, memberId: String, recentMemberId: String? = nil) -> Bool {
        if cards.overview == .loaded, let overview = selectedMemberOverview, overview.member_id != memberId { return true }
        if cards.history == .loaded, memberHistoryMemberId != memberId { return true }
        if cards.streaks == .loaded, memberStreaksMemberId != memberId { return true }
        return cards.recent == .loaded && memberRecentMemberId != (recentMemberId ?? memberId)
    }
}

extension LoadState where Value == String {
    /// The Summary recipe (A13) for one Members-cards load of `key` (the program / member on screen): no error → fresh;
    /// every card failed with nothing kept → failed (ErrorStateView + Retry); otherwise stale (the cards that loaded or
    /// were kept, "—" in the failed ones + "Couldn't refresh · Retry").
    func applying(cards: MemberCardsState, error: AppError?, key: String, online: Bool) -> LoadState<String> {
        guard let error else { return .fresh(key) }
        let labeled = error.labeled(online: online)                              // polish-1 rule 6
        return cards.allFailed ? .failed(labeled) : .stale(key, fetchedAt: Date(), error: labeled)
    }
}

/// A Members card's loading placeholder — a redacted block, never a zero.
struct MemberCardPlaceholder: View {
    var height: CGFloat = 60

    var body: some View {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(Color(.systemGray5))
            .frame(height: height)
            .redacted(reason: .placeholder)
            .accessibilityLabel("Loading")
    }
}

/// A Members card whose read failed: "—" (the partial-failure rule); the screen's "Couldn't refresh · Retry" banner,
/// error view or pull-to-refresh retries it.
struct MemberCardFailure: View {
    var body: some View {
        Text("—")
            .font(.title3.weight(.bold))
            .foregroundColor(Color(.secondaryLabel))
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityLabel(KitCopy.errorViewTitle)
    }
}
