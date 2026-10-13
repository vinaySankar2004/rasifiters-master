import SwiftUI

// MARK: - Member list cards (the inline NavigationLink cards rendered by the Members tabs)
// Ported faithfully from legacy Features/Home/Detail/MemberCards.swift.
// polish #32 (people S5): every card takes its load state (MemberCardsState.swift) — a placeholder while loading, "—"
// when its read failed — never a fake zero or "No workouts logged yet." on a failure (frontend-kit §5; the Summary recipe).

private func formatDuration(_ totalMinutes: Int) -> String {
    let h = totalMinutes / 60
    let m = totalMinutes % 60
    if h == 0 { return "\(m)m" }
    if m == 0 { return "\(h)h" }
    return "\(h)h \(m)m"
}

struct MemberHistoryCard: View {
    @EnvironmentObject var programContext: ProgramContext
    let selectedMember: APIClient.MemberDTO?
    var state: MemberCardState = .loaded

    private var memberId: String? {
        selectedMember?.id ?? programContext.selectedMemberOverview?.member_id
    }

    private var memberPoints: [APIClient.ActivityTimelinePoint] {
        memberTimelinePoints(from: programContext.memberHistory)
    }

    /// Render-time identity: the shared history shows only when it is this card's member's (nil member = signed-in).
    private var shownState: MemberCardState {
        state == .loaded && programContext.memberHistoryMemberId != (selectedMember?.id ?? programContext.loggedInUserId)
            ? .loading : state
    }

    var body: some View {
        let capturedMemberId = memberId  // Capture value directly
        return NavigationLink {
            ActivityTimelineDetailView(
                initialPeriod: .week,
                memberId: capturedMemberId,
                showActiveSeries: false
            )
            .navigationTitle("Workout History")
            .navigationBarTitleDisplayMode(.inline)
        } label: {
            if shownState == .loaded {
                ActivityTimelineCardSummary(points: memberPoints, showActive: false)
            } else {
                // The chart card's chrome + height, so nothing jumps when it loads.
                CardShell(background: Color(.systemBackground).opacity(0.95),
                          strokeColor: Color(.systemGray4).opacity(0.5), height: 280) {
                    VStack(alignment: .leading, spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Workout Activity Timeline")
                                .font(.headline.weight(.semibold))
                                .foregroundColor(Color(.label))
                            Text("Workouts")
                                .font(.subheadline)
                                .foregroundColor(Color(.secondaryLabel))
                        }
                        if shownState == .failed {
                            MemberCardFailure()
                        } else {
                            MemberCardPlaceholder(height: 180)
                        }
                    }
                }
            }
        }
    }
}

struct MemberStreakCard: View {
    @EnvironmentObject var programContext: ProgramContext
    let selectedMember: APIClient.MemberDTO?
    var state: MemberCardState = .loaded

    private var streaks: APIClient.MemberStreaksResponse? { programContext.memberStreaks }

    /// Render-time identity: the shared streaks show only when they are this card's member's (nil member = signed-in).
    private var shownState: MemberCardState {
        state == .loaded && programContext.memberStreaksMemberId != (selectedMember?.id ?? programContext.loggedInUserId)
            ? .loading : state
    }

    var body: some View {
        NavigationLink {
            MemberStreakDetail()
                .environmentObject(programContext)
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Streak Stats")
                            .font(.headline.weight(.semibold))
                        Text("Current and longest")
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.tertiaryLabel))
                }

                HStack(spacing: 12) {
                    streakTile(title: "Current", value: streakValue(streaks?.currentStreakDays), icon: "flame.fill", color: .appOrange)
                    streakTile(title: "Longest", value: streakValue(streaks?.longestStreakDays), icon: "trophy.fill", color: .appYellow)
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(.systemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1)
            )
            .adaptiveShadow(radius: 8, y: 4)
        }
        .buttonStyle(.plain)
    }

    /// "…" while loading, "—" when the read failed or has no value (the Summary recipe) — never a fake "0 days".
    private func streakValue(_ days: Int?) -> String {
        switch shownState {
        case .loading: return "…"
        case .failed: return "—"
        case .loaded: return days.map { "\($0) days" } ?? "—"
        }
    }

    private func streakTile(title: String, value: String, icon: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .foregroundColor(color)
                    .font(.subheadline.weight(.bold))
                Text(title)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(Color(.secondaryLabel))
            }
            Text(value)
                .font(.title3.weight(.bold))
                .foregroundColor(Color(.label))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

struct MemberRecentCard: View {
    @EnvironmentObject var programContext: ProgramContext
    let selectedMember: APIClient.MemberDTO?
    var state: MemberCardState = .loaded

    private var memberId: String? {
        selectedMember?.id ?? programContext.loggedInUserId
    }

    /// Render-time identity: the shared recent rows show only when they are this card's member's.
    private var shownState: MemberCardState {
        state == .loaded && programContext.memberRecentMemberId != memberId ? .loading : state
    }

    var body: some View {
        NavigationLink {
            MemberRecentDetail(memberId: memberId, memberName: selectedMember?.member_name ?? programContext.loggedInUserName)
                .environmentObject(programContext)
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("View Workouts")
                            .font(.headline.weight(.semibold))
                        Text("All workouts")
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.tertiaryLabel))
                }

                switch shownState {
                case .loading:
                    MemberCardPlaceholder(height: 60)
                case .failed:
                    MemberCardFailure()
                case .loaded:
                    if programContext.memberRecent.isEmpty {
                        Text("No workouts logged yet.")
                            .font(.footnote)
                            .foregroundColor(Color(.secondaryLabel))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        VStack(spacing: 8) {
                            ForEach(programContext.memberRecent.prefix(3)) { item in
                                HStack(spacing: 10) {
                                    Circle()
                                        .fill(Color.appOrangeLight)
                                        .frame(width: 10, height: 10)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.workoutType)
                                            .font(.subheadline.weight(.semibold))
                                        Text(item.workoutDate)
                                            .font(.caption)
                                            .foregroundColor(Color(.secondaryLabel))
                                    }
                                    Spacer()
                                    Text(formatDuration(item.durationMinutes))
                                        .font(.subheadline.weight(.semibold))
                                }
                            }
                        }
                    }
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(.systemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1)
            )
            .adaptiveShadow(radius: 8, y: 4)
        }
        .buttonStyle(.plain)
    }
}

struct MemberHealthCard: View {
    @EnvironmentObject var programContext: ProgramContext
    let selectedMember: APIClient.MemberDTO?
    /// Bumped by the host's pull-to-refresh / Retry (polish #32).
    var refreshToken = 0

    @State private var previewLogs: [APIClient.DailyHealthLogItem] = []
    /// "<program>|<member>" the rows belong to — another program or member blanks them at once.
    @State private var previewKey: String?
    @State private var state: MemberCardState = .loading

    private var memberId: String? {
        selectedMember?.id ?? programContext.loggedInUserId
    }

    private var memberName: String? {
        selectedMember?.member_name ?? programContext.loggedInUserName
    }

    var body: some View {
        NavigationLink {
            MemberHealthDetail(memberId: memberId, memberName: memberName)
                .environmentObject(programContext)
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("View Health")
                            .font(.headline.weight(.semibold))
                        Text("Daily health logs")
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.tertiaryLabel))
                }

                switch state {
                case .loading:
                    MemberCardPlaceholder(height: 60)
                case .failed:
                    MemberCardFailure()
                case .loaded:
                    if previewLogs.isEmpty {
                        Text("No daily health logs yet.")
                            .font(.footnote)
                            .foregroundColor(Color(.secondaryLabel))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        VStack(spacing: 8) {
                            ForEach(previewLogs.prefix(3)) { item in
                                HStack(spacing: 10) {
                                    Circle()
                                        .fill(Color.appBlueLight)
                                        .frame(width: 10, height: 10)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.logDate)
                                            .font(.subheadline.weight(.semibold))
                                        Text("Sleep \(sleepLabel(item.sleepHours)) · Diet \(foodLabel(item.foodQuality)) · Steps \(stepsLabel(item.steps))")
                                            .font(.caption)
                                            .foregroundColor(Color(.secondaryLabel))
                                    }
                                    Spacer()
                                }
                            }
                        }
                    }
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(.systemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1)
            )
            .adaptiveShadow(radius: 8, y: 4)
        }
        .buttonStyle(.plain)
        .task(id: "\(programContext.programId ?? "")|\(memberId ?? "")|\(refreshToken)") {
            await loadPreview()
        }
        .onChange(of: programContext.isOnline) { _, online in
            if online, state == .failed { Task { await loadPreview() } }      // D-KIT-13
        }
    }

    /// Its own 10-row preview. Another member / program blanks it at once (never the previous rows); a refresh keeps the
    /// rows; a failure with nothing of its own → "—" (polish #32).
    private func loadPreview() async {
        let key = "\(programContext.programId ?? "")|\(memberId ?? "")"
        if previewKey != key {
            previewLogs = []
            state = .loading
            previewKey = key
        }
        guard let memberId, let programId = programContext.programId, let token = programContext.authToken else {
            state = .loaded                                     // identity unresolved → the existing empty line
            return
        }
        do {
            let items = try await APIClient.shared.fetchDailyHealthLogs(
                token: token, programId: programId, memberId: memberId, limit: 10
            ).items
            guard previewKey == key else { return }
            previewLogs = items
            state = .loaded
        } catch {
            guard AppError(error) != nil, previewKey == key else { return }   // cancelled / superseded
            if previewLogs.isEmpty { state = .failed }
        }
    }

    private func sleepLabel(_ value: Double?) -> String {
        guard let value else { return "—" }
        return String(format: "%.1f hrs", value)
    }

    private func foodLabel(_ value: Int?) -> String {
        guard let value else { return "—" }
        return "\(value)/5"
    }

    private func stepsLabel(_ value: Int?) -> String {
        guard let value else { return "—" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }
}
