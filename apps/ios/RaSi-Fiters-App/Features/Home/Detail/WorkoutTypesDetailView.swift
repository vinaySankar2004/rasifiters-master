import SwiftUI
import Charts

// Faithful 1:1 port of the legacy iOS WorkoutTypesDetailView
// (ios-mobile Features/Home/Detail/WorkoutTypesDetailViews.swift:72-198) — the expanded "Workout Types"
// drill-down: a horizontal %-share bar chart (top 5 + "Others" aggregate) over a scrollable per-type
// breakdown list with progress bars. Program-wide, program-to-date; no period, no member scope, no role
// logic (matches web /summary/workout-types). D-REF: kept iOS-native (run-52/53 platform idiom).
// typeColor / barColor / ScrollableBarChart / WorkoutTypesSummaryCard already live in
// Tabs/SummaryChartCards.swift (run 54) — referenced here, NOT redefined. WorkoutTypeRow is ported here
// (co-located in the legacy deferred detail file, not in the foundation). No .orange/.purple literals —
// the chart uses the palette-based barColor(for:), so D-C3 tokenize is N/A here. Already carries an
// empty-state guard (sortedTypes.isEmpty — a variable-length array, so length IS the empty case).

struct WorkoutTypesDetailView: View {
    let types: [APIClient.WorkoutTypeDTO]
    @State private var selected: APIClient.WorkoutTypeDTO?

    private var sortedTypes: [APIClient.WorkoutTypeDTO] {
        types.sorted { $0.total_duration > $1.total_duration }
    }

    private var totalDuration: Double {
        max(Double(sortedTypes.reduce(0) { $0 + $1.total_duration }), 1)
    }

    private var chartTypes: [APIClient.WorkoutTypeDTO] {
        var arr: [APIClient.WorkoutTypeDTO] = []
        let topFive = Array(sortedTypes.prefix(5))
        let others = Array(sortedTypes.dropFirst(5))
        arr.append(contentsOf: topFive)
        if !others.isEmpty {
            let totalSessions = others.reduce(0) { $0 + $1.sessions }
            let totalDuration = others.reduce(0) { $0 + $1.total_duration }
            let avg = totalSessions > 0 ? Int(round(Double(totalDuration) / Double(totalSessions))) : 0
            arr.append(APIClient.WorkoutTypeDTO(workout_name: "Others", sessions: totalSessions, total_duration: totalDuration, avg_duration_minutes: avg))
        }
        return arr
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Workout Types")
                .font(.title3.weight(.semibold))
            if sortedTypes.isEmpty {
                VStack(alignment: .center, spacing: 8) {
                    Text("No workouts logged yet.")
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                }
                .frame(maxWidth: .infinity, minHeight: 200)
            } else {
                Text("Time spent (Program to date)")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(Color(.secondaryLabel))

                Chart {
                    ForEach(chartTypes) { t in
                        let percent = Double(t.total_duration) / totalDuration
                        BarMark(
                            x: .value("Percent", percent),
                            y: .value("Type", t.workout_name)
                        )
                        .foregroundStyle(barColor(for: t))
                        .cornerRadius(8)
                        .annotation(position: .trailing, alignment: .leading) {
                            Text("\(Int(round(percent * 100)))%")
                                .font(.caption2.weight(.semibold))
                                .foregroundColor(Color(.label))
                        }
                    }
                }
                .chartYAxis {
                    AxisMarks() { _ in
                        AxisValueLabel()
                    }
                }
                .chartXAxis(.hidden)
                .chartXScale(domain: 0...1)
                .frame(height: min(200, CGFloat(chartTypes.count) * 32))

                Divider()
                    .padding(.vertical, 4)

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 16) {
                        Text("Breakdown")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(Color(.secondaryLabel))
                            .frame(maxWidth: .infinity, alignment: .leading)

                        let total = max(sortedTypes.reduce(0) { $0 + $1.total_duration }, 1)
                        ForEach(sortedTypes) { t in
                            WorkoutTypeRow(type: t, total: total, isOthers: false)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
        .frame(maxWidth: .infinity)
    }
}

struct WorkoutTypeRow: View {
    let type: APIClient.WorkoutTypeDTO
    let total: Int
    var isOthers: Bool = false

    private var share: Double {
        total > 0 ? Double(type.total_duration) / Double(total) : 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Circle()
                    .fill(isOthers ? Color(.systemGray3) : typeColor(for: type.workout_name))
                    .frame(width: 10, height: 10)
                Text(type.workout_name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(formatWorkoutMinutes(type.total_duration))
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.label))
                    Text("\(type.sessions) sessions")
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
                }
            }
            ProgressView(value: share)
                .progressViewStyle(.linear)
                .tint(isOthers ? Color(.systemGray3) : typeColor(for: type.workout_name))
        }
    }
}
