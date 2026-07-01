//
//  QuickAddWorkoutWidgetEntryView.swift
//  RaSi-Fiters-App
//
//  The widget deep-link target for "Quick Add Workout" — a multi-program form that logs the SAME
//  workout across every selected active program (with per-program partial-failure rollback), reached
//  when `AppRootView` presents `WidgetRoute.quickAddWorkout`. Ported run 65 (question-asker).
//
//  Stance: faithful 1:1 to the legacy iOS view (multi-program select + shared-member/-workout
//  intersection + save loop + rollback + exit-to-My-Programs) + 3 deviations: D-C1 per-program
//  admin_only_data_entry lock, D-C2 shared chrome (LogFieldLabel/LogFieldRow/AppInputField/
//  AppPrimaryButton), D-C3 shared scaffold (WidgetQuickAddComponents). iOS-only (no web sibling).
//  Reference: ios-mobile/RaSi-Fiters-App/Features/Widgets/QuickAddWorkoutWidgetEntryView.swift
//

import SwiftUI

struct QuickAddWorkoutWidgetEntryView: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss

    @State private var selectedProgramIds: Set<String> = []
    @State private var selectedMemberId: String?
    @State private var selectedWorkoutName: String = ""
    @State private var selectedDate: Date = Date()
    @State private var durationHoursText: String = ""
    @State private var durationMinutesText: String = ""
    @State private var isSaving = false
    @State private var isLoadingDetails = false
    @State private var errorMessage: String?
    @State private var showSuccessToast = false
    @State private var showMemberPicker = false
    @State private var showWorkoutPicker = false
    @State private var programMembers: [String: [APIClient.MembershipDetailDTO]] = [:]
    @State private var programWorkouts: [String: [APIClient.ProgramWorkoutDTO]] = [:]

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    WidgetQuickAddHeader(
                        title: "Quick Add Workout",
                        subtitle: "Log the same workout across selected programs.",
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
                    workoutField
                    dateField
                    durationField

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
                WidgetSuccessToast(text: "Workout logged")
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
        .sheet(isPresented: $showWorkoutPicker) {
            SearchablePickerSheet(
                title: "Select Workout",
                options: availableWorkouts.map {
                    SearchablePickerSheet.PickerOption(id: $0, label: $0)
                },
                selectedId: selectedWorkoutName.isEmpty ? nil : selectedWorkoutName,
                onSelect: { option in
                    selectedWorkoutName = option.label
                }
            )
            .presentationDetents([.medium, .large])
        }
    }

    private var workoutField: some View {
        VStack(alignment: .leading, spacing: 6) {
            LogFieldLabel("Workout type")

            if availableWorkouts.isEmpty {
                let helperText = selectedProgramIds.isEmpty
                    ? "Select programs first"
                    : "No shared workouts across selected programs"
                LogFieldRow(text: helperText, isPlaceholder: true,
                            systemIcon: "chevron.up.chevron.down", locked: true)
            } else {
                Button {
                    showWorkoutPicker = true
                } label: {
                    LogFieldRow(
                        text: selectedWorkoutName.isEmpty ? "Select workout" : selectedWorkoutName,
                        isPlaceholder: selectedWorkoutName.isEmpty,
                        systemIcon: "chevron.up.chevron.down"
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var dateField: some View {
        VStack(alignment: .leading, spacing: 6) {
            LogFieldLabel("Date")
            DatePicker("", selection: $selectedDate, displayedComponents: .date)
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

    private var computedDurationMinutes: Int {
        (Int(durationHoursText) ?? 0) * 60 + (Int(durationMinutesText) ?? 0)
    }

    private var durationField: some View {
        VStack(alignment: .leading, spacing: 6) {
            LogFieldLabel("Duration")
            HStack(spacing: 12) {
                AppInputField(title: "Hours", text: $durationHoursText, keyboardType: .numberPad)
                AppInputField(title: "Minutes", text: $durationMinutesText, keyboardType: .numberPad)
            }
        }
    }

    private var saveButton: some View {
        AppPrimaryButton(title: isSaving ? "Saving…" : "Save workout", isLoading: isSaving) {
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

    private var availableWorkouts: [String] {
        guard !selectedProgramIds.isEmpty else { return [] }
        let lists = selectedProgramIds.compactMap { programWorkouts[$0] }
        guard lists.count == selectedProgramIds.count, let first = lists.first else { return [] }
        var intersection = Set(first.map { $0.workout_name })
        for list in lists.dropFirst() {
            intersection.formIntersection(list.map { $0.workout_name })
        }
        return first
            .map { $0.workout_name }
            .filter { intersection.contains($0) }
            .sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    private var selectedMemberName: String? {
        availableMembers.first(where: { $0.id == selectedMemberId })?.name
    }

    private var isFormValid: Bool {
        guard !selectedProgramIds.isEmpty else { return false }
        guard resolvedMemberId != nil else { return false }
        guard !selectedWorkoutName.isEmpty else { return false }
        return computedDurationMinutes > 0
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

            if programWorkouts[programId] == nil {
                do {
                    let data = try await APIClient.shared.fetchProgramWorkouts(token: token, programId: programId)
                    programWorkouts[programId] = data.filter { !$0.is_hidden }
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
        let duration = computedDurationMinutes
        guard let memberId = resolvedMemberId,
              let memberName = resolvedMemberName,
              !selectedWorkoutName.isEmpty,
              duration > 0 else {
            return
        }

        isSaving = true
        errorMessage = nil
        showSuccessToast = false

        let dateString = LogDateFormatter.string(from: selectedDate)

        var completedPrograms: [String] = []
        do {
            for programId in selectedProgramIds.sorted() {
                try await APIClient.shared.addWorkoutLog(
                    token: token,
                    memberName: memberName,
                    workoutName: selectedWorkoutName,
                    date: dateString,
                    durationMinutes: duration,
                    programId: programId,
                    memberId: memberId
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
                    workoutName: selectedWorkoutName,
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
            return "Workout already logged for at least one selected program."
        }
        return error.localizedDescription
    }

    @MainActor
    private func rollbackLogs(
        programIds: [String],
        token: String,
        memberId: String,
        workoutName: String,
        dateString: String
    ) async -> Bool {
        var failed = false
        for programId in programIds {
            do {
                try await APIClient.shared.deleteWorkoutLog(
                    token: token,
                    programId: programId,
                    memberId: memberId,
                    workoutName: workoutName,
                    date: dateString
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
        // Faithful active-program filter + the D-C1 lock filter: drop any selected program that is
        // no longer active OR is now locked for this viewer. Guarded so a transient empty
        // `activePrograms` (mid-reload) doesn't wipe the selection.
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

        if !availableWorkouts.contains(selectedWorkoutName) {
            selectedWorkoutName = ""
        }
    }

    @MainActor
    private func exitToMyPrograms() {
        programContext.returnToMyPrograms = true
        programContext.widgetRoute = nil
        dismiss()
    }
}

#Preview {
    QuickAddWorkoutWidgetEntryView()
}
