import SwiftUI

// MARK: - Admin Workout Types Tab (program / global admin)
//
// Tab 3 "Lifestyle", program-admin variant — adds the role-gated "view as" picker above the
// cards. Ported verbatim from the legacy `Features/Home/Tabs/StandardWorkoutTypesTab.swift`
// (which co-located both tab structs) on the Lifestyle-tab port (run 56).

struct AdminWorkoutTypesTab: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showMemberPicker = false
    @State private var selectedMember: APIClient.MemberDTO?
    @State private var hasUserChosenViewAs = false
    @State private var reloadQueued = false
    private var canViewAs: Bool { programContext.isProgramAdmin }

    private var viewAsLabel: String {
        if let selectedMember {
            return selectedMember.member_name
        }
        if programContext.isGlobalAdmin {
            return "Admin"
        }
        if hasUserChosenViewAs {
            return "Admin"
        }
        return programContext.loggedInUserName ?? "Member"
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color.appBackground
                .ignoresSafeArea()

            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    WorkoutTypesHeader(
                        title: "Lifestyle",
                        subtitle: programContext.name
                    )

                    if canViewAs {
                        viewAsSelector
                    }

                    VStack(spacing: 14) {
                        HStack(spacing: 14) {
                            WorkoutTypesTotalCard(total: programContext.workoutTypesTotal)
                                .frame(maxWidth: .infinity)
                            WorkoutTypeMostPopularCard(
                                name: programContext.workoutTypeMostPopular?.workout_name,
                                sessions: programContext.workoutTypeMostPopular?.sessions ?? 0
                            )
                            .frame(maxWidth: .infinity)
                        }
                        HStack(spacing: 14) {
                            WorkoutTypeLongestDurationCard(
                                name: programContext.workoutTypeLongestDuration?.workout_name,
                                avgMinutes: programContext.workoutTypeLongestDuration?.avg_minutes ?? 0
                            )
                            .frame(maxWidth: .infinity)
                            WorkoutTypeHighestParticipationCard(
                                name: programContext.workoutTypeHighestParticipation?.workout_name,
                                participationPct: programContext.workoutTypeHighestParticipation?.participation_pct ?? 0
                            )
                            .frame(maxWidth: .infinity)
                        }
                    }

                    StepsStatsCard(stats: programContext.stepsStats)

                    WorkoutTypePopularityCard(types: programContext.workoutTypes)

                    NavigationLink {
                        LifestyleTimelineDetailView(
                            initialPeriod: .week,
                            memberId: selectedMember?.id
                        )
                    } label: {
                        LifestyleTimelineCardSummary(points: programContext.healthTimeline)
                    }

                    NavigationLink {
                        StepsTimelineDetailView(
                            initialPeriod: .week,
                            memberId: selectedMember?.id
                        )
                    } label: {
                        StepsTimelineCardSummary(points: programContext.healthTimeline)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 24)
                .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
                .frame(maxWidth: .infinity)
            }
        }
        .task {
            await programContext.loadLookupData()
            applyDefaultSelectionIfNeeded()
            if selectedMember == nil {
                await load()
            }
        }
        .onChange(of: programContext.programId) { _, _ in
            Task {
                if !programContext.isGlobalAdmin {
                    selectedMember = nil
                    hasUserChosenViewAs = false
                }
                await programContext.loadLookupData()
                applyDefaultSelectionIfNeeded()
                if selectedMember == nil {
                    await load()
                }
            }
        }
        .onChange(of: selectedMember?.id) { _, _ in
            Task { await load() }
        }
        .onChange(of: programContext.members.count) { _, _ in
            applyDefaultSelectionIfNeeded()
        }
        .onChange(of: programContext.loggedInUserId) { _, _ in
            if !programContext.isGlobalAdmin {
                selectedMember = nil
                hasUserChosenViewAs = false
            }
            applyDefaultSelectionIfNeeded()
        }
    }

    private func load() async {
        // Polish #5: the seven reads run in parallel. A View-as change during a load is queued, not dropped — the loop
        // re-reads the selection until it settles, so the cards always end on the member the label shows.
        guard !isLoading else {
            reloadQueued = true
            return
        }
        isLoading = true
        errorMessage = nil
        let pc = programContext
        let week = AdminHomeView.Period.week.apiValue
        repeat {
            reloadQueued = false
            let memberId = selectedMember?.id
            await withDiscardingTaskGroup { group in
                group.addTask { await pc.loadWorkoutTypesTotal(memberId: memberId) }
                group.addTask { await pc.loadWorkoutTypeMostPopular(memberId: memberId) }
                group.addTask { await pc.loadWorkoutTypeLongestDuration(memberId: memberId) }
                group.addTask { await pc.loadWorkoutTypeHighestParticipation(memberId: nil) }  // Always program-wide
                group.addTask { await pc.loadWorkoutTypes(memberId: memberId) }
                group.addTask { await pc.loadHealthTimeline(period: week, memberId: memberId) }
                group.addTask { await pc.loadStepsStats(memberId: memberId) }
            }
        } while reloadQueued && !Task.isCancelled
        errorMessage = pc.errorMessage
        isLoading = false
        // This load's task was cancelled (the tab's .task on disappear) with a View-as change still queued: run it on
        // its own, so the change isn't lost.
        if Task.isCancelled && reloadQueued {
            Task { await load() }
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
                showNoneOption: true,
                noneLabel: programContext.isGlobalAdmin ? "None" : "Admin",
                onSelect: { member in
                    hasUserChosenViewAs = true
                    selectedMember = member
                    showMemberPicker = false
                }
            )
        }
    }

    private func applyDefaultSelectionIfNeeded() {
        guard !programContext.isGlobalAdmin else { return }
        guard !hasUserChosenViewAs else { return }
        guard selectedMember == nil else { return }
        guard let userId = programContext.loggedInUserId else { return }
        guard programContext.membersProgramId == programContext.programId else { return }
        guard let member = programContext.members.first(where: { $0.id == userId }) else { return }
        selectedMember = member
    }
}
