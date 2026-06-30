import SwiftUI
import UniformTypeIdentifiers

// MARK: - Summary
// Faithful 1:1 port of the legacy iOS Summary tab (ios-mobile Features/Home/Tabs/AdminSummaryTab.swift)
// + two web-parity reconciles vs the built web /summary surface:
//   • a visible error banner (legacy captured `errorMessage` but rendered it nowhere)
//   • the `admin_only_data_entry` data-lock treatment (lock banner + disabled log cards) — absent from legacy iOS.
// The five NavigationLink detail targets remain deferred ScaffoldPlaceholder stubs.

struct AdminSummaryTab: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.colorScheme) private var colorScheme
    @Binding var period: AdminHomeView.Period
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var cardOrder: [SummaryCardType] = SummaryCardType.defaultOrder
    @State private var draggingCard: SummaryCardType?
    @State private var timelinePeriod: AdminHomeView.Period = .week
    private let rowSpacing: CGFloat = 12

    /// Web parity (`DATA_LOCK_MESSAGE`, lib/permissions.ts).
    private let dataLockMessage =
        "Admin-only data entry is on for this program. Only program admins can add, edit, or delete data."

    var body: some View {
        ZStack(alignment: .top) {
            Color.appBackground
                .ignoresSafeArea()

            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    SummaryHeader(
                        title: "Summary",
                        subtitle: programContext.name,
                        status: programContext.status,
                        initials: programContext.adminInitials
                    )

                    if let errorMessage {
                        errorBanner(errorMessage)
                    }

                    if programContext.dataEntryLocked {
                        dataLockBanner
                    }

                    VStack(spacing: rowSpacing) {
                        ForEach(Array(laidOutRows().enumerated()), id: \.offset) { _, row in
                            HStack(spacing: 14) {
                                ForEach(row, id: \.self) { card in
                                    cardView(for: card)
                                        .frame(maxWidth: .infinity)
                                        .onDrag {
                                            draggingCard = card
                                            return NSItemProvider(object: card.rawValue as NSString)
                                        }
                                        .onDrop(
                                            of: [UTType.text],
                                            delegate: CardDropDelegate(
                                                item: card,
                                                items: $cardOrder,
                                                dragging: $draggingCard,
                                                onReorder: persistOrder
                                            )
                                        )
                                }
                                if row.count == 1 && !(row.first?.requiresFullWidth ?? false) {
                                    Color.clear.frame(maxWidth: .infinity)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 24)
            }
        }
        .task {
            await load()
            restoreOrder()
        }
        .onChange(of: period) { _, _ in
            Task { await load() }
        }
        .onChange(of: programContext.programId) { _, _ in
            restoreOrder()
            Task { await programContext.loadLookupData() }
        }
    }

    // MARK: - Web-parity banners

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.appRed)
            Text(message)
                .font(.footnote.weight(.semibold))
                .foregroundColor(.appRed)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.appRed.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.appRed.opacity(0.3), lineWidth: 1)
        )
    }

    private var dataLockBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "lock.fill")
                .foregroundColor(Color(.secondaryLabel))
            Text(dataLockMessage)
                .font(.footnote.weight(.semibold))
                .foregroundColor(Color(.secondaryLabel))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.appBackgroundSecondary)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1)
        )
    }

    private func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        await programContext.loadAnalytics(period: period.apiValue)
        await programContext.loadMTDParticipation()
        await programContext.loadTotalWorkoutsMTD()
        await programContext.loadTotalDurationMTD()
        await programContext.loadAvgDurationMTD()
        await programContext.loadActivityTimeline(period: timelinePeriod.apiValue)
        await programContext.loadDistributionByDay()
        await programContext.loadWorkoutTypes()
        errorMessage = programContext.errorMessage
        isLoading = false
    }

    /// Arrange cards into rows honoring full-width cards and packing half-width cards two per row.
    private func laidOutRows() -> [[SummaryCardType]] {
        var rows: [[SummaryCardType]] = []
        var currentRow: [SummaryCardType] = []

        for card in cardOrder {
            if card.requiresFullWidth {
                if !currentRow.isEmpty {
                    rows.append(currentRow)
                    currentRow.removeAll()
                }
                rows.append([card])
            } else {
                currentRow.append(card)
                if currentRow.count == 2 {
                    rows.append(currentRow)
                    currentRow.removeAll()
                }
            }
        }

        if !currentRow.isEmpty {
            rows.append(currentRow)
        }

        return rows
    }

    @ViewBuilder
    private func cardView(for card: SummaryCardType) -> some View {
        switch card {
        case .addWorkout:
            if programContext.dataEntryLocked {
                AddWorkoutCard()
                    .frame(maxWidth: .infinity)
                    .opacity(0.5)
            } else {
                NavigationLink {
                    AddWorkoutDetailView()
                } label: {
                    AddWorkoutCard()
                        .frame(maxWidth: .infinity)
                }
            }
        case .addDailyHealth:
            if programContext.dataEntryLocked {
                AddDailyHealthCard()
                    .frame(maxWidth: .infinity)
                    .opacity(0.5)
            } else {
                NavigationLink {
                    AddDailyHealthDetailView()
                } label: {
                    AddDailyHealthCard()
                        .frame(maxWidth: .infinity)
                }
            }
        case .programProgress:
            ProgramProgressCard(
                progress: programContext.completionPercent,
                elapsedDays: programContext.elapsedDays,
                totalDays: programContext.totalDays,
                remainingDays: programContext.remainingDays,
                status: programContext.status
            )
            .frame(maxWidth: .infinity)
        case .mtdParticipation:
            if let mtd = programContext.mtdParticipation {
                MTDParticipationCard(
                    active: mtd.active_members,
                    total: mtd.total_members,
                    pct: mtd.participation_pct,
                    change: mtd.change_pct
                )
            } else {
                PlaceholderCard(title: "MTD Participation")
            }
        case .totalWorkouts:
            TotalWorkoutsCard(
                total: programContext.totalWorkoutsMTD,
                change: programContext.totalWorkoutsChangePct
            )
        case .totalDuration:
            TotalDurationCard(
                hours: programContext.totalDurationHoursMTD,
                change: programContext.totalDurationChangePct
            )
        case .avgDuration:
            AvgDurationCard(
                minutes: programContext.avgDurationMinutesMTD,
                change: programContext.avgDurationChangePctMTD
            )
        case .activityTimeline:
            NavigationLink {
                ActivityTimelineDetailView(initialPeriod: timelinePeriod)
            } label: {
                ActivityTimelineCardSummary(
                    points: programContext.activityTimeline
                )
            }
        case .distributionByDay:
            NavigationLink {
                DistributionByDayDetailView(
                    points: distributionPoints(fromCounts: programContext.distributionByDayCounts)
                )
            } label: {
                DistributionByDayCard(
                    points: distributionPoints(fromCounts: programContext.distributionByDayCounts),
                    interactive: false
                )
            }
        case .workoutTypes:
            NavigationLink {
                WorkoutTypesDetailView(
                    types: programContext.workoutTypes
                )
            } label: {
                WorkoutTypesSummaryCard(
                    types: programContext.workoutTypes
                )
            }
        }
    }

    private func persistOrder() {
        let key = "summary.card.order.\(programContext.programId ?? "default")"
        let raw = cardOrder.map { $0.rawValue }
        UserDefaults.standard.set(raw, forKey: key)
    }

    private func restoreOrder() {
        let key = "summary.card.order.\(programContext.programId ?? "default")"
        if let saved = UserDefaults.standard.stringArray(forKey: key) {
            let savedTypes = saved.compactMap { SummaryCardType(rawValue: $0) }
            let missing = SummaryCardType.defaultOrder.filter { !savedTypes.contains($0) }
            var merged = savedTypes + missing
            if let dailyIndex = merged.firstIndex(of: .addDailyHealth),
               let workoutIndex = merged.firstIndex(of: .addWorkout),
               dailyIndex != workoutIndex + 1 {
                let item = merged.remove(at: dailyIndex)
                let insertIndex = min(workoutIndex + 1, merged.count)
                merged.insert(item, at: insertIndex)
            }
            cardOrder = merged
        } else {
            cardOrder = SummaryCardType.defaultOrder
        }
    }
}
