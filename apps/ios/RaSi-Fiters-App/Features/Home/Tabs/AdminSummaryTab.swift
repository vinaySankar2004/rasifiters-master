import SwiftUI
import UniformTypeIdentifiers

// MARK: - Summary
// Faithful 1:1 port of the legacy iOS Summary tab (ios-mobile Features/Home/Tabs/AdminSummaryTab.swift)
// + two web-parity reconciles vs the built web /summary surface:
//   • a visible load error — since reliability Phase 3 the frontend kit (ErrorStateView / stale banner, LoadState)
//   • the `admin_only_data_entry` data-lock treatment (lock banner + disabled log cards) — absent from legacy iOS.
// The five NavigationLink detail targets live in Features/Home/Detail/ (runs 60–61).

struct AdminSummaryTab: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.colorScheme) private var colorScheme
    @Binding var period: AdminHomeView.Period
    /// The loaded value is the program id whose analytics are on screen (frontend-kit §5; A13: the error view never
    /// sits over another program's or zero values).
    @State private var loadState: LoadState<String> = .idle
    @State private var cardOrder: [SummaryCardType] = SummaryCardType.defaultOrder
    @State private var draggingCard: SummaryCardType?
    @State private var timelinePeriod: AdminHomeView.Period = .week
    private let rowSpacing: CGFloat = 12

    /// Cards that show fetched analytics — hidden while the load failed with nothing to show.
    private static let analyticsCards: Set<SummaryCardType> = [
        .mtdParticipation, .totalWorkouts, .totalDuration, .avgDuration, .activityTimeline, .distributionByDay, .workoutTypes
    ]

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

                    if case .failed(let error) = loadState {
                        ErrorStateView(error: error, onRetry: { Task { await load() } })
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
                .padding(.bottom, isBannerShowing ? 88 : 24)        // A6: the stale banner never covers the last card
                .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
                .frame(maxWidth: .infinity)
            }
            .refreshable {
                // A13: reload now, sync in the background; a sync that lands workouts bumps summaryRefreshToken →
                // the .task(id:) below reloads again.
                HealthSyncEngine.shared.trigger(.pullToRefresh)
                await load()
            }
        }
        .floatingBanner { ScreenBanner(banner: staleBanner) }
        .onAppear { restoreOrder() }
        .task(id: SummaryLoadKey(programId: programContext.programId, period: period.apiValue,
                                 timelinePeriod: timelinePeriod.apiValue, refresh: programContext.summaryRefreshToken)) {
            await load()          // a newer key cancels the running load (W7 F5 — replaces `guard !isLoading`)
        }
        .onChange(of: programContext.programId) { _, _ in
            restoreOrder()
            Task { await programContext.loadLookupData() }
        }
        .onChange(of: programContext.isOnline) { _, online in
            if online, loadState.error != nil { Task { await load() } }       // D-IOS-KIT-3: refetch on reconnect
        }
    }

    // MARK: - Banners

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

    private var staleBanner: FloatingBanner? {
        guard case .stale = loadState else { return nil }
        return FloatingBanner(variant: .stale, onRetry: { Task { await load() } })
    }

    /// This screen's own banner is up (`ScreenBanner` shows it only online; offline space is the root's inset — A6).
    private var isBannerShowing: Bool { programContext.isOnline && staleBanner != nil }

    /// Instant open (D-9): cached Summary first, then the network; the 8 loads run in parallel (ProgramContext.loadSummary).
    private func load() async {
        guard let pid = programContext.programId else { return }
        if loadState.value != pid { loadState = .idle }                   // another program's data never carries over
        if loadState.value == nil,
           let cached = try? await programContext.loadSummary(period: period.apiValue, timelinePeriod: timelinePeriod.apiValue,
                                                               read: .cacheOnly),
           cached.failure == nil {
            loadState = .loaded(pid, fetchedAt: Date(), refreshing: true)
        }
        loadState = loadState.refreshing()
        guard let result = try? await programContext.loadSummary(period: period.apiValue, timelinePeriod: timelinePeriod.apiValue,
                                                                 read: .network) else { return }   // superseded
        guard let failure = result.failure else {
            loadState = .fresh(pid)
            return
        }
        guard let appError = AppError(failure)?.labeled(online: programContext.isOnline) else { return }   // cancelled = superseded; polish-1 rule 6
        // A13: parts that loaded stay on screen as stale data (never the error view over real values).
        loadState = result.applied ? .stale(pid, fetchedAt: Date(), error: appError) : loadState.failing(with: appError)
    }

    /// Arrange cards into rows honoring full-width cards and packing half-width cards two per row.
    private func laidOutRows() -> [[SummaryCardType]] {
        var rows: [[SummaryCardType]] = []
        var currentRow: [SummaryCardType] = []

        var hideAnalytics = false
        if case .failed = loadState { hideAnalytics = true }
        for card in cardOrder where !(hideAnalytics && Self.analyticsCards.contains(card)) {
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
                    AddWorkoutsDetailView()
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
            // Keep the action cards grouped in order: addWorkout → addDailyHealth.
            func reposition(_ card: SummaryCardType, after anchor: SummaryCardType) {
                guard let anchorIndex = merged.firstIndex(of: anchor),
                      let cardIndex = merged.firstIndex(of: card) else { return }
                if cardIndex != anchorIndex + 1 {
                    let item = merged.remove(at: cardIndex)
                    let newAnchorIndex = merged.firstIndex(of: anchor) ?? anchorIndex
                    merged.insert(item, at: min(newAnchorIndex + 1, merged.count))
                }
            }
            reposition(.addDailyHealth, after: .addWorkout)
            cardOrder = merged
        } else {
            cardOrder = SummaryCardType.defaultOrder
        }
    }
}

private struct SummaryLoadKey: Equatable {
    let programId: String?
    let period: String
    let timelinePeriod: String
    let refresh: Int
}
