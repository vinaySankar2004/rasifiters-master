import SwiftUI

/// People (D-P1 · D-P2 · D-P10; specs/pages/ios/people/SPEC.md): the current program's active members, for every role —
/// "You" first, initials, last active; every row opens the profile. Replaces the old roster list at
/// every entry: both Members-tab headers and the Program tab's People row. Program admins and global admins get an
/// "Invite member" row on top (the People entry decision). A member who hides their activity shows by name, "Activity
/// hidden" (D-P7).
struct PeopleListView: View {
    @EnvironmentObject private var programContext: ProgramContext
    @State private var state: LoadState<APIClient.PeopleListDTO> = .idle
    @State private var searchText = ""
    /// Rows are plain-style buttons with state-driven pushes (the program picker's pattern): a List row's own selection
    /// (NavigationLink / default-style Button rows) never fires under the root's keyboard-dismiss tap gesture on iPhone.
    @State private var selectedPerson: PersonRoute?
    @State private var showInvite = false

    var body: some View {
        List {
            if programContext.canEditProgramData {
                Button { showInvite = true } label: { InviteMemberRow() }
                    .buttonStyle(.plain)
            }
            switch state {
            case .idle, .loading:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            case .failed(let error):
                ErrorStateView(error: error, onRetry: { Task { await load() } })
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            case .loaded(let list, _, _), .stale(let list, _, _):
                let people = filtered(list.people)
                if people.isEmpty {
                    Text(searchText.isEmpty ? PeopleCopy.empty : PeopleCopy.noMatches)
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                        .listRowBackground(Color.clear)
                } else {
                    ForEach(people) { person in
                        Button {
                            selectedPerson = PersonRoute(memberId: person.memberId, programId: list.programId,
                                                         name: person.memberName)
                        } label: {
                            PersonRow(person: person)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if isBannerShowing { Color.clear.frame(height: 76) }          // A6: the stale banner never covers a row
        }
        // Container cap (large-screen column rules) + a matching backdrop beside the capped List on iPad / Mac.
        .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
        .frame(maxWidth: .infinity)
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .searchable(text: $searchText, prompt: PeopleCopy.searchPrompt)
        .navigationTitle(PeopleCopy.title)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $selectedPerson) { route in
            PersonProfileView(memberId: route.memberId, programId: route.programId, name: route.name)
        }
        .navigationDestination(isPresented: $showInvite) { InviteMemberView() }
        .refreshable { await load() }
        .task(id: programContext.programId) { await load() }
        .task { await programContext.offerActivityVisibilityNotice() }      // people U-1 (b), the notice rule
        .onChange(of: programContext.isOnline) { _, online in
            if online, state.error != nil { Task { await load() } }       // D-KIT-13: refetch on reconnect
        }
        .floatingBanner { ScreenBanner(banner: staleBanner) }
    }

    /// Matches the name or the username.
    private func filtered(_ people: [APIClient.PersonDTO]) -> [APIClient.PersonDTO] {
        let query = searchText.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return people }
        return people.filter {
            $0.memberName.localizedCaseInsensitiveContains(query) || $0.username.localizedCaseInsensitiveContains(query)
        }
    }

    private var staleBanner: FloatingBanner? {
        guard case .stale = state else { return nil }
        return FloatingBanner(variant: .stale, onRetry: { Task { await load() } })
    }

    private var isBannerShowing: Bool { programContext.isOnline && staleBanner != nil }

    private func load() async {
        guard let programId = programContext.programId else { return }
        state = state.refreshing()
        do {
            state = .fresh(try await APIClient.shared.fetchPeople(programId: programId))
        } catch {
            if let appError = AppError(error) { state = state.failing(with: appError.labeled(online: programContext.isOnline)) }
        }
    }
}

private struct PersonRow: View {
    let person: APIClient.PersonDTO

    var body: some View {
        HStack(spacing: 12) {
            InitialsAvatar(initials: person.initials, highlighted: person.isYou)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(person.memberName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Color(.label))
                        .fixedSize(horizontal: false, vertical: true)
                    if person.isYou { PeoplePill(text: PeopleCopy.you) }
                    if let role = PeopleCopy.roleLabel(person.programRole) { PeoplePill(text: role) }
                }
                Text(PeopleCopy.lastActiveLine(person))
                    .font(.caption)
                    .foregroundColor(Color(.secondaryLabel))
            }
            Spacer(minLength: 0)
            RowChevron()
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}

/// The profile a tapped row opens.
private struct PersonRoute: Hashable {
    let memberId: String
    let programId: String
    let name: String
}

/// The disclosure chevron a NavigationLink row would show (the rows are plain buttons).
private struct RowChevron: View {
    var body: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(Color(.tertiaryLabel))
            .accessibilityHidden(true)
    }
}

/// The admins' "Invite member" row on top of People (the People entry decision — Invite moved here from the header).
private struct InviteMemberRow: View {
    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.appBlueLight)
                    .frame(width: 44, height: 44)
                Image(systemName: "envelope.badge.person.crop")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.appBlue)
            }
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(PeopleCopy.inviteMember)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Text(PeopleCopy.inviteMemberDetail)
                    .font(.caption)
                    .foregroundColor(Color(.secondaryLabel))
            }
            Spacer(minLength: 0)
            RowChevron()
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}

/// Initials only (people D-P10) — the server computes them, so every surface shows the same letters.
struct InitialsAvatar: View {
    let initials: String
    var size: CGFloat = 44
    var highlighted = false

    var body: some View {
        ZStack {
            Circle()
                .fill(highlighted ? Color.appOrangeLight : Color(.systemGray5))
                .frame(width: size, height: size)
            Text(initials)
                .font(size >= 60 ? .title3.weight(.semibold) : .subheadline.weight(.semibold))
                .foregroundColor(highlighted ? .appOrange : Color(.label))
        }
        .accessibilityHidden(true)
    }
}

/// A small capsule label — "You", "Admin", "Logger".
struct PeoplePill: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .foregroundColor(.appOrange)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Capsule().fill(Color.appOrangeLight))
            .fixedSize()
    }
}

/// The People cards' chrome (profile sections, kudos).
struct PeopleCardBackground: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(Color(.systemBackground))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1))
    }
}

/// People copy — the shared People copy table (identical on web / iOS / Android).
enum PeopleCopy {
    static let title = "People"
    static let searchPrompt = "Search people"
    static let you = "You"
    static let empty = "No one in this program yet."
    static let noMatches = "No one matches your search."
    static let inviteMember = "Invite member"
    static let inviteMemberDetail = "Send an invite by username"
    static let activityHidden = "Activity hidden"
    static let hiddenLine = "This member keeps their activity private."
    static let noWorkoutsYet = "No workouts yet"
    static let currentStreak = "Current streak"
    static let longestStreak = "Longest streak"
    static let thisMonth = "This month"
    static let lastActive = "Last active"
    static let recentWorkouts = "Recent workouts"
    static let noWorkoutsLogged = "No workouts logged yet."
    static let openFullStats = "Open full stats"
    static let openFullStatsDetail = "History, streaks, health"
    static let editMembership = "Edit membership"
    static let editMembershipDetail = "Joined date, status, remove"
    static let giveKudos = "Give kudos"
    static let kudosGiven = "Kudos given"
    static let kudosGivenHint = "You gave kudos today. Tap again to undo."
    static let kudosLimit = "You've changed kudos too many times. Try again later."
    static let hideActivity = "Hide my activity"
    static let hideActivityDetail = "Hides your workouts, streaks and kudos from other members of your programs. Program admins and loggers still see them."
    static let saveFailed = "Couldn't save."

    static func enrolled(_ count: Int) -> String { "\(count) enrolled" }

    static func roleLabel(_ role: String) -> String? {
        switch role {
        case "admin": return "Admin"
        case "logger": return "Logger"
        default: return nil
        }
    }

    /// Active today · Active yesterday · Last active Oct 12 · Last active Oct 12, 2025 · No workouts yet · Activity hidden.
    static func lastActiveLine(_ person: APIClient.PersonDTO) -> String {
        guard person.activityVisible else { return activityHidden }
        guard let ymd = person.lastActive else { return noWorkoutsYet }
        guard let date = ymdFormatter.date(from: ymd) else { return "\(lastActive) \(ymd)" }
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Active today" }
        if calendar.isDateInYesterday(date) { return "Active yesterday" }
        return "\(lastActive) \(shortDate(date))"
    }

    static func days(_ count: Int) -> String { count == 1 ? "1 day" : "\(count) days" }

    static func kudosCount(_ count: Int) -> String { "\(count) kudos" }

    static func duration(_ minutes: Int) -> String {
        let hours = minutes / 60, rest = minutes % 60
        if hours == 0 { return "\(rest)m" }
        return rest == 0 ? "\(hours)h" : "\(hours)h \(rest)m"
    }

    /// A "YYYY-MM-DD" log date against this device's calendar: Today · Yesterday · Oct 12 · Oct 12, 2025.
    static func dayLabel(_ ymd: String) -> String {
        guard let date = ymdFormatter.date(from: ymd) else { return ymd }
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        return shortDate(date)
    }

    private static func shortDate(_ date: Date) -> String {
        Calendar.current.isDate(date, equalTo: Date(), toGranularity: .year)
            ? date.formatted(.dateTime.month(.abbreviated).day())
            : date.formatted(.dateTime.month(.abbreviated).day().year())
    }

    private static let ymdFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}
