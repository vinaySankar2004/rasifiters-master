//
//  AddWorkoutDetailView.swift
//  RaSi-Fiters-App
//
//  Summary "Add workout" card → the log-a-workout form. The iOS analogue of
//  web /summary/log-workout. Ported run 60 via question-asker (faithful 1:1 to the
//  legacy iOS form + web parity: the admin_only_data_entry mount guard [D-C1],
//  shared chrome [D-C2], success refresh [D-C3], inline errors [D-C4]).
//  Reference: ../../ios-mobile/.../Features/Home/Helpers/AdminHomeHelpers.swift (AddWorkoutDetailView).
//

import SwiftUI

struct AddWorkoutDetailView: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss

    @State private var selectedMember: APIClient.MemberDTO?
    @State private var selectedWorkoutName: String?
    @State private var selectedDate = Date()
    @State private var durationHoursText = ""
    @State private var durationMinutesText = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showMemberPicker = false
    @State private var showWorkoutPicker = false

    // MARK: - Derived

    /// Admins/loggers (and global admins) may log for any member; a plain member logs only for themselves.
    private var canSelectAnyMember: Bool {
        programContext.globalRole == "global_admin"
            || programContext.loggedInUserProgramRole == "admin"
            || programContext.loggedInUserProgramRole == "logger"
    }

    private var workoutOptions: [String] {
        if programContext.programId != nil {
            return programContext.programWorkouts.filter { !$0.is_hidden }.map { $0.workout_name }
        }
        return programContext.workouts.map { $0.workout_name }
    }

    private var computedDurationMinutes: Int {
        (Int(durationHoursText) ?? 0) * 60 + (Int(durationMinutesText) ?? 0)
    }

    private var isFormValid: Bool {
        selectedMember != nil && selectedWorkoutName != nil && computedDurationMinutes > 0
    }

    // MARK: - Body

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppSpacing.lg) {
                Text("Log a completed workout.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                LogFieldLabel("Member")
                memberField

                LogFieldLabel("Workout")
                Button { showWorkoutPicker = true } label: {
                    LogFieldRow(text: selectedWorkoutName ?? "Select workout",
                                isPlaceholder: selectedWorkoutName == nil,
                                systemIcon: "chevron.up.chevron.down")
                }

                LogFieldLabel("Date")
                DatePicker("", selection: $selectedDate, displayedComponents: .date)
                    .labelsHidden()
                    .datePickerStyle(.compact)

                LogFieldLabel("Duration")
                HStack(spacing: AppSpacing.md) {
                    AppInputField(title: "Hours", text: $durationHoursText, keyboardType: .numberPad)
                    AppInputField(title: "Minutes", text: $durationMinutesText, keyboardType: .numberPad)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundColor(.appRed)
                }

                AppPrimaryButton(title: isSaving ? "Saving…" : "Save workout", isLoading: isSaving) {
                    Task { await save() }
                }
                .frame(maxWidth: .infinity)
                .disabled(!isFormValid || isSaving)
                .opacity(isFormValid && !isSaving ? 1 : 0.5)
                .padding(.top, AppSpacing.sm)
            }
            .padding(20)
        }
        .navigationTitle("Add workout")
        .navigationBarTitleDisplayMode(.inline)
        .adaptiveBackground()
        .task {
            // Web parity (router.replace("/summary")): a locked non-admin never sees the form (D-C1).
            if programContext.dataEntryLocked { dismiss(); return }
            await ensureLookups()
        }
        .sheet(isPresented: $showMemberPicker) {
            SearchablePickerSheet(
                title: "Select member",
                options: programContext.members.map { .init(id: $0.id, label: $0.member_name) },
                selectedId: selectedMember?.id
            ) { option in
                selectedMember = programContext.members.first { $0.id == option.id }
            }
        }
        .sheet(isPresented: $showWorkoutPicker) {
            SearchablePickerSheet(
                title: "Select workout",
                options: workoutOptions.map { .init(id: $0, label: $0) },
                selectedId: selectedWorkoutName
            ) { option in
                selectedWorkoutName = option.id
            }
        }
    }

    @ViewBuilder
    private var memberField: some View {
        if canSelectAnyMember {
            Button { showMemberPicker = true } label: {
                LogFieldRow(text: selectedMember?.member_name ?? "Select member",
                            isPlaceholder: selectedMember == nil,
                            systemIcon: "chevron.up.chevron.down")
            }
        } else {
            LogFieldRow(text: selectedMember?.member_name ?? programContext.loggedInUserName ?? "You",
                        isPlaceholder: false,
                        systemIcon: "lock.fill",
                        locked: true)
        }
    }

    // MARK: - Actions

    private func ensureLookups() async {
        let needsRefresh = programContext.membersProgramId != programContext.programId
        if programContext.members.isEmpty || programContext.workouts.isEmpty || needsRefresh {
            await programContext.loadLookupData()
        }
        if programContext.programId != nil {
            await programContext.loadProgramWorkouts()
        }
        // Auto-select the logged-in user when they can only log for themselves.
        if !canSelectAnyMember, selectedMember == nil, let userId = programContext.loggedInUserId {
            selectedMember = programContext.members.first { $0.id == userId }
        }
    }

    private func save() async {
        guard let token = programContext.authToken,
              let member = selectedMember,
              let workoutName = selectedWorkoutName else { return }
        isSaving = true
        errorMessage = nil
        do {
            try await APIClient.shared.addWorkoutLog(
                token: token,
                memberName: member.member_name,
                workoutName: workoutName,
                date: LogDateFormatter.string(from: selectedDate),
                durationMinutes: computedDurationMinutes,
                programId: programContext.programId,
                memberId: member.id
            )
            programContext.summaryRefreshToken += 1  // web parity: ≈ invalidateQueries(["summary"]) (D-C3)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
            isSaving = false
        }
    }
}
