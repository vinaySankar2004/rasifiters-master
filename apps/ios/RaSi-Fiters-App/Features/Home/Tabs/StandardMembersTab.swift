import SwiftUI

// MARK: - Standard Members Tab (for non-admin users)
// Ported faithfully from legacy Features/Home/Tabs/StandardMembersTab.swift.

struct StandardMembersTab: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var loggedInUserMetrics: APIClient.MemberMetricsDTO?
    @State private var loggerViewAsMember: APIClient.MemberDTO?
    @State private var showLoggerMemberPicker = false
    @State private var loadedProgramId: String?

    private var isLogger: Bool {
        programContext.loggedInUserProgramRole == "logger"
    }

    private var loggedInMember: APIClient.MemberDTO? {
        guard let userId = programContext.loggedInUserId else { return nil }
        return programContext.members.first { $0.id == userId }
    }

    private var loggerViewAsLabel: String {
        loggerViewAsMember?.member_name ?? programContext.loggedInUserName ?? "Member"
    }

    var body: some View {
        NavigationStack {
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 16) {
                    // Header with View Members button
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
                        // View Members button
                        NavigationLink {
                            ProgramMembersListView()
                        } label: {
                            GlassButton(icon: "person.2")
                        }
                    }
                    .padding(.top, 24)

                    if isLoading {
                        ProgressView()
                            .padding()
                    } else {
                        // The member's own cards render UNCONDITIONALLY (parity with web). Each card handles its
                        // own empty/nil state ("No workouts logged yet.", 0-day streak, etc.), so we no longer
                        // gate the whole set on selectedMemberOverview != nil — a member with no data (or a
                        // transient load miss) would otherwise see a blank tab with only "View Members".
                        MemberOverviewCard(member: loggedInMember)

                        // Logged-in user's MemberMetricsCard — needs a concrete metric row, so keep its own gate.
                        if let metrics = loggedInUserMetrics {
                            MemberMetricsCard(metric: metrics, hero: .active_days)
                        }

                        // History and Streak (always the logged-in user for standard and logger)
                        MemberHistoryCard(selectedMember: loggedInMember)
                        MemberStreakCard(selectedMember: loggedInMember)

                        if isLogger {
                            // Logger: View as bar right above only the two log cards
                            loggerViewAsSelector
                            MemberRecentCard(selectedMember: loggerViewAsMember ?? loggedInMember)
                            MemberHealthCard(selectedMember: loggerViewAsMember ?? loggedInMember)
                        } else {
                            // Standard: same two cards for self
                            MemberRecentCard(selectedMember: loggedInMember)
                            MemberHealthCard(selectedMember: loggedInMember)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
                .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
                .frame(maxWidth: .infinity)
            }
            .adaptiveBackground(topLeading: true)
            .navigationBarBackButtonHidden(true)
        }
        .task {
            await loadUserData()
        }
        .onChange(of: programContext.programId) { _, _ in
            Task {
                await loadUserData()
            }
        }
        .onChange(of: programContext.members.count) { _, _ in
            if isLogger {
                applyDefaultLoggerSelectionIfNeeded()
            }
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

    private func applyDefaultLoggerSelectionIfNeeded() {
        guard isLogger else { return }
        guard loggerViewAsMember == nil else { return }
        guard let userId = programContext.loggedInUserId else { return }
        guard programContext.membersProgramId == programContext.programId else { return }
        guard let member = programContext.members.first(where: { $0.id == userId }) else { return }
        loggerViewAsMember = member
    }

    @MainActor
    private func loadLoggerLogsData(memberId: String) async {
        // MemberHealthCard loads its own preview (.task(id:)) — only Recent is tab-level state.
        await programContext.loadMemberRecent(memberId: memberId, limit: 10)
    }

    private func loadUserData() async {
        guard let userId = programContext.loggedInUserId else {
            errorMessage = "Unable to identify logged-in user."
            return
        }

        // Polish #5: the spinner shows only while nothing for this program is on screen (first load / program switch);
        // a tab re-entry keeps the cards and refreshes underneath. Every read runs in parallel.
        let programId = programContext.programId
        isLoading = loadedProgramId != programId
        errorMessage = nil

        let pc = programContext
        let needsLookup = isLogger && (pc.members.isEmpty || pc.membersProgramId != pc.programId)
        // A logger's Recent card follows the View-as member, so it never shows the logger's own rows under another name.
        let recentId = (isLogger ? loggerViewAsMember?.id : nil) ?? userId
        async let overviewLoaded = pc.loadMemberOverview(memberId: userId)      // alongside the group below
        await withDiscardingTaskGroup { group in
            if needsLookup { group.addTask { await pc.loadLookupData() } }
            group.addTask { await pc.loadMemberHistory(memberId: userId, period: "week") }
            group.addTask { await pc.loadMemberStreaks(memberId: userId) }
            group.addTask { await pc.loadMemberRecent(memberId: recentId, limit: 10) }
        }
        let selfOverviewLoaded = await overviewLoaded
        // A cancelled load never marks this program as loaded (#10): the next visit spins instead of showing old numbers.
        guard !Task.isCancelled else { return }

        // The self metric row IS the overview row (same memberId-scoped /member-metrics DTO) — no all-member download
        // (member-analytics D-C9). MemberHealthCard loads its own preview, so no tab-level health read either.
        loggedInUserMetrics = pc.selectedMemberOverview?.member_id == userId ? pc.selectedMemberOverview : nil
        // Only a self overview that really loaded marks this program loaded (Android parity): after a failed load the
        // next visit spins again rather than refreshing under the previous program's numbers (#10).
        if selfOverviewLoaded { loadedProgramId = programId }
        isLoading = false

        if isLogger, loggerViewAsMember == nil, let member = loggedInMember {
            loggerViewAsMember = member
        }
    }
}
