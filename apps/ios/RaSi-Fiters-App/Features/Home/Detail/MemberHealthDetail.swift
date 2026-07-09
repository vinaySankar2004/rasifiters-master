//
//  MemberHealthDetail.swift
//  RaSi-Fiters-App
//
//  Members tab → health card → per-member daily-health logs (write surface).
//  iOS analogue of web /members/health (run 46), the write twin of MemberRecentDetail.
//  Sorted + filterable list over ProgramContext.loadMemberHealthLogs, swipe Edit
//  (sleep + diet, at-least-one-metric) / Delete per row, and a client-side CSV export.
//
//  Faithful 1:1 port of legacy Features/Home/Sheets/HealthSortFilterSheets.swift
//  (minus WorkoutLogEditSheet, which was legacy-quirkily co-located here and now lives
//  with its owner in MemberRecentDetail.swift) + ONE web-parity deviation:
//   • D-C1 admin_only_data_entry lock — the swipe Edit/Delete actions are gated on
//     `!programContext.dataEntryLocked` (run 54/60). Locked non-admins see the list
//     read-only with the mutations hidden — matching web (`isDataEntryLocked` zeros
//     canEdit). Legacy iOS had none; backend requireDataEntryAllowed is the boundary.
//     See specs/pages/ios/member-health-detail/.
//

import SwiftUI

// MARK: - View Health Sort Field Enum
enum HealthSortField: String, CaseIterable {
    case date
    case sleep_hours
    case food_quality
    case steps

    var label: String {
        switch self {
        case .date: return "Date"
        case .sleep_hours: return "Sleep Hours"
        case .food_quality: return "Diet Quality"
        case .steps: return "Steps"
        }
    }

    var apiValue: String { rawValue }
}

// MARK: - View Health Sort Direction Enum
enum HealthSortDirection: String, CaseIterable {
    case asc
    case desc

    var label: String {
        switch self {
        case .asc: return "Ascending"
        case .desc: return "Descending"
        }
    }

    var icon: String {
        switch self {
        case .asc: return "arrow.up"
        case .desc: return "arrow.down"
        }
    }

    var apiValue: String { rawValue }
}

// MARK: - View Health Filters
struct HealthFilters: Equatable {
    var startDate: Date?
    var endDate: Date?
    var minSleepHours: Double?
    var maxSleepHours: Double?
    var minFoodQuality: Int?
    var maxFoodQuality: Int?
    var minSteps: Int?
    var maxSteps: Int?

    var isActive: Bool {
        startDate != nil || endDate != nil || minSleepHours != nil || maxSleepHours != nil || minFoodQuality != nil || maxFoodQuality != nil || minSteps != nil || maxSteps != nil
    }

    func startDateString() -> String? {
        guard let startDate else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: startDate)
    }

    func endDateString() -> String? {
        guard let endDate else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: endDate)
    }
}

struct MemberHealthDetail: View {
    @EnvironmentObject var programContext: ProgramContext
    let memberId: String?
    let memberName: String?
    @State private var sortField: HealthSortField = .date
    @State private var sortDirection: HealthSortDirection = .desc
    @State private var showSortSheet = false
    @State private var showFilterSheet = false
    @State private var filters = HealthFilters()
    @State private var isLoading = false
    @State private var logs: [APIClient.DailyHealthLogItem] = []
    @State private var shareItem: ShareItem?
    @State private var showDeleteAlert = false
    @State private var itemToDelete: APIClient.DailyHealthLogItem?
    @State private var deleteErrorMessage: String?
    @State private var showDeleteErrorAlert = false
    @State private var itemToEdit: APIClient.DailyHealthLogItem?

    var body: some View {
        VStack(spacing: 0) {
            controls
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 14)

            contentList
        }
        .navigationTitle("View Health")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    Task { await exportCSV() }
                } label: {
                    Image(systemName: "square.and.arrow.up")
                }
                .disabled(logs.isEmpty)
            }
        }
        .sheet(item: $shareItem) { item in
            ShareSheet(activityItems: [item.url])
        }
        .sheet(isPresented: $showSortSheet) {
            HealthSortSheet(sortField: $sortField, sortDirection: $sortDirection)
                .presentationDetents([.medium])
        }
        .sheet(isPresented: $showFilterSheet) {
            HealthFilterSheet(filters: $filters)
                .presentationDetents([.medium])
        }
        .sheet(item: $itemToEdit) { item in
            if let mId = memberId {
                DailyHealthEditSheet(memberId: mId, item: item) {
                    Task { await loadHealthLogs() }
                }
                .environmentObject(programContext)
            }
        }
        .alert("Delete Daily Health Log", isPresented: $showDeleteAlert, presenting: itemToDelete) { item in
            Button("Delete", role: .destructive) {
                Task { await deleteHealthLog(item) }
            }
            Button("Cancel", role: .cancel) { }
        } message: { item in
            Text("Are you sure you want to delete this daily health log from \(item.logDate)?")
        }
        .alert("Delete Failed", isPresented: $showDeleteErrorAlert) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(deleteErrorMessage ?? "Unable to delete daily health log.")
        }
        .task { await loadHealthLogs() }
        .onChange(of: sortField) { _, _ in Task { await loadHealthLogs() } }
        .onChange(of: sortDirection) { _, _ in Task { await loadHealthLogs() } }
        .onChange(of: filters) { _, _ in Task { await loadHealthLogs() } }
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Button {
                    showSortSheet = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: sortDirection.icon)
                            .font(.footnote.weight(.bold))
                        Text("Sort: \(sortField.label)")
                            .font(.subheadline.weight(.semibold))
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
                        Image(systemName: filters.isActive ? "line.horizontal.3.decrease.circle.fill" : "line.horizontal.3.decrease.circle")
                            .font(.headline)
                        Text("Filter")
                            .font(.subheadline.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(filters.isActive ? Color.appBlueLight : Color(.systemGray6))
                    .cornerRadius(12)
                }
            }

            if filters.isActive {
                HStack(spacing: 8) {
                    Image(systemName: "calendar")
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
                    if let start = filters.startDate {
                        Text(formatDate(start))
                            .font(.caption.weight(.medium))
                    }
                    Text("-")
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
                    if let end = filters.endDate {
                        Text(formatDate(end))
                            .font(.caption.weight(.medium))
                    }
                    if let minS = filters.minSleepHours {
                        Text("·")
                            .font(.caption)
                            .foregroundColor(Color(.secondaryLabel))
                        Text("Sleep ≥\(formatSleepHours(minS))")
                            .font(.caption.weight(.medium))
                    }
                    if let maxS = filters.maxSleepHours {
                        Text("·")
                            .font(.caption)
                            .foregroundColor(Color(.secondaryLabel))
                        Text("Sleep ≤\(formatSleepHours(maxS))")
                            .font(.caption.weight(.medium))
                    }
                    if let minF = filters.minFoodQuality, let maxF = filters.maxFoodQuality {
                        Text("·")
                            .font(.caption)
                            .foregroundColor(Color(.secondaryLabel))
                        Text("Diet \(minF)–\(maxF)")
                            .font(.caption.weight(.medium))
                    } else if let minF = filters.minFoodQuality {
                        Text("·")
                            .font(.caption)
                            .foregroundColor(Color(.secondaryLabel))
                        Text("Diet ≥\(minF)")
                            .font(.caption.weight(.medium))
                    } else if let maxF = filters.maxFoodQuality {
                        Text("·")
                            .font(.caption)
                            .foregroundColor(Color(.secondaryLabel))
                        Text("Diet ≤\(maxF)")
                            .font(.caption.weight(.medium))
                    }
                    if let minSt = filters.minSteps {
                        Text("·")
                            .font(.caption)
                            .foregroundColor(Color(.secondaryLabel))
                        Text("Steps ≥\(stepsLabel(minSt))")
                            .font(.caption.weight(.medium))
                    }
                    if let maxSt = filters.maxSteps {
                        Text("·")
                            .font(.caption)
                            .foregroundColor(Color(.secondaryLabel))
                        Text("Steps ≤\(stepsLabel(maxSt))")
                            .font(.caption.weight(.medium))
                    }
                    Spacer()
                    Button {
                        filters = HealthFilters()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.caption)
                            .foregroundColor(Color(.tertiaryLabel))
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color(.systemGray6))
                .cornerRadius(8)
            }
        }
    }

    private func formatSleepHours(_ hours: Double) -> String {
        let h = Int(hours)
        let m = Int((hours - Double(h)) * 60)
        if h == 0 { return "\(m)m" }
        if m == 0 { return "\(h)h" }
        return "\(h)h \(m)m"
    }

    private var contentList: some View {
        Group {
            if isLoading {
                VStack(spacing: 10) {
                    ForEach(0..<5, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color(.systemGray5))
                            .frame(height: 60)
                            .redacted(reason: .placeholder)
                    }
                }
                .padding(.horizontal, 20)
            } else if logs.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("No daily health logs found.")
                        .font(.subheadline.weight(.semibold))
                    Text("Adjust filters or log daily health to get started.")
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.vertical, 8)
            } else {
                List {
                    ForEach(logs) { item in
                        healthRow(item)
                            .listRowInsets(EdgeInsets(top: 4, leading: 20, bottom: 4, trailing: 20))
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                                // D-C1 web-parity lock: hide Edit when data entry is locked for non-admins.
                                if !programContext.dataEntryLocked {
                                    Button {
                                        itemToEdit = item
                                    } label: {
                                        Label("Edit", systemImage: "pencil")
                                    }
                                    .tint(.appBlue)
                                }
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                // D-C1 web-parity lock: hide Delete when data entry is locked for non-admins.
                                if !programContext.dataEntryLocked {
                                    Button(role: .destructive) {
                                        itemToDelete = item
                                        showDeleteAlert = true
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                            }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
    }

    private func healthRow(_ item: APIClient.DailyHealthLogItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Circle()
                    .fill(Color.appBlueLight)
                    .frame(width: 10, height: 10)
                Text(item.logDate)
                    .font(.subheadline.weight(.semibold))
                Spacer()
            }
            HStack(spacing: 8) {
                metricCell("Sleep", sleepLabel(item.sleepHours))
                metricCell("Diet", foodLabel(item.foodQuality))
                metricCell("Steps", stepsLabel(item.steps))
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(.systemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1)
        )
    }

    private func metricCell(_ label: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(label.uppercased())
                .font(.caption2.weight(.semibold))
                .foregroundColor(Color(.secondaryLabel))
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(Color(.label))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .padding(.horizontal, 4)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color(.systemGray6))
        )
    }

    private func sleepLabel(_ value: Double?) -> String {
        guard let value else { return "—" }
        return String(format: "%.1f hrs", value)
    }

    private func foodLabel(_ value: Int?) -> String {
        guard let value else { return "—" }
        return "\(value)/5"
    }

    private func stepsLabel(_ value: Int?) -> String {
        guard let value else { return "—" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d, yyyy"
        return formatter.string(from: date)
    }

    private func loadHealthLogs() async {
        guard !isLoading else { return }
        guard let mId = memberId else { return }
        isLoading = true
        logs = await programContext.loadMemberHealthLogs(
            memberId: mId,
            limit: 0,
            startDate: filters.startDateString(),
            endDate: filters.endDateString(),
            sortBy: sortField.apiValue,
            sortDir: sortDirection.apiValue,
            minSleepHours: filters.minSleepHours,
            maxSleepHours: filters.maxSleepHours,
            minFoodQuality: filters.minFoodQuality,
            maxFoodQuality: filters.maxFoodQuality,
            minSteps: filters.minSteps,
            maxSteps: filters.maxSteps
        )
        isLoading = false
    }

    private func deleteHealthLog(_ item: APIClient.DailyHealthLogItem) async {
        guard let mId = memberId else { return }
        do {
            try await programContext.deleteDailyHealthLog(
                memberId: mId,
                logDate: item.logDate
            )
            await loadHealthLogs()
        } catch {
            deleteErrorMessage = error.localizedDescription
            showDeleteErrorAlert = true
        }
    }

    private func exportCSV() async {
        guard !logs.isEmpty else { return }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(secondsFromGMT: 0)

        let startLabel = filters.startDate.flatMap { formatter.string(from: $0) } ?? "all"
        let endLabel = filters.endDate.flatMap { formatter.string(from: $0) } ?? "today"
        let exportMemberName = (memberName ?? "Member").replacingOccurrences(of: " ", with: "")
        let fileName = "HealthLogs_\(exportMemberName)_\(startLabel)_to_\(endLabel).csv"

        var csv = "Date,Sleep Hours,Diet Quality,Steps\n"
        for log in logs {
            let sleepValue = log.sleepHours.map { String(format: "%.1f", $0) } ?? ""
            let foodValue = log.foodQuality.map { "\($0)" } ?? ""
            let stepsValue = log.steps.map { "\($0)" } ?? ""
            let line = "\(log.logDate),\(sleepValue),\(foodValue),\(stepsValue)\n"
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

// MARK: - Health Sort Sheet
struct HealthSortSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var sortField: HealthSortField
    @Binding var sortDirection: HealthSortDirection

    var body: some View {
        NavigationView {
            List {
                Section("Sort By") {
                    ForEach(HealthSortField.allCases, id: \.self) { field in
                        Button {
                            sortField = field
                        } label: {
                            HStack {
                                Text(field.label)
                                    .foregroundColor(Color(.label))
                                Spacer()
                                if sortField == field {
                                    Image(systemName: "checkmark")
                                        .foregroundColor(.appBlue)
                                }
                            }
                        }
                    }
                }

                Section("Direction") {
                    ForEach(HealthSortDirection.allCases, id: \.self) { direction in
                        Button {
                            sortDirection = direction
                        } label: {
                            HStack {
                                Image(systemName: direction.icon)
                                    .foregroundColor(Color(.secondaryLabel))
                                Text(direction.label)
                                    .foregroundColor(Color(.label))
                                Spacer()
                                if sortDirection == direction {
                                    Image(systemName: "checkmark")
                                        .foregroundColor(.appBlue)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Sort Options")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }
}

// MARK: - Health Filter Sheet
struct HealthFilterSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var filters: HealthFilters
    @State private var localStartDate: Date = Date()
    @State private var localEndDate: Date = Date()
    @State private var useStartDate: Bool = false
    @State private var useEndDate: Bool = false
    @State private var localMinSleepHours: String = ""
    @State private var localMinSleepMinutes: String = ""
    @State private var localMaxSleepHours: String = ""
    @State private var localMaxSleepMinutes: String = ""
    @State private var localMinDiet: Int = 0  // 0 = Any
    @State private var localMaxDiet: Int = 0
    @State private var localMinSteps: String = ""
    @State private var localMaxSteps: String = ""

    private let dietOptions = [0, 1, 2, 3, 4, 5]

    var body: some View {
        NavigationView {
            List {
                Section("Date Range") {
                    Toggle("Start Date", isOn: $useStartDate)
                    if useStartDate {
                        DatePicker("From", selection: $localStartDate, displayedComponents: .date)
                    }

                    Toggle("End Date", isOn: $useEndDate)
                    if useEndDate {
                        DatePicker("To", selection: $localEndDate, displayedComponents: .date)
                    }
                }

                Section("Sleep") {
                    HStack {
                        Text("Min sleep")
                            .frame(width: 100, alignment: .leading)
                        TextField("0", text: $localMinSleepHours)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.center)
                            .frame(width: 50)
                        Text("hr")
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                        TextField("0", text: $localMinSleepMinutes)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.center)
                            .frame(width: 50)
                        Text("min")
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    HStack {
                        Text("Max sleep")
                            .frame(width: 100, alignment: .leading)
                        TextField("0", text: $localMaxSleepHours)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.center)
                            .frame(width: 50)
                        Text("hr")
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                        TextField("0", text: $localMaxSleepMinutes)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.center)
                            .frame(width: 50)
                        Text("min")
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                }

                Section("Diet (1–5)") {
                    Picker("Min diet", selection: $localMinDiet) {
                        Text("Any").tag(0)
                        ForEach(1...5, id: \.self) { n in
                            Text("\(n)").tag(n)
                        }
                    }
                    Picker("Max diet", selection: $localMaxDiet) {
                        Text("Any").tag(0)
                        ForEach(1...5, id: \.self) { n in
                            Text("\(n)").tag(n)
                        }
                    }
                }

                Section("Steps") {
                    HStack {
                        Text("Min steps")
                            .frame(width: 100, alignment: .leading)
                        TextField("0", text: $localMinSteps)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.center)
                            .onChange(of: localMinSteps) { _, newValue in
                                localMinSteps = String(newValue.filter(\.isNumber))
                            }
                    }
                    HStack {
                        Text("Max steps")
                            .frame(width: 100, alignment: .leading)
                        TextField("0", text: $localMaxSteps)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.center)
                            .onChange(of: localMaxSteps) { _, newValue in
                                localMaxSteps = String(newValue.filter(\.isNumber))
                            }
                    }
                }

                if filters.isActive {
                    Section {
                        Button("Clear All Filters", role: .destructive) {
                            filters = HealthFilters()
                            useStartDate = false
                            useEndDate = false
                            localMinSleepHours = ""
                            localMinSleepMinutes = ""
                            localMaxSleepHours = ""
                            localMaxSleepMinutes = ""
                            localMinDiet = 0
                            localMaxDiet = 0
                            localMinSteps = ""
                            localMaxSteps = ""
                        }
                    }
                }
            }
            .navigationTitle("Filter Options")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Apply") {
                        applyFilters()
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
            .onAppear {
                if let start = filters.startDate {
                    localStartDate = start
                    useStartDate = true
                }
                if let end = filters.endDate {
                    localEndDate = end
                    useEndDate = true
                }
                if let minS = filters.minSleepHours {
                    localMinSleepHours = "\(Int(minS))"
                    localMinSleepMinutes = "\(Int((minS - floor(minS)) * 60))"
                }
                if let maxS = filters.maxSleepHours {
                    localMaxSleepHours = "\(Int(maxS))"
                    localMaxSleepMinutes = "\(Int((maxS - floor(maxS)) * 60))"
                }
                localMinDiet = filters.minFoodQuality ?? 0
                localMaxDiet = filters.maxFoodQuality ?? 0
                localMinSteps = filters.minSteps.map { "\($0)" } ?? ""
                localMaxSteps = filters.maxSteps.map { "\($0)" } ?? ""
            }
        }
    }

    private func applyFilters() {
        filters.startDate = useStartDate ? localStartDate : nil
        filters.endDate = useEndDate ? localEndDate : nil
        let minSleepTotal = (Double(localMinSleepHours) ?? 0) + (Double(localMinSleepMinutes) ?? 0) / 60
        let maxSleepTotal = (Double(localMaxSleepHours) ?? 0) + (Double(localMaxSleepMinutes) ?? 0) / 60
        filters.minSleepHours = minSleepTotal > 0 ? minSleepTotal : nil
        filters.maxSleepHours = maxSleepTotal > 0 ? maxSleepTotal : nil
        filters.minFoodQuality = localMinDiet >= 1 && localMinDiet <= 5 ? localMinDiet : nil
        filters.maxFoodQuality = localMaxDiet >= 1 && localMaxDiet <= 5 ? localMaxDiet : nil
        let minStepsValue = Int(localMinSteps) ?? 0
        let maxStepsValue = Int(localMaxSteps) ?? 0
        filters.minSteps = minStepsValue > 0 ? minStepsValue : nil
        filters.maxSteps = maxStepsValue > 0 ? maxStepsValue : nil
    }
}

struct DailyHealthEditSheet: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss
    let memberId: String
    let item: APIClient.DailyHealthLogItem
    let onSaved: () -> Void

    @State private var sleepHoursText: String
    @State private var sleepMinutesText: String
    @State private var foodQuality: Int?
    @State private var stepsText: String
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showErrorAlert = false

    init(memberId: String, item: APIClient.DailyHealthLogItem, onSaved: @escaping () -> Void) {
        self.memberId = memberId
        self.item = item
        self.onSaved = onSaved
        let split = Self.splitSleepHours(item.sleepHours)
        _sleepHoursText = State(initialValue: split.hours)
        _sleepMinutesText = State(initialValue: split.minutes)
        _foodQuality = State(initialValue: item.foodQuality)
        _stepsText = State(initialValue: item.steps.map { "\($0)" } ?? "")
    }

    private var trimmedSleepHoursText: String {
        sleepHoursText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedSleepMinutesText: String {
        sleepMinutesText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var hasSleepInput: Bool {
        !trimmedSleepHoursText.isEmpty || !trimmedSleepMinutesText.isEmpty
    }

    private var sleepHoursValue: Int? {
        guard !trimmedSleepHoursText.isEmpty else { return nil }
        return Int(trimmedSleepHoursText)
    }

    private var sleepMinutesValue: Int? {
        guard !trimmedSleepMinutesText.isEmpty else { return nil }
        return Int(trimmedSleepMinutesText)
    }

    private var isHoursValid: Bool {
        trimmedSleepHoursText.isEmpty || (sleepHoursValue != nil && (0...24).contains(sleepHoursValue ?? 0))
    }

    private var isMinutesValid: Bool {
        trimmedSleepMinutesText.isEmpty || (sleepMinutesValue != nil && (0...59).contains(sleepMinutesValue ?? 0))
    }

    private var sleepValue: Double? {
        guard hasSleepInput else { return nil }
        guard isHoursValid && isMinutesValid else { return nil }
        let hours = Double(sleepHoursValue ?? 0)
        let minutes = Double(sleepMinutesValue ?? 0)
        let total = hours + minutes / 60.0
        guard total >= 0 && total <= 24 else { return nil }
        return total
    }

    private var isSleepValid: Bool {
        !hasSleepInput || sleepValue != nil
    }

    private var trimmedStepsText: String {
        stepsText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Steps value: nil when blank (clears), else the parsed non-negative integer.
    private var stepsValue: Int? {
        guard !trimmedStepsText.isEmpty else { return nil }
        return Int(trimmedStepsText)
    }

    private var isStepsValid: Bool {
        trimmedStepsText.isEmpty || (stepsValue != nil && (stepsValue ?? -1) >= 0)
    }

    private var hasStepsInput: Bool { !trimmedStepsText.isEmpty }

    private var hasAtLeastOneMetric: Bool {
        sleepValue != nil || foodQuality != nil || (hasStepsInput && stepsValue != nil)
    }

    private var isFormValid: Bool {
        isSleepValid && isStepsValid && hasAtLeastOneMetric
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Edit daily health")
                        .font(.title2.weight(.bold))
                        .foregroundColor(Color(.label))
                    Text(item.logDate)
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Sleep time")
                        .font(.subheadline.weight(.semibold))
                    HStack(spacing: 12) {
                        TextField("Hours", text: $sleepHoursText)
                            .keyboardType(.numberPad)
                            .padding()
                            .frame(maxWidth: .infinity)
                            .background(Color(.systemGray6))
                            .cornerRadius(12)
                            .onChange(of: sleepHoursText) { _, newValue in
                                let sanitized = sanitizeDigits(newValue)
                                if sanitized != newValue {
                                    sleepHoursText = sanitized
                                }
                            }
                        TextField("Minutes", text: $sleepMinutesText)
                            .keyboardType(.numberPad)
                            .padding()
                            .frame(maxWidth: .infinity)
                            .background(Color(.systemGray6))
                            .cornerRadius(12)
                            .onChange(of: sleepMinutesText) { _, newValue in
                                let sanitized = sanitizeDigits(newValue)
                                if sanitized != newValue {
                                    sleepMinutesText = sanitized
                                }
                            }
                    }
                    if !isSleepValid {
                        Text("Sleep time must be between 0:00 and 24:00.")
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(.appRed)
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Diet quality")
                        .font(.subheadline.weight(.semibold))
                    Menu {
                        ForEach(1...5, id: \.self) { rating in
                            Button("\(rating)") {
                                foodQuality = rating
                            }
                        }
                        Button("Clear") { foodQuality = nil }
                    } label: {
                        HStack {
                            Text(foodQuality.map { "\($0)" } ?? "Select rating (1-5)")
                                .foregroundColor(foodQuality == nil ? Color(.tertiaryLabel) : Color(.label))
                            Spacer()
                            Image(systemName: "chevron.up.chevron.down")
                                .foregroundColor(Color(.tertiaryLabel))
                        }
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(.systemGray6))
                        .cornerRadius(12)
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Steps")
                        .font(.subheadline.weight(.semibold))
                    TextField("Steps", text: $stepsText)
                        .keyboardType(.numberPad)
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(Color(.systemGray6))
                        .cornerRadius(12)
                        .onChange(of: stepsText) { _, newValue in
                            let sanitized = String(newValue.filter(\.isNumber))
                            if sanitized != newValue {
                                stepsText = sanitized
                            }
                        }
                }

                Button(action: { Task { await save() } }) {
                    Group {
                        if isSaving {
                            ProgressView().tint(.white)
                        } else {
                            Text("Save changes")
                                .font(.headline.weight(.semibold))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(isFormValid ? Color.appBlue : Color(.systemGray3))
                    .foregroundColor(.white)
                    .cornerRadius(14)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(isSaving || !isFormValid)
            }
            .padding(20)
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .alert("Unable to save", isPresented: $showErrorAlert) {
            Button("OK") { showErrorAlert = false }
        } message: {
            Text(errorMessage ?? "Something went wrong.")
        }
    }

    private func save() async {
        guard isFormValid else { return }
        isSaving = true
        errorMessage = nil
        do {
            try await programContext.updateDailyHealthLog(
                memberId: memberId,
                logDate: item.logDate,
                sleepHours: sleepValue,
                foodQuality: foodQuality,
                steps: stepsValue
            )
            onSaved()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
            showErrorAlert = true
        }

        isSaving = false
    }

    private static func splitSleepHours(_ value: Double?) -> (hours: String, minutes: String) {
        guard let value else { return ("", "") }
        let clamped = min(max(value, 0), 24)
        var hours = Int(clamped)
        var minutes = Int((clamped - Double(hours)) * 60.0 + 0.5)
        if minutes == 60 {
            hours = min(hours + 1, 24)
            minutes = 0
        }
        if hours >= 24 {
            hours = 24
            minutes = 0
        }
        return (String(hours), String(minutes))
    }

    private func sanitizeDigits(_ value: String) -> String {
        let filtered = value.filter { $0.isNumber }
        return String(filtered.prefix(2))
    }
}
