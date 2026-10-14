import SwiftUI
import Charts

// Faithful 1:1 port of the legacy iOS ActivityTimelineDetailView
// (ios-mobile Features/Home/Helpers/AdminHomeHelpers.swift:878-1131) — the expanded, interactive
// "Workout Activity Timeline" drill-down. Native Swift Charts with a period selector, tap-callout,
// and a program-wide OR member-scoped data source (D-REF: kept iOS-native, run-52/53 platform idiom).
//
// D-C2 (run 61): the legacy init carried 6 provider params (pointsProvider / dailyAverageProvider /
// loadHandler / title / startDateProvider / endDateProvider) that NO rebuilt call site passes — trimmed
// to the 3 used params (initialPeriod / memberId / showActiveSeries). The program-wide vs member-scoped
// branch loads into the screen's own LoadState (polish #29 / #34). Two call sites: AdminSummaryTab (program-wide) + the Members
// MemberHistoryCard (memberId-scoped, showActiveSeries:false — the web /members/history analogue).
// Chart colors tokenized (D-C3): .orange → appOrangeStrong, .purple → appPurple.

struct ActivityTimelineDetailView: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var period: AdminHomeView.Period
    /// Polish #29 / #34: this screen's own data (frontend-kit §5) — never ProgramContext's shared timeline / member
    /// history, so the Summary and Members cards behind it keep their own week, and W→M→Y taps can't mix periods.
    @State private var state: LoadState<TimelineData> = .idle
    @State private var selectedLabel: String?
    @State private var dailyHeight: CGFloat = 0
    private let showActiveSeries: Bool
    private let memberId: String?

    /// One period's chart: the program-wide timeline, or one member's workout history.
    private struct TimelineData {
        let points: [APIClient.ActivityTimelinePoint]
        let dailyAverage: Double
        /// The member history's own range; nil = the program's dates (program-wide).
        let start: Date?
        let end: Date?
    }

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(secondsFromGMT: 0)
        return f
    }()

    init(
        initialPeriod: AdminHomeView.Period,
        memberId: String? = nil,
        showActiveSeries: Bool = true
    ) {
        _period = State(initialValue: initialPeriod)
        self.memberId = memberId
        self.showActiveSeries = showActiveSeries
    }

    private var points: [APIClient.ActivityTimelinePoint] { state.value?.points ?? [] }
    private var dailyAverage: Double { state.value?.dailyAverage ?? 0 }
    private var axisStartDate: Date { state.value?.start ?? programContext.startDate }
    private var axisEndDate: Date { state.value?.end ?? programContext.endDate }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Workout Activity Timeline")
                    .font(.title3.weight(.semibold))
                Text(showActiveSeries ? "Workouts · Active members" : "Workouts")
                    .font(.subheadline)
                    .foregroundColor(Color(.secondaryLabel))
            }

            Picker("Period", selection: $period) {
                ForEach(AdminHomeView.Period.allCases, id: \.self) { p in
                    Text(p.label).accessibilityLabel(p.spokenName).tag(p)
                }
            }
            .pickerStyle(.segmented)

            if selectedLabel == nil, state.value != nil {
                HeaderStats(label: rangeLabel(for: period, startDate: axisStartDate, endDate: axisEndDate), dailyAverage: dailyAverage)
                    .background(
                        GeometryReader { geo in
                            Color.clear
                                .preference(key: HeaderHeightKey.self, value: geo.size.height)
                        }
                    )
                    .onPreferenceChange(HeaderHeightKey.self) { dailyHeight = $0 }
            } else {
                Color.clear.frame(height: dailyHeight)
            }

            LoadStateContent(state: state, onRetry: { Task { await load() } }) { _ in
                if points.isEmpty {
                    Text("No data for this range yet.")
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                        .frame(maxWidth: .infinity, minHeight: 240, alignment: .center)
                } else {
                    let yMax: Double = {
                        if showActiveSeries {
                            return max(Double(points.map { max($0.workouts, $0.active_members) }.max() ?? 1), 1)
                        }
                        return max(Double(points.map { $0.workouts }.max() ?? 1), 1)
                    }()
                    // Month has ~28-31 daily bars — fit them all on screen (no horizontal scroll).
                    let fitToWidth = (period == .month)
                    ScrollableBarChart(barCount: points.count, minBarWidth: 12, fill: fitToWidth) { barWidth in
                        Chart {
                            ForEach(points) { point in
                                BarMark(
                                    x: .value("Label", point.label),
                                    y: .value("Workouts", point.workouts),
                                    width: .fixed(barWidth)
                                )
                                .foregroundStyle(Color.appOrangeStrong)
                                .cornerRadius(8)

                                if showActiveSeries {
                                    LineMark(
                                        x: .value("Label", point.label),
                                        y: .value("Active Members", point.active_members)
                                    )
                                    .lineStyle(.init(lineWidth: 2, lineCap: .round, lineJoin: .round))
                                    .foregroundStyle(Color.appPurple)
                                    .interpolationMethod(.catmullRom)
                                    PointMark(
                                        x: .value("Label", point.label),
                                        y: .value("Active Members", point.active_members)
                                    )
                                    .symbolSize(24)
                                    .foregroundStyle(Color.appPurple)
                                }
                            }

                        }
                        .chartXAxis {
                            let ticks = axisValues(for: period, startDate: axisStartDate, endDate: axisEndDate)
                            if ticks.isEmpty {
                                AxisMarks(values: .automatic(desiredCount: 6)) { value in
                                    AxisGridLine()
                                    AxisValueLabel {
                                        if let s = value.as(String.self) {
                                            Text(shortLabel(for: s, period: period))
                                        }
                                    }
                                }
                            } else {
                                AxisMarks(values: ticks) { value in
                                    AxisGridLine()
                                    AxisValueLabel {
                                        if let s = value.as(String.self) {
                                            Text(shortLabel(for: s, period: period))
                                        }
                                    }
                                }
                            }
                        }
                        .chartYAxis {
                            AxisMarks(position: .leading, values: .automatic(desiredCount: 5))
                        }
                        .chartYScale(domain: 0...(yMax * 1.1))
                        .frame(height: 280)
                        .drawingGroup()
                        .chartOverlay { proxy in
                            GeometryReader { geo in
                                let plotFrame = proxy.plotAreaFrame

                                Rectangle().fill(.clear).contentShape(Rectangle())
                                    .gesture(
                                        DragGesture(minimumDistance: 0)
                                            .onChanged { value in
                                                let x = value.location.x - geo[plotFrame].origin.x
                                                if let label: String = proxy.value(atX: x) {
                                                    selectedLabel = label
                                                }
                                            }
                                            .onEnded { _ in
                                                selectedLabel = nil
                                            }
                                    )

                                if let selectedLabel,
                                   let tapped = points.first(where: { $0.label == selectedLabel }),
                                   let xPos = proxy.position(forX: tapped.label),
                                   let yPos = proxy.position(forY: tapped.workouts) {
                                    let anchorX = geo[plotFrame].origin.x + xPos
                                    let anchorY = geo[plotFrame].origin.y + yPos

                                    CalloutView(
                                        label: calloutTitle(for: tapped, period: period),
                                        workouts: tapped.workouts,
                                        active: showActiveSeries ? tapped.active_members : nil,
                                        showActive: showActiveSeries
                                    )
                                    .chartCalloutPlacement(anchor: CGPoint(x: anchorX, y: anchorY), in: geo.size)
                                }
                            }
                        }
                    }
                    .frame(height: 280)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
        .frame(maxWidth: .infinity)
        .loadStateChrome(state, onRetry: { Task { await load() } })
        .onChange(of: period) { _, _ in state = .loading }      // #34: another period's bars never sit under the new label
        .task(id: period) { await load() }
    }

    /// Polish #29: the kit load step — a Retry keeps the data (stale + banner); a cancelled load changes nothing, and a
    /// load for a period no longer on screen (a Retry / reconnect started before a switch) is dropped (polish #34).
    private func load() async {
        guard let token = programContext.authToken, !token.isEmpty, let pid = programContext.programId else { return }
        let period = self.period
        let memberId = self.memberId
        state = state.refreshing()
        let outcome = await loadOutcome { () async throws -> TimelineData in
            if let memberId {
                let r = try await APIClient.shared.fetchMemberHistory(token: token, programId: pid, memberId: memberId,
                                                                      period: period.apiValue)
                return TimelineData(points: memberTimelinePoints(from: r.buckets), dailyAverage: r.daily_average,
                                    start: Self.dayFormatter.date(from: r.start) ?? Date(),
                                    end: Self.dayFormatter.date(from: r.end) ?? Date())
            }
            let r = try await APIClient.shared.fetchActivityTimeline(token: token, period: period.apiValue, programId: pid)
            return TimelineData(points: r.buckets, dailyAverage: r.daily_average, start: nil, end: nil)
        }
        guard let outcome, period == self.period else { return }
        state = state.applying(outcome)
    }
}
