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
// D-C2: web-parity error banner — legacy set `errorMessage` but rendered it nowhere; web surfaces ErrorState.
// D-C3: axis unit labels ("hrs" leading / "/ 5" trailing), meaningful now the scales are split.
// D-C4: chart Legend (Sleep / Diet) via chartForegroundStyleScale.
// D-DEPS: HealthHeaderStats + HealthCalloutView ported into ChartDetailComponents.swift; every other helper
//   (HeaderHeightKey / clamp / axisValues / shortLabel / calloutTitle / rangeLabel), ScrollableBarChart, and
//   the API method/DTO/loader reused-not-redefined (run 50/54/61). Legacy already tokenized colors → no tokenize.

struct LifestyleTimelineDetailView: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var period: AdminHomeView.Period
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var selectedLabel: String?
    @State private var dailyHeight: CGFloat = 0
    private let memberId: String?

    init(initialPeriod: AdminHomeView.Period, memberId: String? = nil) {
        _period = State(initialValue: initialPeriod)
        self.memberId = memberId
    }

    private var points: [APIClient.HealthTimelinePoint] {
        programContext.healthTimeline
    }

    private var dailyAverageSleep: Double {
        programContext.healthTimelineDailyAverageSleep
    }

    private var dailyAverageFood: Double {
        programContext.healthTimelineDailyAverageFood
    }

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
                    Text(p.label).tag(p)
                }
            }
            .pickerStyle(.segmented)

            if selectedLabel == nil {
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

            if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 240, alignment: .center)
            } else if let errorMessage {
                // D-C2: web-parity error banner (legacy swallowed; web surfaces ErrorState).
                errorBanner(errorMessage)
                    .frame(maxWidth: .infinity, minHeight: 240, alignment: .center)
            } else if points.isEmpty {
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
                                AxisGridLine()
                                AxisValueLabel {
                                    if let s = value.as(String.self) {
                                        Text(shortLabel(for: s, period: period))
                                    }
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
                await programContext.loadHealthTimeline(period: AdminHomeView.Period.week.apiValue, memberId: memberId)
            }
        }
    }

    // D-C2: web-parity error banner (run-54 AdminSummaryTab shape).
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

    private func load(period: AdminHomeView.Period) async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil

        // Clear global error before calling to prevent stale errors from showing.
        programContext.errorMessage = nil

        await programContext.loadHealthTimeline(period: period.apiValue, memberId: memberId)

        // D-C2: only surface an error if the timeline call specifically failed.
        if programContext.healthTimeline.isEmpty && programContext.errorMessage != nil {
            errorMessage = programContext.errorMessage
        }

        isLoading = false
    }
}
