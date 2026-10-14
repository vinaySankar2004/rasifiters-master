import SwiftUI

// MARK: - Standard Workout Types Tab (for non-admin users)
//
// Tab 3 "Lifestyle", non-admin (logger/member) variant — own data only, no view-as picker.
// Ported verbatim from the legacy `Features/Home/Tabs/StandardWorkoutTypesTab.swift` (run 56).
// Polish #31: the Summary recipe — its own keyed LoadState (ProgramContext.loadLifestyle, seven reads in parallel),
// the kit error view + Retry, the stale banner, pull-to-refresh, a reload on reconnect and on every visit; a part
// that failed shows "—", never a fake 0 / "N/A" / "No data". `LifestyleCardsSection` (below) is shared with
// AdminWorkoutTypesTab.

struct StandardWorkoutTypesTab: View {
    @EnvironmentObject var programContext: ProgramContext
    /// This tab's own data for (program, me) — frontend-kit §5.
    @State private var loadState: LoadState<LifestyleSnapshot> = .idle

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
                                GlassButton(icon: "dumbbell", label: "Workout types")
                            }
                        }

                        LoadStateContent(state: loadState, onRetry: { Task { await load() } }) { snapshot in
                            LifestyleCardsSection(snapshot: snapshot)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 24)
                    .padding(.bottom, 24)
                    .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
                    .frame(maxWidth: .infinity)
                }
                .refreshable { await load() }
            }
            .loadStateChrome(loadState, onRetry: { Task { await load() } })
            .navigationBarBackButtonHidden(true)
        }
        // Polish #10 (keyed state): another program's numbers never render — the spinner shows in the same event.
        .onChange(of: programContext.programId) { _, _ in loadState = .loading }
        // Every visit reloads (a re-entry keeps the cards and refreshes underneath — polish #5); a program switch
        // restarts it for the new program.
        .task(id: programContext.programId) { await load() }
    }

    private func load() async {
        guard let userId = programContext.loggedInUserId, let pid = programContext.programId else { return }
        // #10: another program's numbers never carry over — a new key starts from the spinner.
        if loadState.value?.key != LifestyleKey(programId: pid, memberId: userId) { loadState = .idle }
        loadState = loadState.refreshing()
        guard let result = await programContext.loadLifestyle(memberId: userId) else { return }   // superseded
        loadState = loadState.merging(result)
    }
}

/// The Lifestyle tab's cards for one loaded snapshot (polish #31) — shared by the admin and standard tabs. A part that
/// failed to load shows "—" (never a fake 0 / "N/A" / "No data"); a part that loaded empty keeps the card's own text.
/// The timeline drill-downs open for the snapshot's own member (the label the cards are under).
struct LifestyleCardsSection: View {
    let snapshot: LifestyleSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(spacing: 14) {
                HStack(spacing: 14) {
                    WorkoutTypesTotalCard(total: snapshot.total)
                        .frame(maxWidth: .infinity)
                    WorkoutTypeMostPopularCard(
                        name: snapshot.mostPopular?.workout_name,
                        sessions: snapshot.mostPopular?.sessions ?? 0,
                        isUnavailable: snapshot.mostPopular == nil
                    )
                    .frame(maxWidth: .infinity)
                }
                HStack(spacing: 14) {
                    WorkoutTypeLongestDurationCard(
                        name: snapshot.longestDuration?.workout_name,
                        avgMinutes: snapshot.longestDuration?.avg_minutes ?? 0,
                        isUnavailable: snapshot.longestDuration == nil
                    )
                    .frame(maxWidth: .infinity)
                    WorkoutTypeHighestParticipationCard(
                        name: snapshot.highestParticipation?.workout_name,
                        participationPct: snapshot.highestParticipation?.participation_pct ?? 0,
                        isUnavailable: snapshot.highestParticipation == nil
                    )
                    .frame(maxWidth: .infinity)
                }
            }

            StepsStatsCard(stats: snapshot.steps)          // nil already reads "—"

            if let types = snapshot.types {
                WorkoutTypePopularityCard(types: types)
            } else {
                PlaceholderCard(title: "Workout Type Popularity", isUnavailable: true)
            }

            if let timeline = snapshot.timeline {
                NavigationLink {
                    LifestyleTimelineDetailView(initialPeriod: .week, memberId: snapshot.key.memberId)
                } label: {
                    LifestyleTimelineCardSummary(points: timeline)
                }
                NavigationLink {
                    StepsTimelineDetailView(initialPeriod: .week, memberId: snapshot.key.memberId)
                } label: {
                    StepsTimelineCardSummary(points: timeline)
                }
            } else {
                PlaceholderCard(title: "Lifestyle Timeline", isUnavailable: true)
                PlaceholderCard(title: "Steps Timeline", isUnavailable: true)
            }
        }
    }
}
