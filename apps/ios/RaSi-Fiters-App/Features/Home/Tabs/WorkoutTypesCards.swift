import SwiftUI
import Charts

// MARK: - Lifestyle (workout-types) cards
//
// Ported verbatim from the legacy `Features/Home/Helpers/AdminHomeHelpers.swift` on the
// Lifestyle-tab port (run 56). Reuses the foundation: `CardShell` + `ScrollableBarChart`
// (run 54), the `WorkoutPopularity*` logic/components (run 50), `AccentChip` (run 56),
// `GlassButton` (run 55), and `ViewWorkoutTypesListView` (deferred stub).

struct WorkoutTypesHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.largeTitle.weight(.bold))
                    .foregroundColor(Color(.label))
                Text("\(subtitle)")
                    .font(.headline.weight(.semibold))
                    .foregroundColor(Color(.secondaryLabel))
            }

            Spacer()

            NavigationLink {
                ViewWorkoutTypesListView()
            } label: {
                GlassButton(icon: "dumbbell")
            }
        }
    }
}

struct WorkoutTypesTotalCard: View {
    let total: Int
    private let accent: Color = .orange

    var body: some View {
        CardShell(
            background: Color(.systemBackground).opacity(0.9),
            strokeColor: Color(.systemGray4).opacity(0.6)
        ) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Total workout types")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))

                AccentChip(label: "Program to date", accent: accent)
                    .padding(.top, 6)

                Spacer()

                Text("\(total)")
                    .font(.title2.weight(.bold))
                    .foregroundColor(accent)

                Spacer()

                Text("different exercises")
                    .font(.footnote)
                    .foregroundColor(Color(.secondaryLabel))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct WorkoutTypeMostPopularCard: View {
    let name: String?
    let sessions: Int
    private let accent: Color = .purple

    var body: some View {
        CardShell(
            background: Color(.systemBackground).opacity(0.9),
            strokeColor: Color(.systemGray4).opacity(0.6)
        ) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Most popular")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))

                AccentChip(label: "Program to date", accent: accent)
                    .padding(.top, 6)

                Spacer()

                Text(name ?? "N/A")
                    .font(.title3.weight(.bold))
                    .foregroundColor(accent)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)

                Spacer()

                Text(name == nil ? "No data" : "\(sessions) workouts")
                    .font(.footnote)
                    .foregroundColor(Color(.secondaryLabel))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct WorkoutTypeLongestDurationCard: View {
    let name: String?
    let avgMinutes: Int
    private let accent: Color = .red

    var body: some View {
        CardShell(
            background: Color(.systemBackground).opacity(0.9),
            strokeColor: Color(.systemGray4).opacity(0.6)
        ) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Longest duration")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))

                AccentChip(label: "Program to date", accent: accent)
                    .padding(.top, 6)

                Spacer()

                Text(name ?? "N/A")
                    .font(.title3.weight(.bold))
                    .foregroundColor(accent)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)

                Spacer()

                Text(name == nil ? "No data" : "\(avgMinutes) mins avg")
                    .font(.footnote)
                    .foregroundColor(Color(.secondaryLabel))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct WorkoutTypeHighestParticipationCard: View {
    let name: String?
    let participationPct: Double
    private let accent: Color = .green

    var body: some View {
        CardShell(
            background: Color(.systemBackground).opacity(0.9),
            strokeColor: Color(.systemGray4).opacity(0.6)
        ) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Highest participation")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))

                AccentChip(label: "Program to date", accent: accent)
                    .padding(.top, 6)

                Spacer()

                Text(name ?? "N/A")
                    .font(.title3.weight(.bold))
                    .foregroundColor(accent)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)

                Spacer()

                Text(name == nil ? "No data" : String(format: "%.1f%% of members", participationPct))
                    .font(.footnote)
                    .foregroundColor(Color(.secondaryLabel))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct WorkoutTypePopularityCard: View {
    let types: [APIClient.WorkoutTypeDTO]
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    @State private var metric: WorkoutPopularityMetric = .count
    @State private var showAll = false

    private var isCompact: Bool {
        horizontalSizeClass == .compact
    }

    private var sortedTypes: [APIClient.WorkoutTypeDTO] {
        workoutPopularitySorted(types: types, metric: metric)
    }

    private var displayTypes: [APIClient.WorkoutTypeDTO] {
        if isCompact && !showAll {
            return Array(sortedTypes.prefix(6))
        }
        return sortedTypes
    }

    private var maxValue: Double {
        displayTypes.map { metric.value(for: $0) }.max() ?? 0
    }

    private var rows: [RankedBarList.RowItem] {
        displayTypes.map {
            RankedBarList.RowItem(
                id: $0.id.uuidString,
                name: $0.workout_name,
                value: metric.value(for: $0),
                displayValue: metric.formattedValue(for: $0),
                color: workoutTypePaletteColor(for: $0.workout_name)
            )
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Workout Type Popularity")
                .font(.headline.weight(.semibold))
                .foregroundColor(Color(.label))

            if rows.isEmpty {
                Text("No workouts logged yet.")
                    .font(.footnote)
                    .foregroundColor(Color(.secondaryLabel))
            } else {
                SegmentedMetricPicker(metrics: WorkoutPopularityMetric.allCases, selection: $metric)

                Text(metric.axisLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(Color(.secondaryLabel))

                RankedBarList(rows: rows, maxValue: maxValue)

                if isCompact && sortedTypes.count > 6 {
                    Button(showAll ? "Show top 6" : "Show all") {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            showAll.toggle()
                        }
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.appOrange)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(.systemBackground).opacity(0.95))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1)
        )
        .shadow(color: Color(.black).opacity(0.06), radius: 10, x: 0, y: 6)
        .animation(.easeInOut(duration: 0.2), value: metric)
        .animation(.easeInOut(duration: 0.2), value: showAll)
    }
}

struct LifestyleTimelineCardSummary: View {
    let points: [APIClient.HealthTimelinePoint]

    private var trimmedPoints: [APIClient.HealthTimelinePoint] {
        Array(points.suffix(10))
    }

    private var yMax: Double {
        max(Double(trimmedPoints.map { max($0.sleep_hours, $0.food_quality) }.max() ?? 1), 1)
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
                        Text("Lifestyle Timeline")
                            .font(.headline.weight(.semibold))
                            .foregroundColor(Color(.label))
                        Text("Sleep · Diet quality")
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
                                    y: .value("Sleep Hours", point.sleep_hours),
                                    width: .fixed(barWidth)
                                )
                                .foregroundStyle(Color.appBlue.opacity(0.9))
                                .cornerRadius(6)

                                LineMark(
                                    x: .value("Label", point.label),
                                    y: .value("Diet Quality", point.food_quality)
                                )
                                .lineStyle(.init(lineWidth: 2, lineCap: .round, lineJoin: .round))
                                .foregroundStyle(Color.appGreen)
                                .interpolationMethod(.catmullRom)
                                PointMark(
                                    x: .value("Label", point.label),
                                    y: .value("Diet Quality", point.food_quality)
                                )
                                .symbolSize(22)
                                .foregroundStyle(Color.appGreen)
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
