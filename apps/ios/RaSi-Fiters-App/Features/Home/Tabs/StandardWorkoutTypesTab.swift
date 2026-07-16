import SwiftUI

// MARK: - Standard Workout Types Tab (for non-admin users)
//
// Tab 3 "Lifestyle", non-admin (logger/member) variant — own data only, no view-as picker.
// Ported verbatim from the legacy `Features/Home/Tabs/StandardWorkoutTypesTab.swift` (run 56).

struct StandardWorkoutTypesTab: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var isLoading = false
    @State private var errorMessage: String?

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

        isLoading = true
        errorMessage = nil

        // Load workout type data for the logged-in user
        await programContext.loadWorkoutTypesTotal(memberId: userId)
        await programContext.loadWorkoutTypeMostPopular(memberId: userId)
        await programContext.loadWorkoutTypeLongestDuration(memberId: userId)
        await programContext.loadWorkoutTypeHighestParticipation(memberId: nil)  // Always program-wide
        await programContext.loadWorkoutTypes(memberId: userId)
        await programContext.loadHealthTimeline(period: AdminHomeView.Period.week.apiValue, memberId: userId)
        await programContext.loadStepsStats(memberId: userId)

        errorMessage = programContext.errorMessage
        isLoading = false
    }
}
