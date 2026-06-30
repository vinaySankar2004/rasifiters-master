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
                        // Member Overview card first
                        if programContext.selectedMemberOverview != nil {
                            MemberOverviewCard(member: loggedInMember)
                        }

                        // Logged-in user's MemberMetricsCard second
                        if let metrics = loggedInUserMetrics {
                            MemberMetricsCard(metric: metrics, hero: .workouts)
                        }

                        // History and Streak (always logged-in user for standard and logger)
                        if programContext.selectedMemberOverview != nil {
                            MemberHistoryCard(selectedMember: loggedInMember)
                            MemberStreakCard(selectedMember: loggedInMember)
                        }

                        if isLogger {
                            // Logger: View as bar right above only the two log cards
                            loggerViewAsSelector
                            MemberRecentCard(selectedMember: loggerViewAsMember ?? loggedInMember)
                            MemberHealthCard(selectedMember: loggerViewAsMember ?? loggedInMember)
                        } else {
                            // Standard: same two cards for self
                            if programContext.selectedMemberOverview != nil {
                                MemberRecentCard(selectedMember: loggedInMember)
                                MemberHealthCard(selectedMember: loggedInMember)
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
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
        await programContext.loadMemberRecent(memberId: memberId, limit: 10)
        await programContext.loadMemberHealthLogs(memberId: memberId, limit: 10)
    }

    private func loadUserData() async {
        guard let userId = programContext.loggedInUserId else {
            errorMessage = "Unable to identify logged-in user."
            return
        }

        isLoading = true
        errorMessage = nil

        if isLogger, programContext.members.isEmpty || programContext.membersProgramId != programContext.programId {
            await programContext.loadLookupData()
        }

        // Load member metrics for the logged-in user
        await programContext.loadMemberMetrics(
            search: "",
            sort: "workouts",
            direction: "desc",
            filters: [:],
            dateRange: (nil, nil)
        )

        // Find the logged-in user's metrics from the loaded data
        loggedInUserMetrics = programContext.memberMetrics.first { $0.member_id == userId }

        // Load detailed data for the logged-in user
        await programContext.loadMemberOverview(memberId: userId)
        await programContext.loadMemberHistory(memberId: userId, period: "week")
        await programContext.loadMemberStreaks(memberId: userId)
        await programContext.loadMemberRecent(memberId: userId, limit: 10)
        await programContext.loadMemberHealthLogs(memberId: userId, limit: 10)

        isLoading = false

        if isLogger, loggerViewAsMember == nil, let member = loggedInMember {
            loggerViewAsMember = member
        }
    }
}
