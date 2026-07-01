import SwiftUI
import Charts

// Faithful 1:1 port of the legacy iOS DistributionByDayDetailView
// (ios-mobile Features/Home/Detail/WorkoutDistributionViews.swift:271-372) — the expanded, interactive
// "Workout Distribution by Day" drill-down (7 weekday bars, tap-callout). Program-wide, all-time; no
// period, no member scope, no role logic (matches web /summary/distribution). D-REF: kept iOS-native
// (run-52/53 platform idiom). DistributionPoint / DistributionChartOverlay are already defined in
// Tabs/SummaryChartCards.swift (run 54) — referenced here, NOT redefined (legacy's ChartOverlay was
// renamed DistributionChartOverlay in run 54). CalloutView / clamp come from ChartDetailComponents.swift.
//
// D-C1 (run 61): added an all-zero empty-state guard the legacy detail view LACKED — keyed off the SUM
// (all 7 weekday counts == 0), NOT points.isEmpty (the distribution endpoint always returns all 7 keys,
// so points is never empty). Matches web's D-C1 + the rebuilt DistributionByDayCard + WorkoutTypesDetailView.
// Chart color tokenized (D-C3): .orange → appOrangeStrong.

struct DistributionByDayDetailView: View {
    let points: [DistributionPoint]
    @State private var selected: DistributionPoint?

    private var yMax: Double {
        max(Double(points.map { $0.workouts }.max() ?? 1), 1)
    }

    private var isEmpty: Bool {
        points.allSatisfy { $0.workouts == 0 }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Workout Distribution by Day")
                .font(.title3.weight(.semibold))
            Text("Workouts")
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))

            if isEmpty {
                Text("No workouts logged yet.")
                    .font(.footnote)
                    .foregroundColor(Color(.secondaryLabel))
                    .frame(maxWidth: .infinity, minHeight: 280, alignment: .center)
            } else {
                let barWidth: CGFloat = 14
                ScrollableBarChart(barCount: points.count, minBarWidth: barWidth) {
                    Chart {
                        ForEach(points) { point in
                            BarMark(
                                x: .value("Day", point.short),
                                y: .value("Workouts", point.workouts),
                                width: .fixed(barWidth)
                            )
                            .foregroundStyle(Color.appOrangeStrong)
                            .cornerRadius(8)
                        }

                        if let tapped = selected {
                            RuleMark(x: .value("Day", tapped.short))
                                .lineStyle(.init(lineWidth: 1, dash: [4]))
                                .foregroundStyle(Color(.tertiaryLabel))
                                .annotation(position: .top, spacing: 6) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(tapped.label)
                                            .font(.caption.weight(.semibold))
                                        HStack {
                                            Circle().fill(Color.appOrange).frame(width: 6, height: 6)
                                            Text("Workouts: \(tapped.workouts)")
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
                    }
                    .chartXAxis {
                        AxisMarks(values: points.map { $0.short }) { value in
                            AxisGridLine()
                            AxisValueLabel {
                                if let s = value.as(String.self) {
                                    Text(s)
                                }
                            }
                        }
                    }
                    .chartYAxis {
                        AxisMarks(position: .leading, values: .automatic(desiredCount: 4))
                    }
                    .chartYScale(domain: 0...(yMax * 1.1))
                    .frame(height: 280)
                    .drawingGroup()
                    .chartOverlay { proxy in
                        GeometryReader { geo in
                            if let selected {
                                if let xPos = proxy.position(forX: selected.short),
                                   let yPos = proxy.position(forY: selected.workouts) {
                                    let plotFrame = proxy.plotAreaFrame
                                    let anchorX = geo[plotFrame].origin.x + xPos
                                    let anchorY = geo[plotFrame].origin.y + yPos

                                    CalloutView(
                                        label: selected.label,
                                        workouts: selected.workouts,
                                        active: nil,
                                        showActive: false
                                    )
                                    .position(
                                        x: clamp(anchorX, min: geo.size.width * 0.15, max: geo.size.width * 0.85),
                                        y: max(geo[plotFrame].minY + 12, anchorY - 30)
                                    )
                                }
                            }

                            DistributionChartOverlay(points: points, selected: $selected)
                        }
                    }
                }
                .frame(height: 280)
            }

            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }
}
