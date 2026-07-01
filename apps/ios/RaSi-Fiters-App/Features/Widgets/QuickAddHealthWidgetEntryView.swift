//
//  QuickAddHealthWidgetEntryView.swift
//  RaSi-Fiters-App
//
//  The widget deep-link target for "Quick Add Daily Health" — a multi-program form that logs the
//  SAME daily-health metrics (sleep + diet quality) across every selected active program (with
//  per-program partial-failure rollback), reached when `AppRootView` presents
//  `WidgetRoute.quickAddHealth`. Ported run 65 (question-asker).
//
//  Stance: faithful 1:1 to the legacy iOS view (multi-program select + shared-member intersection +
//  sanitized sleep + at-least-one-metric + save loop + rollback + exit-to-My-Programs) + 3
//  deviations: D-C1 per-program admin_only_data_entry lock, D-C2 shared chrome, D-C3 shared scaffold
//  (WidgetQuickAddComponents). The write twin of QuickAddWorkoutWidgetEntryView. iOS-only (no web).
//  Reference: ios-mobile/RaSi-Fiters-App/Features/Widgets/QuickAddHealthWidgetEntryView.swift
//

import SwiftUI

struct QuickAddHealthWidgetEntryView: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss

    @State private var selectedProgramIds: Set<String> = []
    @State private var selectedMemberId: String?
    @State private var selectedDate: Date = Date()
    @State private var sleepHoursText: String = ""
    @State private var sleepMinutesText: String = ""
    @State private var foodQuality: Int?
    @State private var isSaving = false
    @State private var isLoadingDetails = false
    @State private var errorMessage: String?
    @State private var showSuccessToast = false
    @State private var showMemberPicker = false
    @State private var programMembers: [String: [APIClient.MembershipDetailDTO]] = [:]

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    WidgetQuickAddHeader(
                        title: "Quick Add Daily Health",
                        subtitle: "Log the same daily health metrics across selected programs.",
                        onBack: { exitToMyPrograms() }
                    )
                    WidgetProgramSelector(
                        activePrograms: activePrograms,
                        selectedProgramIds: $selectedProgramIds,
                        isLoadingDetails: isLoadingDetails,
                        isGlobalAdmin: programContext.isGlobalAdmin,
                        onToggle: { toggleProgram($0) }
                    )
                    WidgetMemberField(
                        canSelectAnyMember: canSelectAnyMember,
                        availableMembers: availableMembers,
                        selectedMemberName: selectedMemberName,
                        fallbackName: programContext.loggedInUserName ?? "You",
                        noProgramsSelected: selectedProgramIds.isEmpty,
                        onTapPicker: { showMemberPicker = true }
                    )
                    dateField
                    sleepField
                    foodQualityField

                    if let errorMessage {
                        Text(errorMessage)
                            .foregroundColor(.appRed)
                            .font(.footnote.weight(.semibold))
                    }

                    saveButton
                }
                .padding(20)
            }

            if showSuccessToast {
                WidgetSuccessToast(text: "Daily health logged")
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .padding(.bottom, 16)
            }
        }
        .adaptiveBackground(topLeading: true)
        .navigationBarBackButtonHidden(true)
        .interactiveDismissDisabled(true)
        .task {
            await loadInitialData()
        }
        .onChange(of: selectedProgramIds) { _, _ in
            Task { await loadSelectedProgramData() }
        }
        .sheet(isPresented: $showMemberPicker) {
            SearchablePickerSheet(
                title: "Select Member",
                options: availableMembers.map {
                    SearchablePickerSheet.PickerOption(id: $0.id, label: $0.name)
                },
                selectedId: selectedMemberId,
                onSelect: { option in
                    selectedMemberId = option.id
                }
            )
            .presentationDetents([.medium, .large])
        }
    }

    private var dateField: some View {
        VStack(alignment: .leading, spacing: 6) {
            LogFieldLabel("Date")
            DatePicker("", selection: $selectedDate, in: ...Date(), displayedComponents: .date)
                .labelsHidden()
                .datePickerStyle(.compact)
                .padding(.horizontal)
                .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                .overlay(
                    RoundedRectangle(cornerRadius: AppCornerRadius.md, style: .continuous)
                        .stroke(Color(.systemGray3), lineWidth: 1)
                )
        }
    }

    private var sleepField: some View {
        VStack(alignment: .leading, spacing: 6) {
            LogFieldLabel("Sleep time")
            HStack(spacing: 12) {
                AppInputField(title: "Hours", text: $sleepHoursText, keyboardType: .numberPad)
                    .onChange(of: sleepHoursText) { _, newValue in
                        let sanitized = sanitizeDigits(newValue)
                        if sanitized != newValue {
                            sleepHoursText = sanitized
                        }
                    }
                AppInputField(title: "Minutes", text: $sleepMinutesText, keyboardType: .numberPad)
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
    }

    private var foodQualityField: some View {
        VStack(alignment: .leading, spacing: 6) {
            LogFieldLabel("Diet quality")
            Menu {
                ForEach(1...5, id: \.self) { rating in
                    Button("\(rating)") {
                        foodQuality = rating
                    }
                }
                Button("Clear") { foodQuality = nil }
            } label: {
                LogFieldRow(
                    text: foodQuality.map { "\($0)" } ?? "Select rating (1-5)",
                    isPlaceholder: foodQuality == nil,
                    systemIcon: "chevron.up.chevron.down"
                )
            }
        }
    }

    private var saveButton: some View {
        AppPrimaryButton(title: isSaving ? "Saving…" : "Save daily log", isLoading: isSaving) {
            Task { await save() }
        }
        .frame(maxWidth: .infinity)
        .disabled(!isFormValid || isSaving)
        .opacity(isFormValid && !isSaving ? 1 : 0.5)
        .padding(.top, 4)
    }

    private var activePrograms: [APIClient.ProgramDTO] {
        programContext.programs.filter { ($0.my_status ?? "").lowercased() == "active" }
    }

    private var selectedPrograms: [APIClient.ProgramDTO] {
        activePrograms.filter { selectedProgramIds.contains($0.id) }
    }

    private var canSelectAnyMember: Bool {
        guard !selectedProgramIds.isEmpty else { return false }
        if programContext.isGlobalAdmin { return true }
        if selectedProgramIds.count == 1 {
            let role = selectedPrograms.first?.my_role?.lowercased() ?? ""
            return role == "admin" || role == "logger"
        }
        return !selectedPrograms.contains { ($0.my_role ?? "").lowercased() != "admin" }
    }

    private var availableMembers: [WidgetMemberOption] {
        guard !selectedProgramIds.isEmpty else { return [] }
        let lists = selectedProgramIds.compactMap { programMembers[$0] }
        guard lists.count == selectedProgramIds.count, let first = lists.first else { return [] }
        var intersection = Set(first.map { $0.member_id })
        for list in lists.dropFirst() {
            intersection.formIntersection(list.map { $0.member_id })
        }
        return first
            .filter { intersection.contains($0.member_id) }
            .map { WidgetMemberOption(id: $0.member_id, name: $0.member_name) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private var selectedMemberName: String? {
        availableMembers.first(where: { $0.id == selectedMemberId })?.name
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

    private var hasAtLeastOneMetric: Bool {
        sleepValue != nil || foodQuality != nil
    }

    private var isFormValid: Bool {
        guard !selectedProgramIds.isEmpty else { return false }
        guard resolvedMemberId != nil else { return false }
        return isSleepValid && hasAtLeastOneMetric
    }

    private var resolvedMemberId: String? {
        if canSelectAnyMember {
            return selectedMemberId
        }
        return programContext.loggedInUserId
    }

    private var resolvedMemberName: String? {
        if canSelectAnyMember {
            return selectedMemberName
        }
        return programContext.loggedInUserName ?? "You"
    }

    private func toggleProgram(_ programId: String) {
        if selectedProgramIds.contains(programId) {
            selectedProgramIds.remove(programId)
        } else {
            selectedProgramIds.insert(programId)
        }
        syncSelectionsAfterDataLoad()
    }

    @MainActor
    private func loadInitialData() async {
        if programContext.programs.isEmpty {
            await programContext.loadLookupData()
        }
        syncSelectionsAfterDataLoad()
    }

    @MainActor
    private func loadSelectedProgramData() async {
        guard let token = programContext.authToken, !token.isEmpty else { return }
        guard !selectedProgramIds.isEmpty else {
            syncSelectionsAfterDataLoad()
            return
        }

        isLoadingDetails = true
        let selectedIds = Array(selectedProgramIds)

        for programId in selectedIds {
            if programMembers[programId] == nil {
                do {
                    let data = try await APIClient.shared.fetchMembershipDetails(token: token, programId: programId)
                    programMembers[programId] = data.filter { $0.is_active }
                } catch {
                    errorMessage = error.localizedDescription
                }
            }
        }

        isLoadingDetails = false
        syncSelectionsAfterDataLoad()
    }

    @MainActor
    private func save() async {
        guard let token = programContext.authToken, !token.isEmpty else { return }
        guard !selectedProgramIds.isEmpty else {
            errorMessage = "Select at least one program."
            return
        }
        guard let memberId = resolvedMemberId,
              let _ = resolvedMemberName else {
            return
        }

        isSaving = true
        errorMessage = nil
        showSuccessToast = false

        let dateString = LogDateFormatter.string(from: selectedDate)

        var completedPrograms: [String] = []
        do {
            for programId in selectedProgramIds.sorted() {
                try await APIClient.shared.addDailyHealthLog(
                    token: token,
                    programId: programId,
                    memberId: memberId,
                    logDate: dateString,
                    sleepHours: sleepValue,
                    foodQuality: foodQuality
                )
                completedPrograms.append(programId)
            }

            showSuccessToast = true
            scheduleSuccessDismiss()
        } catch {
            if !completedPrograms.isEmpty {
                let rollbackFailed = await rollbackLogs(
                    programIds: completedPrograms,
                    token: token,
                    memberId: memberId,
                    dateString: dateString
                )
                if rollbackFailed {
                    errorMessage = "Couldn’t save. Some programs may have been updated. Please review My Programs."
                } else {
                    errorMessage = friendlyError(for: error)
                }
            } else {
                errorMessage = friendlyError(for: error)
            }
        }

        isSaving = false
    }

    private func friendlyError(for error: Error) -> String {
        let message = error.localizedDescription.lowercased()
        if message.contains("network") || message.contains("offline") || message.contains("connection") {
            return "Couldn’t save. Try again."
        }
        if message.contains("already") || message.contains("exists") || message.contains("duplicate") {
            return "Daily health log already exists for at least one selected program."
        }
        return error.localizedDescription
    }

    @MainActor
    private func rollbackLogs(
        programIds: [String],
        token: String,
        memberId: String,
        dateString: String
    ) async -> Bool {
        var failed = false
        for programId in programIds {
            do {
                try await APIClient.shared.deleteDailyHealthLog(
                    token: token,
                    programId: programId,
                    memberId: memberId,
                    logDate: dateString
                )
            } catch {
                failed = true
            }
        }
        return failed
    }

    @MainActor
    private func scheduleSuccessDismiss() {
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_400_000_000)
            exitToMyPrograms()
        }
    }

    @MainActor
    private func syncSelectionsAfterDataLoad() {
        // Faithful active-program filter + the D-C1 lock filter (see the workout twin). Guarded so a
        // transient empty `activePrograms` (mid-reload) doesn't wipe the selection.
        let activeIds = Set(activePrograms.map { $0.id })
        if !activeIds.isEmpty {
            let loggableIds = Set(
                activePrograms
                    .filter { !widgetProgramLockedForLogging($0, isGlobalAdmin: programContext.isGlobalAdmin) }
                    .map { $0.id }
            )
            selectedProgramIds = selectedProgramIds.intersection(loggableIds)
        }

        if !canSelectAnyMember {
            selectedMemberId = programContext.loggedInUserId
        } else if let selectedMemberId, !availableMembers.contains(where: { $0.id == selectedMemberId }) {
            self.selectedMemberId = nil
        }
    }

    private func sanitizeDigits(_ value: String) -> String {
        let filtered = value.filter { $0.isNumber }
        return String(filtered.prefix(2))
    }

    @MainActor
    private func exitToMyPrograms() {
        programContext.returnToMyPrograms = true
        programContext.widgetRoute = nil
        dismiss()
    }
}

#Preview {
    QuickAddHealthWidgetEntryView()
}
