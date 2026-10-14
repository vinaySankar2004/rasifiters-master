import SwiftUI
import Charts

// Faithful 1:1 port of the legacy iOS LifestyleTimelineDetailView
// (ios-mobile Features/Home/Helpers/AdminHomeHelpers.swift:1133-1332) — the expanded, interactive
// "Lifestyle Timeline" drill-down: sleep-hours bars + diet-quality line over time, with a period
// selector, daily-average header, and a native tap-callout. Always member-scoped (the Lifestyle-tab
// card passes the viewer's own id, or the admin-selected member's id). Read-only analytics.
//
// D-REF (run 64): kept iOS-native — richer than web /lifestyle/timeline (native callout, scroll, period
// selector); web parity holds at the data/destination level (run-52/53/61 platform-idiom exception).
// D-C1: dual Y-axis (web run-32 D-C2 analogue) — legacy shared ONE axis (yMax over both series), so the
//   diet 1-5 line sat flattened under the sleep-hours bars. Here the diet series is scaled onto its own
//   0-5 axis (scaledFood = food/5 * sleepDomainMax): sleep on the leading axis, diet on a trailing 0-5 axis.
// D-C2: superseded by the kit error view + Retry (polish #29).
// D-C3: axis unit labels ("hrs" leading / "/ 5" trailing), meaningful now the scales are split.
// D-C4: chart Legend (Sleep / Diet) via chartForegroundStyleScale.
// D-DEPS: HealthHeaderStats + HealthCalloutView ported into ChartDetailComponents.swift; every other helper
//   (HeaderHeightKey / clamp / axisValues / shortLabel / calloutTitle / rangeLabel), ScrollableBarChart, and
//   the API method/DTO/loader reused-not-redefined (run 50/54/61). Legacy already tokenized colors → no tokenize.

struct LifestyleTimelineDetailView: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var period: AdminHomeView.Period
    /// Polish #29 / #34: this screen's own data — never ProgramContext's shared health timeline.
    @State private var state: LoadState<APIClient.HealthTimelineResponse> = .idle
    @State private var selectedLabel: String?
    @State private var dailyHeight: CGFloat = 0
    private let memberId: String?

    init(initialPeriod: AdminHomeView.Period, memberId: String? = nil) {
        _period = State(initialValue: initialPeriod)
        self.memberId = memberId
    }

    private var points: [APIClient.HealthTimelinePoint] { state.value?.buckets ?? [] }
    private var dailyAverageSleep: Double { state.value?.daily_average_sleep ?? 0 }
    private var dailyAverageFood: Double { state.value?.daily_average_food ?? 0 }

    private var axisStartDate: Date {
        programContext.startDate
    }

    private var axisEndDate: Date {
        programContext.endDate
    }

    // D-C1: the sleep-hours axis domain. The diet 1-5 series is scaled onto this range so it is not
    // flattened under the sleep bars; a trailing 0-5 axis relabels it back to the diet scale.
    private var sleepDomainMax: Double {
        max(Double(points.map { $0.sleep_hours }.max() ?? 1), 1) * 1.1
    }

    private func scaledFood(_ food: Double) -> Double {
        sleepDomainMax > 0 ? food / 5.0 * sleepDomainMax : 0
    }

    private var dietAxisTicks: [Double] {
        [0, 1, 2, 3, 4, 5].map { scaledFood(Double($0)) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Lifestyle Timeline")
                    .font(.title3.weight(.semibold))
                Text("Sleep · Diet quality")
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
                HealthHeaderStats(
                    label: rangeLabel(for: period, startDate: axisStartDate, endDate: axisEndDate),
                    sleepAverage: dailyAverageSleep,
                    foodAverage: dailyAverageFood
                )
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
                    // Month has ~28-31 daily bars — fit them all on screen (no horizontal scroll).
                    let fitToWidth = (period == .month)
                    ScrollableBarChart(barCount: points.count, minBarWidth: 12, fill: fitToWidth) { barWidth in
                        Chart {
                            ForEach(points) { point in
                                BarMark(
                                    x: .value("Label", point.label),
                                    y: .value("Sleep Hours", point.sleep_hours),
                                    width: .fixed(barWidth)
                                )
                                .foregroundStyle(by: .value("Series", "Sleep"))
                                .cornerRadius(8)

                                LineMark(
                                    x: .value("Label", point.label),
                                    y: .value("Diet Quality", scaledFood(point.food_quality))
                                )
                                .foregroundStyle(by: .value("Series", "Diet"))
                                .lineStyle(.init(lineWidth: 2, lineCap: .round, lineJoin: .round))
                                .interpolationMethod(.catmullRom)
                                PointMark(
                                    x: .value("Label", point.label),
                                    y: .value("Diet Quality", scaledFood(point.food_quality))
                                )
                                .foregroundStyle(by: .value("Series", "Diet"))
                                .symbolSize(24)
                            }
                        }
                        // D-C4: legend + explicit series colors (Sleep = appBlue, Diet = appGreen).
                        .chartForegroundStyleScale([
                            "Sleep": Color.appBlue.opacity(0.9),
                            "Diet": Color.appGreen
                        ])
                        .chartLegend(position: .bottom)
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
                                    if let s = value.as(String.self), showsAxisMark(s, period: period, ticks: ticks) {
                                        AxisGridLine()
                                        AxisValueLabel { Text(shortLabel(for: s, period: period)) }
                                    }
                                }
                            }
                        }
                        // D-C1 / D-C3: leading axis = real sleep hours ("hrs"); trailing axis = diet 0-5 ("/ 5").
                        .chartYAxis {
                            AxisMarks(position: .leading, values: .automatic(desiredCount: 5)) { _ in
                                AxisGridLine()
                                AxisValueLabel()
                            }
                            AxisMarks(position: .trailing, values: dietAxisTicks) { value in
                                AxisValueLabel {
                                    if let raw = value.as(Double.self), sleepDomainMax > 0 {
                                        Text("\(Int((raw / sleepDomainMax * 5).rounded()))")
                                    }
                                }
                            }
                        }
                        .chartYAxisLabel("hrs", position: .leading)
                        .chartYAxisLabel("/ 5", position: .trailing)
                        .chartYScale(domain: 0...sleepDomainMax)
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
                                   let yPos = proxy.position(forY: tapped.sleep_hours) {
                                    let anchorX = geo[plotFrame].origin.x + xPos
                                    let anchorY = geo[plotFrame].origin.y + yPos

                                    HealthCalloutView(
                                        label: calloutTitle(dateString: tapped.date, label: tapped.label, period: period),
                                        sleep: tapped.sleep_hours,
                                        food: tapped.food_quality
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

    /// Polish #29: the kit load step (see ActivityTimelineDetailView.load — polish #34's key-drop rule).
    private func load() async {
        guard let token = programContext.authToken, !token.isEmpty, let pid = programContext.programId else { return }
        let period = self.period
        let memberId = self.memberId
        state = state.refreshing()
        let outcome = await loadOutcome {
            try await APIClient.shared.fetchHealthTimeline(token: token, period: period.apiValue, programId: pid, memberId: memberId)
        }
        guard let outcome, period == self.period else { return }
        state = state.applying(outcome)
    }
}
