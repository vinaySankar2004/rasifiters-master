import SwiftUI

// MARK: - Member Picker, Overview & Metrics cards
// Ported faithfully from legacy Features/Home/Detail/MemberPickerOverviewView.swift
// (MemberPickerView · MemberOverviewCard · SortField/SortDirection · MemberMetricsCard ·
// memberTimelinePoints) + Detail/MemberMetricsViews.swift (MemberMetricsPreviewCard).
// The metrics-detail machinery (MetricsFilters · SortSheet · FilterSheet · clamp) is deferred
// with MemberMetricsDetailView — see specs/pages/ios/admin-members/SPEC.md D-SCOPE.

struct MemberPickerView: View {
    let members: [APIClient.MemberDTO]
    let selected: APIClient.MemberDTO?
    let showNoneOption: Bool
    let noneLabel: String
    let onSelect: (APIClient.MemberDTO?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""

    init(
        members: [APIClient.MemberDTO],
        selected: APIClient.MemberDTO?,
        showNoneOption: Bool = true,
        noneLabel: String = "None",
        onSelect: @escaping (APIClient.MemberDTO?) -> Void
    ) {
        self.members = members
        self.selected = selected
        self.showNoneOption = showNoneOption
        self.noneLabel = noneLabel
        self.onSelect = onSelect
    }

    var body: some View {
        NavigationStack {
            List {
                if showNoneOption {
                    Button {
                        onSelect(nil)
                        dismiss()
                    } label: {
                        HStack {
                            Text(noneLabel)
                            if selected == nil {
                                Spacer()
                                Image(systemName: "checkmark")
                                    .foregroundColor(.appOrange)
                            }
                        }
                    }
                }

                ForEach(filtered, id: \.id) { member in
                    Button {
                        onSelect(member)
                        dismiss()
                    } label: {
                        HStack {
                            Text(member.member_name)
                            Spacer()
                            if member.id == selected?.id {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.appOrange)
                            }
                        }
                    }
                }
            }
            .searchable(text: $search, prompt: "Search member")
            .navigationTitle("View as")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var filtered: [APIClient.MemberDTO] {
        let q = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return members }
        return members.filter { $0.member_name.lowercased().contains(q) }
    }
}

struct MemberOverviewCard: View {
    @EnvironmentObject var programContext: ProgramContext
    let member: APIClient.MemberDTO?

    private var overview: APIClient.MemberMetricsDTO? { programContext.selectedMemberOverview }
    private var programTotalDays: Int {
        let start = programContext.startDate
        let end = min(programContext.endDate, Date())
        let days = Calendar.current.dateComponents([.day], from: start, to: end).day ?? 0
        return max(days + 1, 1)
    }
    private func memberProgressPercent(activeDays: Int) -> Int {
        let pct = Double(activeDays) / Double(programTotalDays)
        return Int(round(pct * 100))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Member Overview")
                    .font(.headline.weight(.semibold))
                Spacer()
            }

            if let m = overview {
                topRow(for: m)
                statsGrid(for: m)
                progress(for: m)
            } else {
                Text("No workouts logged yet.")
                    .font(.subheadline)
                    .foregroundColor(Color(.secondaryLabel))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(.systemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1)
        )
        .adaptiveShadow(radius: 8, y: 4)
    }

    private func topRow(for m: APIClient.MemberMetricsDTO) -> some View {
        HStack(alignment: .center, spacing: 10) {
            Circle()
                .fill(Color(.systemGray5))
                .frame(width: 48, height: 48)
                .overlay(
                    Text(initials(for: m.member_name))
                        .font(.headline.weight(.bold))
                        .foregroundColor(Color(.label))
                )
            VStack(alignment: .leading, spacing: 2) {
                Text(m.member_name)
                    .font(.headline.weight(.semibold))
                Text("MTD Workouts: \(m.mtd_workouts ?? 0)")
                    .font(.footnote)
                    .foregroundColor(Color(.secondaryLabel))
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                let mp = memberProgressPercent(activeDays: m.active_days)
                Text("\(mp)%")
                    .font(.title3.weight(.bold))
                    .foregroundColor(.appOrange)
                Text("PTD MP %")
                    .font(.caption)
                    .foregroundColor(Color(.secondaryLabel))
            }
        }
    }

    private func statsGrid(for m: APIClient.MemberMetricsDTO) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                overviewTile(title: "Total Time", value: "\(m.total_hours ?? m.total_duration / 60) hrs", accent: .purple)
                overviewTile(title: "Favorite", value: m.favorite_workout ?? "—", accent: .green)
            }
        }
    }

    private func progress(for m: APIClient.MemberMetricsDTO) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("PTD - Member Progress")
                .font(.subheadline.weight(.semibold))
            ProgressView(value: Double(m.active_days), total: Double(programTotalDays))
                .progressViewStyle(.linear)
                .adaptiveTint()
            Text("\(m.active_days) / \(programTotalDays) days")
                .font(.caption)
                .foregroundColor(Color(.secondaryLabel))
        }
    }

    private func overviewTile(title: String, value: String, accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundColor(Color(.secondaryLabel))
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(accent)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private func initials(for name: String) -> String {
        let comps = name.split(separator: " ").compactMap { $0.first }
        return comps.prefix(2).map { String($0).uppercased() }.joined()
    }
}

enum SortField: String, CaseIterable, Hashable {
    case workouts
    case total_duration
    case avg_duration
    case avg_sleep_hours
    case active_days
    case workout_types
    case current_streak
    case longest_streak
    case avg_food_quality
    case avg_steps

    var label: String {
        switch self {
        case .workouts: return "Workouts"
        case .total_duration: return "Total Duration"
        case .avg_duration: return "Avg Duration"
        case .avg_sleep_hours: return "Avg Sleep"
        case .active_days: return "Active Days"
        case .workout_types: return "Workout Types"
        case .current_streak: return "Current Streak"
        case .longest_streak: return "Longest Streak"
        case .avg_food_quality: return "Avg Diet Quality"
        case .avg_steps: return "Avg Steps"
        }
    }

    var chipLabel: String {
        switch self {
        case .workouts: return "Workouts"
        case .active_days: return "Active Days"
        case .current_streak: return "Current Streak"
        case .avg_sleep_hours: return "Avg Sleep"
        case .avg_food_quality: return "Avg Diet"
        case .avg_steps: return "Avg Steps"
        default: return label
        }
    }
}

enum SortDirection: String, Hashable {
    case asc
    case desc
}

struct MemberMetricsCard: View {
    let metric: APIClient.MemberMetricsDTO
    let hero: SortField

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center) {
                Circle()
                    .fill(Color(.systemGray5))
                    .frame(width: 44, height: 44)
                    .overlay(
                        Text(initials)
                            .font(.headline.weight(.semibold))
                            .foregroundColor(Color(.label))
                    )
                VStack(alignment: .leading, spacing: 2) {
                    Text(metric.member_name)
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.label))
                    Text("Workouts \(metric.workouts)")
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(heroValue)
                        .font(.title3.weight(.bold))
                        .foregroundColor(.appOrange)
                    Text(hero.label)
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
                }
            }

            metricsGrid
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(.systemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1)
        )
        .adaptiveShadow(radius: 8, y: 4)
    }

    private var initials: String {
        let comps = metric.member_name.split(separator: " ").compactMap { $0.first }
        return comps.prefix(2).map { String($0).uppercased() }.joined()
    }

    private var heroValue: String {
        switch hero {
        case .workouts: return "\(metric.workouts)"
        case .total_duration: return "\(metric.total_duration) min"
        case .avg_duration: return "\(metric.avg_duration) min"
        case .avg_sleep_hours:
            return metric.avg_sleep_hours.map { String(format: "%.1f hrs", $0) } ?? "—"
        case .active_days: return "\(metric.active_days)"
        case .workout_types: return "\(metric.workout_types)"
        case .current_streak: return "\(metric.current_streak)"
        case .longest_streak: return "\(metric.longest_streak)"
        case .avg_food_quality:
            return metric.avg_food_quality.map { "\($0) / 5" } ?? "—"
        case .avg_steps:
            return avgStepsValue
        }
    }

    private var metricsGrid: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                metricTile(title: "Active Days", value: "\(metric.active_days)", icon: "calendar")
                metricTile(title: "Workouts", value: "\(metric.workouts)", icon: "figure.strengthtraining.traditional")
            }
            HStack(spacing: 10) {
                metricTile(title: "Workout Types", value: "\(metric.workout_types)", icon: "list.bullet")
                metricTile(title: "Total Duration", value: "\(metric.total_duration) min", icon: "clock")
            }
            HStack(spacing: 10) {
                metricTile(title: "Avg Duration", value: "\(metric.avg_duration) min", icon: "clock.arrow.circlepath")
                metricTile(title: "Longest Streak", value: "\(metric.longest_streak)", icon: "trophy.fill")
            }
            HStack(spacing: 10) {
                metricTile(title: "Avg Sleep", value: avgSleepValue, icon: "bed.double.fill")
                metricTile(title: "Avg Diet Quality", value: avgFoodValue, icon: "leaf.fill")
            }
            HStack(spacing: 10) {
                metricTile(title: "Avg Steps", value: avgStepsValue, icon: "figure.walk")
                Label("Current Streak \(metric.current_streak)", systemImage: "flame.fill")
                    .font(.footnote.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.appOrangeLight)
                    .foregroundColor(.appOrange)
                    .cornerRadius(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func metricTile(title: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.caption.weight(.bold))
                    .foregroundColor(Color(.tertiaryLabel))
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(Color(.secondaryLabel))
            }
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(Color(.label))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private var avgSleepValue: String {
        guard let value = metric.avg_sleep_hours else { return "—" }
        return String(format: "%.1f hrs", value)
    }

    private var avgFoodValue: String {
        guard let value = metric.avg_food_quality else { return "—" }
        return "\(value) / 5"
    }

    private var avgStepsValue: String {
        guard let value = metric.avg_steps else { return "—" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }
}

struct MemberMetricsPreviewCard: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var isLoading = false
    @State private var sortField: SortField = .active_days
    @State private var sortDirection: SortDirection = .desc

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Member Performance Metrics")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.label))
                    Text("\(memberCount) members")
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.headline.weight(.semibold))
                    .foregroundColor(Color(.tertiaryLabel))
            }

            if isLoading {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.systemGray5))
                    .frame(height: 120)
                    .redacted(reason: .placeholder)
            } else if let top = programContext.memberMetrics.first {
                topPreview(top)
            } else {
                Text("No members to display")
                    .font(.footnote)
                    .foregroundColor(Color(.secondaryLabel))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(.systemBackground).opacity(0.95))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1)
        )
        .adaptiveShadow(radius: 10, y: 6)
        .task { await loadTop() }
    }

    private var memberCount: Int {
        programContext.memberMetricsTotal > 0 ? programContext.memberMetricsTotal : programContext.memberMetrics.count
    }

    private func topPreview(_ metric: APIClient.MemberMetricsDTO) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                HStack(spacing: 6) {
                    Image(systemName: "star.fill")
                        .foregroundColor(.appOrange)
                        .font(.caption)
                    Text(metric.member_name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Color(.label))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(heroValue(metric))
                        .font(.title3.weight(.bold))
                        .foregroundColor(.appOrange)
                    Text("\(sortField.label)")
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
                }
            }
            HStack(spacing: 12) {
                miniTile(title: "Active Days", value: "\(metric.active_days)")
                miniTile(title: "Workouts", value: "\(metric.workouts)")
                miniTile(title: "Types", value: "\(metric.workout_types)")
            }
        }
    }

    private func miniTile(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundColor(Color(.secondaryLabel))
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(Color(.label))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(.systemGray6))
        .cornerRadius(10)
    }

    private func heroValue(_ metric: APIClient.MemberMetricsDTO) -> String {
        switch sortField {
        case .workouts: return "\(metric.workouts)"
        case .total_duration: return "\(metric.total_duration) min"
        case .avg_duration: return "\(metric.avg_duration) min"
        case .avg_sleep_hours:
            return metric.avg_sleep_hours.map { String(format: "%.1f hrs", $0) } ?? "—"
        case .active_days: return "\(metric.active_days)"
        case .workout_types: return "\(metric.workout_types)"
        case .current_streak: return "\(metric.current_streak)"
        case .longest_streak: return "\(metric.longest_streak)"
        case .avg_food_quality:
            return metric.avg_food_quality.map { "\($0) / 5" } ?? "—"
        case .avg_steps:
            guard let value = metric.avg_steps else { return "—" }
            let formatter = NumberFormatter()
            formatter.numberStyle = .decimal
            return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
        }
    }

    private func loadTop() async {
        guard !isLoading else { return }
        isLoading = true
        await programContext.loadMemberMetrics(
            search: "",
            sort: sortField.rawValue,
            direction: sortDirection.rawValue,
            filters: [:],
            dateRange: (nil, nil)
        )
        isLoading = false
    }
}

func memberTimelinePoints(from history: [APIClient.MemberHistoryPoint]) -> [APIClient.ActivityTimelinePoint] {
    history.map {
        APIClient.ActivityTimelinePoint(
            date: $0.date,
            label: $0.label,
            workouts: $0.workouts,
            active_members: 0
        )
    }
}
