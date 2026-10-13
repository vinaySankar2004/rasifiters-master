import SwiftUI

// MARK: - Standard Workout Types Tab (for non-admin users)
//
// Tab 3 "Lifestyle", non-admin (logger/member) variant — own data only, no view-as picker.
// Ported verbatim from the legacy `Features/Home/Tabs/StandardWorkoutTypesTab.swift` (run 56).

struct StandardWorkoutTypesTab: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var loadedProgramId: String?

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                Color.appBackground
                    .ignoresSafeArea()

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        // Header with View Workouts button
                            HStack(alignment: .center, spacing: 14) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Lifestyle")
                                    .font(.largeTitle.weight(.bold))
                                    .foregroundColor(Color(.label))
                                Text(programContext.name)
                                    .font(.headline.weight(.semibold))
                                    .foregroundColor(Color(.secondaryLabel))
                            }

                            Spacer()

                            // View Workouts button
                            NavigationLink {
                                ViewWorkoutTypesListView()
                            } label: {
                                GlassButton(icon: "dumbbell")
                            }
                        }

                        if isLoading {
                            HStack {
                                Spacer()
                                ProgressView()
                                Spacer()
                            }
                            .padding()
                        } else {
                            // Workout type cards (same layout as admin view)
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
                                    memberId: programContext.loggedInUserId
                                )
                            } label: {
                                LifestyleTimelineCardSummary(points: programContext.healthTimeline)
                            }

                            NavigationLink {
                                StepsTimelineDetailView(
                                    initialPeriod: .week,
                                    memberId: programContext.loggedInUserId
                                )
                            } label: {
                                StepsTimelineCardSummary(points: programContext.healthTimeline)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 24)
                    .padding(.bottom, 24)
                    .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
                    .frame(maxWidth: .infinity)
                }
            }
            .navigationBarBackButtonHidden(true)
        }
        .task {
            await loadUserWorkoutTypes()
        }
        .onChange(of: programContext.programId) { _, _ in
            Task {
                await loadUserWorkoutTypes()
            }
        }
    }

    private func loadUserWorkoutTypes() async {
        guard let userId = programContext.loggedInUserId else {
            errorMessage = "Unable to identify logged-in user."
            return
        }

        // Polish #5: spinner only while nothing for this program is on screen; the seven reads run in parallel.
        let programId = programContext.programId
        isLoading = loadedProgramId != programId
        errorMessage = nil

        let pc = programContext
        let week = AdminHomeView.Period.week.apiValue
        await withDiscardingTaskGroup { group in
            group.addTask { await pc.loadWorkoutTypesTotal(memberId: userId) }
            group.addTask { await pc.loadWorkoutTypeMostPopular(memberId: userId) }
            group.addTask { await pc.loadWorkoutTypeLongestDuration(memberId: userId) }
            group.addTask { await pc.loadWorkoutTypeHighestParticipation(memberId: nil) }  // Always program-wide
            group.addTask { await pc.loadWorkoutTypes(memberId: userId) }
            group.addTask { await pc.loadHealthTimeline(period: week, memberId: userId) }
            group.addTask { await pc.loadStepsStats(memberId: userId) }
        }
        // A cancelled load never marks this program as loaded (#10): the next visit spins instead of showing old numbers.
        guard !Task.isCancelled else { return }

        errorMessage = pc.errorMessage
        loadedProgramId = programId
        isLoading = false
    }
}
