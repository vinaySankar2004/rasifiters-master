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
// branch now reads ProgramContext directly. Two call sites: AdminSummaryTab (program-wide) + the Members
// MemberHistoryCard (memberId-scoped, showActiveSeries:false — the web /members/history analogue).
// Chart colors tokenized (D-C3): .orange → appOrangeStrong, .purple → appPurple.

struct ActivityTimelineDetailView: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var period: AdminHomeView.Period
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var selectedLabel: String?
    @State private var dailyHeight: CGFloat = 0
    private let showActiveSeries: Bool
    private let memberId: String?

    init(
        initialPeriod: AdminHomeView.Period,
        memberId: String? = nil,
        showActiveSeries: Bool = true
    ) {
        _period = State(initialValue: initialPeriod)
        self.memberId = memberId
        self.showActiveSeries = showActiveSeries
    }

    private var points: [APIClient.ActivityTimelinePoint] {
        if memberId != nil {
            return memberTimelinePoints(from: programContext.memberHistory)
        }
        return programContext.activityTimeline
    }

    private var dailyAverage: Double {
        if memberId != nil {
            return programContext.memberHistoryDailyAverage
        }
        return programContext.activityTimelineDailyAverage
    }

    private var axisStartDate: Date {
        if memberId != nil {
            return programContext.memberHistoryStartDate
        }
        return programContext.startDate
    }

    private var axisEndDate: Date {
        if memberId != nil {
            return programContext.memberHistoryEndDate
        }
        return programContext.endDate
    }

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
                    Text(p.label).tag(p)
                }
            }
            .pickerStyle(.segmented)

            if selectedLabel == nil {
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

            if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 240, alignment: .center)
            } else if points.isEmpty {
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
                let barWidth: CGFloat = 12
                ScrollableBarChart(barCount: points.count, minBarWidth: barWidth) {
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
                                .position(
                                    x: clamp(anchorX, min: geo.size.width * 0.15, max: geo.size.width * 0.85),
                                    y: max(geo[plotFrame].minY + 12, anchorY - 44)
                                )
                            }
                        }
                    }
                }
                .frame(height: 280)
            }

            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .task(id: period) {
            await load(period: period)
        }
        .onDisappear {
            Task {
                if let memberId {
                    await programContext.loadMemberHistory(memberId: memberId, period: "week")
                    return
                }
                await load(period: .week)
            }
        }
    }

    private func load(period: AdminHomeView.Period) async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil

        // Clear global error before calling to prevent stale errors from showing
        programContext.errorMessage = nil

        if let memberId {
            await programContext.loadMemberHistory(memberId: memberId, period: period.apiValue)
        } else {
            await programContext.loadActivityTimeline(period: period.apiValue)
        }

        // Only set error if the timeline call specifically failed
        if programContext.activityTimeline.isEmpty && programContext.errorMessage != nil {
            errorMessage = programContext.errorMessage
        }

        isLoading = false
    }
}
