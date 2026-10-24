import SwiftUI

/// A person's profile (D-P3 · D-P4 · D-P7 · D-P11; specs/pages/ios/people/SPEC.md): workouts only — current + longest
/// streak, active days this month, last active, the last 10 workouts — and kudos. A member who hides their activity
/// shows by name with one honest line. Staff get "Open full stats" (the member's Members cards); global admins also get
/// the membership editor (D-P11 — editing stays global-admin), only once THIS screen's own membership-details load for
/// the profile's program landed (the edit-membership rule). A person no longer in the program → back.
struct PersonProfileView: View {
    @EnvironmentObject private var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss
    let memberId: String
    let programId: String
    let name: String
    @State private var state: LoadState<APIClient.PersonProfileDTO> = .idle
    /// The program whose membership details this screen loaded itself (global admins only).
    @State private var detailsProgramId: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                switch state {
                case .idle, .loading:
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                case .failed(let error):
                    ErrorStateView(error: error, onRetry: { Task { await load() } })
                case .loaded(let profile, _, _), .stale(let profile, _, _):
                    content(profile)
                }
            }
            .padding(20)
            .padding(.bottom, isBannerShowing ? 64 : 0)               // A6: the stale banner never covers the last card
            .frame(maxWidth: AdaptiveLayout.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .adaptiveBackground(topLeading: true)
        .navigationTitle(name)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }                                        // also after returning from the editor / full stats
        .onChange(of: programContext.isOnline) { _, online in
            if online, state.error != nil { Task { await load() } }
        }
        .floatingBanner { ScreenBanner(banner: staleBanner) }
    }

    @ViewBuilder
    private func content(_ profile: APIClient.PersonProfileDTO) -> some View {
        header(profile)
        if profile.activityVisible {
            if let stats = profile.stats { statsGrid(stats) }
            if let kudos = profile.kudos {
                KudosButton(memberId: profile.memberId, programId: profile.programId, kudos: kudos,
                            onHidden: { Task { await load() } })
                    .id(kudos)                                        // a re-fetch resets its local count
            }
            recentWorkouts(profile.recentWorkouts ?? [])
        } else {
            Text(profile.viewerHidesActivity == true ? PeopleCopy.hiddenByYouLine : PeopleCopy.hiddenLine)
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(PeopleCardBackground())
        }
        if profile.canOpenFullStats {
            NavigationLink {
                MemberFullStatsView(member: memberDTO(profile))
            } label: {
                settingsRow(icon: "chart.bar.xaxis", color: .appBlue,
                            title: PeopleCopy.openFullStats, subtitle: PeopleCopy.openFullStatsDetail)
            }
            .buttonStyle(.plain)
        }
        if programContext.isGlobalAdmin, detailsProgramId == profile.programId,
           let membership = programContext.membershipDetails.first(where: { $0.member_id == profile.memberId }) {
            NavigationLink {
                MemberDetailEditView(membership: membership)
            } label: {
                settingsRow(icon: "person.crop.circle.badge.checkmark", color: .appGreen,
                            title: PeopleCopy.editMembership, subtitle: PeopleCopy.editMembershipDetail)
            }
            .buttonStyle(.plain)
        }
    }

    private func header(_ profile: APIClient.PersonProfileDTO) -> some View {
        HStack(spacing: 14) {
            InitialsAvatar(initials: profile.initials, size: 64, highlighted: profile.isYou)
            VStack(alignment: .leading, spacing: 4) {
                Text(profile.memberName)
                    .font(.title3.weight(.bold))
                    .foregroundColor(Color(.label))
                    .fixedSize(horizontal: false, vertical: true)
                if !profile.username.isEmpty {
                    Text("@\(profile.username)")
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                }
                HStack(spacing: 6) {
                    if profile.isYou { PeoplePill(text: PeopleCopy.you) }
                    if let role = PeopleCopy.roleLabel(profile.programRole) { PeoplePill(text: role) }
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func statsGrid(_ stats: APIClient.PersonStatsDTO) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                statTile(PeopleCopy.currentStreak, PeopleCopy.days(stats.currentStreak), "flame.fill", .appOrange)
                statTile(PeopleCopy.longestStreak, PeopleCopy.days(stats.longestStreak), "trophy.fill", .appYellow)
            }
            .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 12) {
                statTile(PeopleCopy.thisMonth, PeopleCopy.days(stats.activeDaysThisMonth), "calendar", .appBlue)
                statTile(PeopleCopy.lastActive, stats.lastActive.map { PeopleCopy.dayLabel($0) } ?? "—", "clock.fill", .appGreen)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func statTile(_ title: String, _ value: String, _ icon: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.subheadline.weight(.bold))
                    .foregroundColor(color)
                Text(title)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(Color(.secondaryLabel))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(value)
                .font(.title3.weight(.bold))
                .foregroundColor(Color(.label))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(12)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private func recentWorkouts(_ workouts: [APIClient.PersonWorkoutDTO]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(PeopleCopy.recentWorkouts)
                .font(.headline.weight(.semibold))
                .foregroundColor(Color(.label))
            if workouts.isEmpty {
                Text(PeopleCopy.noWorkoutsLogged)
                    .font(.footnote)
                    .foregroundColor(Color(.secondaryLabel))
            } else {
                ForEach(Array(workouts.enumerated()), id: \.offset) { _, workout in
                    HStack(spacing: 10) {
                        Circle()
                            .fill(Color.appOrangeLight)
                            .frame(width: 10, height: 10)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(workout.workoutType)
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(Color(.label))
                            Text(workout.date.map { PeopleCopy.dayLabel($0) } ?? "—")
                                .font(.caption)
                                .foregroundColor(Color(.secondaryLabel))
                        }
                        Spacer()
                        Text(PeopleCopy.duration(workout.durationMinutes))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(Color(.label))
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PeopleCardBackground())
    }

    private var staleBanner: FloatingBanner? {
        guard case .stale = state else { return nil }
        return FloatingBanner(variant: .stale, onRetry: { Task { await load() } })
    }

    private var isBannerShowing: Bool { programContext.isOnline && staleBanner != nil }

    /// The shared Members cards take a MemberDTO — the profile's identity fields are enough.
    private func memberDTO(_ profile: APIClient.PersonProfileDTO) -> APIClient.MemberDTO {
        APIClient.MemberDTO(id: profile.memberId, member_name: profile.memberName, username: profile.username,
                            gender: nil, date_of_birth: nil, date_joined: nil, email: nil)
    }

    private func load() async {
        state = state.refreshing()
        async let details: Void = loadOwnMembershipDetails()
        do {
            state = .fresh(try await APIClient.shared.fetchPersonProfile(memberId: memberId, programId: programId))
        } catch {
            if let appError = AppError(error) {
                // Removed from the program meanwhile (e.g. via Edit membership): back to People, which reloads on appear.
                if appError.kind == .notFound, state.value != nil {
                    await details
                    dismiss()
                    return
                }
                state = state.failing(with: appError.labeled(online: programContext.isOnline))
            }
        }
        await details
    }

    /// Global admins: the membership editor needs this program's details loaded by this screen (fresh members too).
    private func loadOwnMembershipDetails() async {
        guard programContext.isGlobalAdmin, programContext.programId == programId else { return }
        if await programContext.loadMembershipDetails(), programContext.programId == programId { detailsProgramId = programId }
    }
}
