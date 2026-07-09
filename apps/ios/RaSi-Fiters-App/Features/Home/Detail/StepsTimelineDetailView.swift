import SwiftUI
import Charts

// Steps Timeline drill-down — the steps twin of LifestyleTimelineDetailView. Single teal bar series
// (daily steps) over time, with a period selector, daily-average header, and a native tap-callout
// (tooltip mandatory — chart parity). Always member-scoped (the Lifestyle-tab card passes the
// viewer's own id, or the admin-selected member's id). Read-only analytics.
//
// Reuses the shared chart chrome (ScrollableBarChart, HeaderHeightKey, axisValues, shortLabel,
// calloutTitle, rangeLabel, clamp) and the `loadHealthTimeline` loader — no diet line, no second
// axis, no legend (single series). FileSystemSynchronizedRootGroup — no pbxproj edit.

struct StepsTimelineDetailView: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var period: AdminHomeView.Period
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var selectedLabel: String?
    @State private var dailyHeight: CGFloat = 0
    private let memberId: String?

    private let accent: Color = .teal

    init(initialPeriod: AdminHomeView.Period, memberId: String? = nil) {
        _period = State(initialValue: initialPeriod)
        self.memberId = memberId
    }

    private var points: [APIClient.HealthTimelinePoint] {
        programContext.healthTimeline
    }

    private var dailyAverageSteps: Double {
        programContext.healthTimelineDailyAverageSteps
    }

    private var axisStartDate: Date {
        programContext.startDate
    }

    private var axisEndDate: Date {
        programContext.endDate
    }

    private var stepsDomainMax: Double {
        max(Double(points.map { $0.steps ?? 0 }.max() ?? 1), 1) * 1.1
    }

    private func grouped(_ n: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: n)) ?? "\(n)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Steps Timeline")
                    .font(.title3.weight(.semibold))
                Text("Daily steps")
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
                stepsHeader
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
                errorBanner(errorMessage)
                    .frame(maxWidth: .infinity, minHeight: 240, alignment: .center)
            } else if points.isEmpty {
                Text("No data for this range yet.")
                    .font(.footnote)
                    .foregroundColor(Color(.secondaryLabel))
                    .frame(maxWidth: .infinity, minHeight: 240, alignment: .center)
            } else {
                let fitToWidth = (period == .month)
                ScrollableBarChart(barCount: points.count, minBarWidth: 12, fill: fitToWidth) { barWidth in
                    Chart {
                        ForEach(points) { point in
                            BarMark(
                                x: .value("Label", point.label),
                                y: .value("Steps", Double(point.steps ?? 0)),
                                width: .fixed(barWidth)
                            )
                            .foregroundStyle(accent.opacity(0.9))
                            .cornerRadius(8)
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
                        AxisMarks(position: .leading, values: .automatic(desiredCount: 5)) { _ in
                            AxisGridLine()
                            AxisValueLabel()
                        }
                    }
                    .chartYAxisLabel("steps", position: .leading)
                    .chartYScale(domain: 0...stepsDomainMax)
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
                               let yPos = proxy.position(forY: Double(tapped.steps ?? 0)) {
                                let anchorX = geo[plotFrame].origin.x + xPos
                                let anchorY = geo[plotFrame].origin.y + yPos

                                StepsCalloutView(
                                    label: calloutTitle(dateString: tapped.date, label: tapped.label, period: period),
                                    steps: tapped.steps ?? 0
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

    private var stepsHeader: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("DAILY AVERAGE")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(Color(.secondaryLabel))
                    Text(grouped(Int(dailyAverageSteps.rounded())))
                        .font(.title3.weight(.semibold))
                        .foregroundColor(accent)
                }
                Spacer()
                Text(rangeLabel(for: period, startDate: axisStartDate, endDate: axisEndDate))
                    .font(.callout.weight(.medium))
                    .foregroundColor(Color(.secondaryLabel))
            }
        }
    }

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
        programContext.errorMessage = nil

        await programContext.loadHealthTimeline(period: period.apiValue, memberId: memberId)

        if programContext.healthTimeline.isEmpty && programContext.errorMessage != nil {
            errorMessage = programContext.errorMessage
        }

        isLoading = false
    }
}

private struct StepsCalloutView: View {
    let label: String
    let steps: Int

    private var stepsValue: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: steps)) ?? "\(steps)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption.weight(.semibold))
            HStack {
                Circle().fill(Color.teal).frame(width: 6, height: 6)
                Text("\(stepsValue) steps")
            }
            .font(.caption2)
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color(.systemBackground))
                .shadow(radius: 4, y: 2)
        )
    }
}
