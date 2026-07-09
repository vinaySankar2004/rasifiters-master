//
//  MemberMetricsDetailView.swift
//  RaSi-Fiters-App
//
//  Members tab → metrics-preview card → full member-performance metrics table.
//  iOS analogue of web /members/metrics (run 42). Read-only, program-wide:
//  searchable + server-sorted + server-filtered grid of MemberMetricsCard over
//  ProgramContext.loadMemberMetrics, plus a client-side CSV export (ShareSheet).
//
//  Faithful 1:1 port of legacy Features/Home/Detail/MemberMetricsViews.swift +
//  Features/Home/Detail/MemberPickerOverviewView.swift (the MetricsFilters/SortSheet/
//  FilterSheet helpers). SortField / SortDirection / MemberMetricsCard were already
//  ported in run 55 (MemberOverviewPicker.swift) — reused here, NOT redefined.
//  admin_only_data_entry N/A (read-only). See specs/pages/ios/member-metrics-detail/.
//

import SwiftUI

struct MemberMetricsDetailView: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var searchText = ""
    @State private var sortField: SortField = .workouts
    @State private var sortDirection: SortDirection = .desc
    @State private var showSortSheet = false
    @State private var showFilterSheet = false
    @State private var filters = MetricsFilters()
    @State private var isLoading = false
    @State private var showShare = false
    @State private var shareItem: ShareItem?

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 14) {
                controls
                contentList
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 24)
        }
        .navigationTitle("Member Performance Metrics")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    Task { await exportCSV() }
                } label: {
                    Image(systemName: "square.and.arrow.up")
                }
                .disabled(programContext.memberMetrics.isEmpty)
            }
        }
        .sheet(item: $shareItem) { item in
            ShareSheet(activityItems: [item.url])
        }
        .task { await loadMetrics() }
        .onChange(of: sortField) { _, _ in Task { await loadMetrics() } }
        .onChange(of: sortDirection) { _, _ in Task { await loadMetrics() } }
        .onChange(of: filters) { _, _ in Task { await loadMetrics() } }
        .onChange(of: programContext.programId) { _, _ in Task { await loadMetrics() } }
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(Color(.tertiaryLabel))
                TextField("Search member", text: $searchText, onCommit: {
                    Task { await loadMetrics() }
                })
                .textInputAutocapitalization(.none)
                .autocorrectionDisabled()
                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                        Task { await loadMetrics() }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(Color(.tertiaryLabel))
                    }
                }
            }
            .padding(10)
            .background(Color(.systemGray6))
            .cornerRadius(12)

            HStack(spacing: 10) {
                Button {
                    showSortSheet = true
                } label: {
                    HStack(spacing: 6) {
                        Text("Sort by \(sortField.label)")
                            .font(.subheadline.weight(.semibold))
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.footnote.weight(.bold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color(.systemGray6))
                    .cornerRadius(12)
                }

                Button {
                    showFilterSheet = true
                } label: {
                    HStack(spacing: 6) {
                        Text("Filter")
                            .font(.subheadline.weight(.semibold))
                        Image(systemName: "line.horizontal.3.decrease.circle")
                            .font(.headline)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color(.systemGray6))
                    .cornerRadius(12)
                }
            }
        }
        .sheet(isPresented: $showSortSheet) {
            SortSheet(
                sortField: $sortField,
                sortDirection: $sortDirection
            )
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showFilterSheet) {
            FilterSheet(filters: $filters)
                .presentationDetents([.large])
        }
    }

    private var contentList: some View {
        Group {
            if isLoading {
                VStack(spacing: 10) {
                    ForEach(0..<3) { _ in
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(Color(.systemGray5))
                            .frame(height: 130)
                            .redacted(reason: .placeholder)
                    }
                }
            } else if programContext.memberMetrics.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("No members to display.")
                        .font(.subheadline.weight(.semibold))
                    Text("Adjust filters or try a different search.")
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 8)
            } else {
                VStack(spacing: 12) {
                    ForEach(programContext.memberMetrics) { metric in
                        MemberMetricsCard(metric: metric, hero: sortField)
                    }
                }
            }
        }
    }

    private func loadMetrics() async {
        guard !isLoading else { return }
        isLoading = true
        var filterParams: [String: String] = [:]
        filters.addTo(&filterParams)
        await programContext.loadMemberMetrics(
            search: searchText,
            sort: sortField.rawValue,
            direction: sortDirection.rawValue,
            filters: filterParams,
            dateRange: (filters.startDate, filters.endDate)
        )
        isLoading = false
    }

    private func exportCSV() async {
        guard !programContext.memberMetrics.isEmpty else { return }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(secondsFromGMT: 0)

        let startLabel = (filters.startDate ?? programContext.memberMetricsRangeStart).flatMap { formatter.string(from: $0) } ?? "all"
        let endLabel = (filters.endDate ?? programContext.memberMetricsRangeEnd).flatMap { formatter.string(from: $0) } ?? "today"
        let programName = programContext.name.replacingOccurrences(of: " ", with: "")
        let fileName = "MemberPerformanceMetrics_\(programName)_\(startLabel)_to_\(endLabel).csv"

        var csv = "Name,Workouts,Total Duration,Avg Duration,Avg Sleep,Avg Diet Quality,Active Days,Workout Types,Current Streak,Longest Streak\n"
        for m in programContext.memberMetrics {
            let avgSleep = m.avg_sleep_hours.map { String(format: "%.1f", $0) } ?? ""
            let avgFood = m.avg_food_quality.map { "\($0)" } ?? ""
            let line = "\"\(m.member_name.replacingOccurrences(of: "\"", with: "\"\""))\",\(m.workouts),\(m.total_duration),\(m.avg_duration),\(avgSleep),\(avgFood),\(m.active_days),\(m.workout_types),\(m.current_streak),\(m.longest_streak)\n"
            csv.append(line)
        }

        let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        do {
            try csv.write(to: url, atomically: true, encoding: .utf8)
            shareItem = ShareItem(url: url)
        } catch {
            // silently fail for now
        }
    }
}

// MARK: - Metrics Filters model + Sort/Filter sheets
// Ported verbatim from legacy Features/Home/Detail/MemberPickerOverviewView.swift.
// SortField / SortDirection already live in MemberOverviewPicker.swift (run 55) — reused.

struct MetricsFilters: Hashable {
    enum DateMode: String, Hashable {
        case all
        case custom
    }

    var dateMode: DateMode = .all
    var startDate: Date? = nil
    var endDate: Date? = nil
    var workoutsMin: String = ""
    var workoutsMax: String = ""
    var totalDurationMin: String = ""
    var totalDurationMax: String = ""
    var avgDurationMin: String = ""
    var avgDurationMax: String = ""
    var avgSleepHoursMin: String = ""
    var avgSleepHoursMax: String = ""
    var activeDaysMin: String = ""
    var activeDaysMax: String = ""
    var workoutTypesMin: String = ""
    var workoutTypesMax: String = ""
    var currentStreakMin: String = ""
    var longestStreakMin: String = ""
    var avgFoodQualityMin: String = ""
    var avgFoodQualityMax: String = ""
    var avgStepsMin: String = ""
    var avgStepsMax: String = ""

    mutating func clear() {
        dateMode = .all
        startDate = nil
        endDate = nil
        workoutsMin = ""; workoutsMax = ""
        totalDurationMin = ""; totalDurationMax = ""
        avgDurationMin = ""; avgDurationMax = ""
        avgSleepHoursMin = ""; avgSleepHoursMax = ""
        activeDaysMin = ""; activeDaysMax = ""
        workoutTypesMin = ""; workoutTypesMax = ""
        currentStreakMin = ""; longestStreakMin = ""
        avgFoodQualityMin = ""; avgFoodQualityMax = ""
        avgStepsMin = ""; avgStepsMax = ""
    }

    func addTo(_ dict: inout [String: String]) {
        if dateMode == .custom {
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            if let s = startDate { dict["startDate"] = formatter.string(from: s) }
            if let e = endDate { dict["endDate"] = formatter.string(from: e) }
        }
        dict["workoutsMin"] = workoutsMin
        dict["workoutsMax"] = workoutsMax
        dict["totalDurationMin"] = totalDurationMin
        dict["totalDurationMax"] = totalDurationMax
        dict["avgDurationMin"] = avgDurationMin
        dict["avgDurationMax"] = avgDurationMax
        dict["avgSleepHoursMin"] = avgSleepHoursMin
        dict["avgSleepHoursMax"] = avgSleepHoursMax
        dict["activeDaysMin"] = activeDaysMin
        dict["activeDaysMax"] = activeDaysMax
        dict["workoutTypesMin"] = workoutTypesMin
        dict["workoutTypesMax"] = workoutTypesMax
        dict["currentStreakMin"] = currentStreakMin
        dict["longestStreakMin"] = longestStreakMin
        dict["avgFoodQualityMin"] = avgFoodQualityMin
        dict["avgFoodQualityMax"] = avgFoodQualityMax
        dict["avgStepsMin"] = avgStepsMin
        dict["avgStepsMax"] = avgStepsMax
    }
}

struct SortSheet: View {
    @Binding var sortField: SortField
    @Binding var sortDirection: SortDirection

    var body: some View {
        NavigationStack {
            Form {
                Section("Sort by") {
                    ForEach(SortField.allCases, id: \.self) { field in
                        HStack {
                            Text(field.label)
                            Spacer()
                            if field == sortField {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.appOrange)
                            }
                        }
                        .contentShape(Rectangle())
                        .onTapGesture { sortField = field }
                    }
                }
                Section("Direction") {
                    Picker("Direction", selection: $sortDirection) {
                        Text("Descending").tag(SortDirection.desc)
                        Text("Ascending").tag(SortDirection.asc)
                    }
                    .pickerStyle(.segmented)
                }
            }
            .navigationTitle("Sort")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct FilterSheet: View {
    @Binding var filters: MetricsFilters
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss
    private var today: Date { Date() }

    var body: some View {
        NavigationStack {
            Form {
                Section("Date Range") {
                    Picker("Range", selection: $filters.dateMode) {
                        Text("All").tag(MetricsFilters.DateMode.all)
                        Text("Custom").tag(MetricsFilters.DateMode.custom)
                    }
                    .pickerStyle(.segmented)

                    if filters.dateMode == .custom {
                        DatePicker("Start", selection: Binding(get: {
                            filters.startDate ?? (programContext.startDate)
                        }, set: { filters.startDate = $0 }), in: (programContext.startDate)...today, displayedComponents: .date)
                        DatePicker("End", selection: Binding(get: {
                            filters.endDate ?? today
                        }, set: { filters.endDate = $0 }), in: (filters.startDate ?? programContext.startDate)...today, displayedComponents: .date)
                        Text("Metrics follow the selected date range.")
                            .font(.caption)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                }

                Section("Workouts") { rangeFields(min: $filters.workoutsMin, max: $filters.workoutsMax, unit: "") }
                Section("Total Duration (mins)") { rangeFields(min: $filters.totalDurationMin, max: $filters.totalDurationMax, unit: "mins") }
                Section("Avg Duration (mins)") { rangeFields(min: $filters.avgDurationMin, max: $filters.avgDurationMax, unit: "mins") }
                Section("Avg Sleep (hrs)") { rangeFields(min: $filters.avgSleepHoursMin, max: $filters.avgSleepHoursMax, unit: "hrs") }
                Section("Active Days") { rangeFields(min: $filters.activeDaysMin, max: $filters.activeDaysMax, unit: "days") }
                Section("Workout Types") { rangeFields(min: $filters.workoutTypesMin, max: $filters.workoutTypesMax, unit: "types") }
                Section("Current Streak") { minField(title: "Min", value: $filters.currentStreakMin, unit: "days") }
                Section("Longest Streak") { minField(title: "Min", value: $filters.longestStreakMin, unit: "days") }
                Section("Avg Diet Quality") { rangeFields(min: $filters.avgFoodQualityMin, max: $filters.avgFoodQualityMax, unit: "") }
                Section("Avg Steps") { rangeFields(min: $filters.avgStepsMin, max: $filters.avgStepsMax, unit: "steps") }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Clear all") { filters.clear() }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func rangeFields(min: Binding<String>, max: Binding<String>, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            minField(title: "Min", value: min, unit: unit)
            minField(title: "Max", value: max, unit: unit)
        }
    }

    private func minField(title: String, value: Binding<String>, unit: String) -> some View {
        HStack {
            Text(title)
            Spacer()
            TextField("0", text: value)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
            if !unit.isEmpty {
                Text(unit)
                    .foregroundColor(Color(.secondaryLabel))
            }
        }
    }
}
