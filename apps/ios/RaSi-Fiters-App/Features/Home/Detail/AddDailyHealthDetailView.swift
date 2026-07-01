//
//  AddDailyHealthDetailView.swift
//  RaSi-Fiters-App
//
//  Summary "Log daily health" card → the sleep/diet log form. The iOS analogue of
//  web /summary/log-health. Ported run 60 via question-asker (faithful 1:1 to the legacy
//  iOS form + web parity: the admin_only_data_entry mount guard [D-C1], shared chrome [D-C2],
//  success refresh [D-C3], inline errors [D-C4] — dropping the legacy error/success Alerts).
//  Reference: ios-mobile/.../Features/Home/Helpers/AdminHomeHelpers.swift (AddDailyHealthDetailView).
//

import SwiftUI

struct AddDailyHealthDetailView: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss

    @State private var selectedMember: APIClient.MemberDTO?
    @State private var selectedDate = Date()
    @State private var sleepHoursText = ""
    @State private var sleepMinutesText = ""
    @State private var foodQuality: Int?
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showMemberPicker = false

    // MARK: - Derived

    private var canSelectAnyMember: Bool {
        programContext.globalRole == "global_admin"
            || programContext.loggedInUserProgramRole == "admin"
            || programContext.loggedInUserProgramRole == "logger"
    }

    private var trimmedHours: String { sleepHoursText.trimmingCharacters(in: .whitespaces) }
    private var trimmedMinutes: String { sleepMinutesText.trimmingCharacters(in: .whitespaces) }
    private var hasSleepInput: Bool { !trimmedHours.isEmpty || !trimmedMinutes.isEmpty }

    private var isHoursValid: Bool {
        if trimmedHours.isEmpty { return true }
        guard let h = Int(trimmedHours) else { return false }
        return (0...24).contains(h)
    }

    private var isMinutesValid: Bool {
        if trimmedMinutes.isEmpty { return true }
        guard let m = Int(trimmedMinutes) else { return false }
        return (0...59).contains(m)
    }

    /// Combined sleep as fractional hours, or nil when no sleep was entered.
    private var sleepValue: Double? {
        guard hasSleepInput else { return nil }
        let h = Int(trimmedHours) ?? 0
        let m = Int(trimmedMinutes) ?? 0
        return Double(h) + Double(m) / 60.0
    }

    private var isSleepValid: Bool {
        if !hasSleepInput { return true }
        guard isHoursValid, isMinutesValid, let v = sleepValue else { return false }
        return v >= 0 && v <= 24
    }

    private var hasAtLeastOneMetric: Bool { sleepValue != nil || foodQuality != nil }

    private var isFormValid: Bool {
        selectedMember != nil
            && programContext.programId != nil
            && isSleepValid
            && hasAtLeastOneMetric
    }

    // MARK: - Body

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppSpacing.lg) {
                Text("Log today's sleep and diet quality.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                LogFieldLabel("Member")
                memberField

                LogFieldLabel("Date")
                DatePicker("", selection: $selectedDate, in: ...Date(), displayedComponents: .date)
                    .labelsHidden()
                    .datePickerStyle(.compact)

                LogFieldLabel("Sleep time")
                HStack(spacing: AppSpacing.md) {
                    AppInputField(title: "Hours", text: $sleepHoursText, keyboardType: .numberPad)
                        .onChange(of: sleepHoursText) { _, newValue in
                            sleepHoursText = Self.sanitizeDigits(newValue)
                        }
                    AppInputField(title: "Minutes", text: $sleepMinutesText, keyboardType: .numberPad)
                        .onChange(of: sleepMinutesText) { _, newValue in
                            sleepMinutesText = Self.sanitizeDigits(newValue)
                        }
                }
                if hasSleepInput && !isSleepValid {
                    Text("Sleep time must be between 0:00 and 24:00.")
                        .font(.footnote)
                        .foregroundColor(.appRed)
                }

                LogFieldLabel("Diet quality")
                Menu {
                    ForEach(1...5, id: \.self) { rating in
                        Button("\(rating)") { foodQuality = rating }
                    }
                    if foodQuality != nil {
                        Button("Clear", role: .destructive) { foodQuality = nil }
                    }
                } label: {
                    LogFieldRow(text: foodQuality.map { "\($0)" } ?? "Select rating (1-5)",
                                isPlaceholder: foodQuality == nil,
                                systemIcon: "chevron.up.chevron.down")
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundColor(.appRed)
                }

                AppPrimaryButton(title: isSaving ? "Saving…" : "Save daily log", isLoading: isSaving) {
                    Task { await save() }
                }
                .frame(maxWidth: .infinity)
                .disabled(!isFormValid || isSaving)
                .opacity(isFormValid && !isSaving ? 1 : 0.5)
                .padding(.top, AppSpacing.sm)
            }
            .padding(20)
        }
        .navigationTitle("Log daily health")
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

    private static func sanitizeDigits(_ value: String) -> String {
        String(value.filter(\.isNumber).prefix(2))
    }

    private func ensureLookups() async {
        let needsRefresh = programContext.membersProgramId != programContext.programId
        if programContext.members.isEmpty || needsRefresh {
            await programContext.loadLookupData()
        }
        // Auto-select the logged-in user when they can only log for themselves.
        if !canSelectAnyMember, selectedMember == nil {
            if let userId = programContext.loggedInUserId {
                selectedMember = programContext.members.first { $0.id == userId }
                    ?? programContext.members.first
            }
        }
    }

    private func save() async {
        guard let token = programContext.authToken,
              let programId = programContext.programId,
              let member = selectedMember else { return }
        isSaving = true
        errorMessage = nil
        do {
            try await APIClient.shared.addDailyHealthLog(
                token: token,
                programId: programId,
                memberId: member.id,
                logDate: LogDateFormatter.string(from: selectedDate),
                sleepHours: sleepValue,
                foodQuality: foodQuality
            )
            programContext.summaryRefreshToken += 1  // web parity: ≈ invalidateQueries(["summary"]) (D-C3)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
            isSaving = false
        }
    }
}
