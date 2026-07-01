import SwiftUI
import Charts

// Faithful 1:1 port of the legacy iOS Summary chart cards
// (ios-mobile Features/Home/Helpers/AdminHomeHelpers.swift + Detail/WorkoutDistributionViews.swift
//  + Detail/WorkoutTypesDetailViews.swift). The expanded Detail views remain deferred stubs.

// MARK: - Horizontally scrollable chart container

struct ScrollableBarChart<Content: View>: View {
    let barCount: Int
    let minBarWidth: CGFloat
    let barGap: CGFloat
    let fill: Bool
    // The closure receives the resolved per-bar width so callers can size their BarMarks
    // consistently with the container (crucial in `fill` mode, where bars shrink to fit).
    @ViewBuilder let chart: (CGFloat) -> Content

    init(
        barCount: Int,
        minBarWidth: CGFloat = 12,
        barGap: CGFloat = 6,
        fill: Bool = false,
        @ViewBuilder chart: @escaping (CGFloat) -> Content
    ) {
        self.barCount = barCount
        self.minBarWidth = minBarWidth
        self.barGap = barGap
        self.fill = fill
        self.chart = chart
    }

    var body: some View {
        GeometryReader { geo in
            let count = max(barCount, 1)
            if fill {
                // Fit every bar on screen (no horizontal scroll): bars shrink to fill the width.
                // Used for the Month timeline (~28-31 daily bars) so all days are visible at once.
                let resolvedBarWidth = max(2, geo.size.width / CGFloat(count) - barGap)
                chart(resolvedBarWidth)
                    .frame(width: geo.size.width)
            } else {
                let contentWidth = max(geo.size.width, CGFloat(count) * (minBarWidth + barGap))
                ScrollView(.horizontal, showsIndicators: false) {
                    chart(minBarWidth)
                        .frame(width: contentWidth)
                }
            }
        }
    }
}

// MARK: - Activity timeline card

struct ActivityTimelineCardSummary: View {
    let points: [APIClient.ActivityTimelinePoint]
    var showActive: Bool = true

    private var trimmedPoints: [APIClient.ActivityTimelinePoint] {
        Array(points.suffix(10))
    }

    private var yMax: Double {
        if showActive {
            return max(Double(points.map { max($0.workouts, $0.active_members) }.max() ?? 1), 1)
        }
        return max(Double(points.map { $0.workouts }.max() ?? 1), 1)
    }

    var body: some View {
        CardShell(
            background: Color(.systemBackground).opacity(0.95),
            strokeColor: Color(.systemGray4).opacity(0.5),
            height: 280
        ) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Workout Activity Timeline")
                            .font(.headline.weight(.semibold))
                            .foregroundColor(Color(.label))
                        Text(showActive ? "Workouts · Active members" : "Workouts")
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.tertiaryLabel))
                }

                if points.isEmpty {
                    VStack(spacing: 8) {
                        ProgressView()
                        Text("No data yet")
                            .font(.footnote)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    .frame(maxWidth: .infinity, minHeight: 180)
                } else {
                    let barWidth: CGFloat = 10
                    ScrollableBarChart(barCount: trimmedPoints.count, minBarWidth: barWidth) { _ in
                        Chart {
                            ForEach(trimmedPoints) { point in
                                BarMark(
                                    x: .value("Label", point.label),
                                    y: .value("Workouts", point.workouts),
                                    width: .fixed(barWidth)
                                )
                                .foregroundStyle(Color.appOrangeStrong)
                                .cornerRadius(6)

                                if showActive {
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
                                    .symbolSize(22)
                                    .foregroundStyle(Color.appPurple)
                                }
                            }

                        }
                        .chartXAxis {
                            AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                                AxisGridLine()
                                AxisValueLabel()
                            }
                        }
                        .chartYAxis {
                            AxisMarks(position: .leading, values: .automatic(desiredCount: 4))
                        }
                        .chartYScale(domain: 0...(yMax * 1.1))
                        .frame(height: 200)
                        .drawingGroup()
                    }
                    .frame(height: 200)
                }
            }
        }
    }
}

// MARK: - Distribution helpers + card

struct DistributionPoint: Identifiable {
    let id = UUID()
    let label: String
    let short: String
    let workouts: Int
}

func distributionPoints(fromCounts map: [String: Int]) -> [DistributionPoint] {
    let order = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    let short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    return order.enumerated().map { idx, day in
        let value = map[day] ?? 0
        return DistributionPoint(label: day, short: short[idx], workouts: value)
    }
}

struct DistributionByDayCard: View {
    let points: [DistributionPoint]
    var interactive: Bool = true
    @State private var selected: DistributionPoint?

    private var yMax: Double {
        max(Double(points.map { $0.workouts }.max() ?? 1), 1)
    }

    var body: some View {
        CardShell(
            background: Color(.systemBackground).opacity(0.95),
            strokeColor: Color(.systemGray4).opacity(0.6),
            height: 280
        ) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Workout Distribution by Day")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.label))
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.tertiaryLabel))
                }

                if points.isEmpty {
                    VStack(spacing: 8) {
                        ProgressView()
                        Text("No data yet")
                            .font(.footnote)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    .frame(maxWidth: .infinity, minHeight: 180)
                } else {
                    let barWidth: CGFloat = 14
                    ScrollableBarChart(barCount: points.count, minBarWidth: barWidth) { _ in
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

                            if interactive, let tapped = selected {
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
                        .frame(height: 220)
                        .drawingGroup()
                        .chartOverlay { _ in
                            if interactive {
                                DistributionChartOverlay(points: points, selected: $selected)
                            }
                        }
                    }
                    .frame(height: 220)
                }
            }
        }
    }
}

struct DistributionChartOverlay: View {
    let points: [DistributionPoint]
    @Binding var selected: DistributionPoint?

    var body: some View {
        GeometryReader { geo in
            Rectangle().fill(.clear).contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            let frame = geo.frame(in: .local)
                            let xRel = value.location.x - frame.origin.x
                            let slot = xRel / frame.width
                            let total = max(points.count - 1, 1)
                            let idx = min(max(Int(round(slot * CGFloat(total))), 0), points.count - 1)
                            selected = points[idx]
                        }
                        .onEnded { _ in
                            selected = nil
                        }
                )
        }
    }
}

// MARK: - Workout type colors

func typeColor(for name: String) -> Color {
    workoutTypePaletteColor(for: name)
}

func barColor(for type: APIClient.WorkoutTypeDTO) -> Color {
    type.workout_name == "Others" ? Color(.systemGray3) : typeColor(for: type.workout_name)
}

// MARK: - Workout types summary card

struct WorkoutTypesSummaryCard: View {
    let types: [APIClient.WorkoutTypeDTO]

    private var topSixWithOthers: [APIClient.WorkoutTypeDTO] {
        let sorted = types.sorted { $0.sessions > $1.sessions }
        let topFive = Array(sorted.prefix(5))
        let others = Array(sorted.dropFirst(5))
        var list = topFive
        if !others.isEmpty {
            let totalSessions = others.reduce(0) { $0 + $1.sessions }
            let totalDuration = others.reduce(0) { $0 + $1.total_duration }
            let avg = totalSessions > 0 ? Int(round(Double(totalDuration) / Double(totalSessions))) : 0
            list.append(APIClient.WorkoutTypeDTO(workout_name: "Others", sessions: totalSessions, total_duration: totalDuration, avg_duration_minutes: avg))
        } else if sorted.count > 5 {
            // If no others but we still want up to 6 rows, append the 6th item if exists
            let sixth = sorted.dropFirst(5).first
            if let s = sixth {
                list.append(s)
            }
        }
        return Array(list.prefix(6))
    }

    var body: some View {
        CardShell(
            background: Color(.systemBackground).opacity(0.95),
            strokeColor: Color(.systemGray4).opacity(0.6),
            height: 200
        ) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Top Workout Types")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.label))
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.tertiaryLabel))
                }
                if topSixWithOthers.isEmpty {
                    Text("No workouts logged yet.")
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(topSixWithOthers) { t in
                            HStack {
                                Circle()
                                    .fill(typeColor(for: t.workout_name))
                                    .frame(width: 8, height: 8)
                                Text(t.workout_name)
                                    .font(.subheadline.weight(.semibold))
                                    .lineLimit(1)
                                Spacer()
                                Text("\(t.sessions)")
                                    .font(.subheadline.weight(.medium))
                                    .foregroundColor(Color(.label))
                            }
                        }
                    }
                }
            }
        }
    }
}
