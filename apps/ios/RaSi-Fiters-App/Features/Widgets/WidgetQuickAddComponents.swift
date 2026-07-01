//
//  WidgetQuickAddComponents.swift
//  RaSi-Fiters-App
//
//  Shared scaffold for the two widget quick-add forms (QuickAddWorkoutWidgetEntryView +
//  QuickAddHealthWidgetEntryView) — the ~80% twin structure they share: the back/title/subtitle
//  header, the multi-select "Log to Programs" list (with the per-program admin_only_data_entry
//  lock, D-C1), the member field, the success toast, and the shared member option + lock helper.
//  Ported run 65 (question-asker: D-C3 extract shared scaffold, D-C2 shared chrome).
//
//  This is the widget analogue of the Summary log forms' Detail/LogFormComponents.swift (run 60):
//  it extracts reusable VIEW chrome + helper types, NOT a shared view model — each form keeps its
//  own @State + multi-program save/rollback logic (the load-bearing widget behavior).
//
//  Reference (legacy): ios-mobile/RaSi-Fiters-App/Features/Widgets/{QuickAddWorkout,
//  QuickAddHealth}WidgetEntryView.swift.
//

import SwiftUI

// MARK: - Shared helper types

/// A member option shared by both widget quick-add forms (the intersection of members across the
/// selected programs, mapped to id + display name).
struct WidgetMemberOption: Identifiable, Hashable {
    let id: String
    let name: String
}

/// Per-program data-entry lock for the widget quick-add forms.
///
/// The widget forms are MULTI-program and run BEFORE an active program is picked, so
/// `ProgramContext.dataEntryLocked` (scoped to the single active program) cannot be used — the lock
/// is evaluated per `ProgramDTO` in the list instead. Mirrors web `isDataEntryLocked`
/// (`admin_only_data_entry && !isProgramAdmin`): a **program admin** or **global admin** is exempt,
/// loggers/members are NOT (the run 54/60/63 lock arc — `isProgramAdmin` excludes logger). D-C1.
func widgetProgramLockedForLogging(_ program: APIClient.ProgramDTO, isGlobalAdmin: Bool) -> Bool {
    guard program.admin_only_data_entry == true else { return false }
    let isProgramAdmin = isGlobalAdmin || (program.my_role?.lowercased() == "admin")
    return !isProgramAdmin
}

// MARK: - Header

/// Back button + title + subtitle, shared by both widget forms (title/subtitle parameterized).
struct WidgetQuickAddHeader: View {
    let title: String
    let subtitle: String
    let onBack: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Button(action: onBack) {
                    ZStack {
                        Circle()
                            .fill(Color(.systemGray5))
                            .frame(width: 36, height: 36)
                        Image(systemName: "chevron.left")
                            .font(.headline.weight(.semibold))
                            .foregroundColor(Color(.label))
                    }
                }
                .buttonStyle(.plain)

                Spacer()
            }

            Text(title)
                .font(.title2.weight(.bold))
                .foregroundColor(Color(.label))

            Text(subtitle)
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
        }
    }
}

// MARK: - Program selector (multi-select, with the per-program lock)

/// The "Log to Programs" multi-select list. A locked program (per-program `admin_only_data_entry`
/// with a non-admin viewer, D-C1) renders disabled with a lock icon + "Admin-only logging" caption
/// and cannot be toggled — the widget analogue of web hiding the log action when `isDataEntryLocked`.
struct WidgetProgramSelector: View {
    let activePrograms: [APIClient.ProgramDTO]
    @Binding var selectedProgramIds: Set<String>
    let isLoadingDetails: Bool
    let isGlobalAdmin: Bool
    let onToggle: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            LogFieldLabel("Log to Programs")

            if activePrograms.isEmpty {
                Text("No active programs found.")
                    .font(.subheadline)
                    .foregroundColor(Color(.secondaryLabel))
                    .padding(.vertical, 8)
            } else {
                VStack(spacing: 8) {
                    ForEach(activePrograms, id: \.id) { program in
                        programRow(program)
                    }
                }
            }

            if isLoadingDetails {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Loading program details...")
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
                }
            }

            if selectedProgramIds.isEmpty && !activePrograms.isEmpty {
                Text("Select at least one program.")
                    .font(.caption)
                    .foregroundColor(Color(.secondaryLabel))
            }
        }
    }

    private func programRow(_ program: APIClient.ProgramDTO) -> some View {
        let locked = widgetProgramLockedForLogging(program, isGlobalAdmin: isGlobalAdmin)
        let isSelected = selectedProgramIds.contains(program.id)
        return Button {
            guard !locked else { return }
            onToggle(program.id)
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(program.name)
                        .foregroundColor(locked ? Color(.secondaryLabel) : Color(.label))
                    if locked {
                        Text("Admin-only logging")
                            .font(.caption)
                            .foregroundColor(Color(.tertiaryLabel))
                    }
                }
                Spacer()
                if locked {
                    Image(systemName: "lock.fill")
                        .foregroundColor(Color(.tertiaryLabel))
                } else if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.appGreen)
                } else {
                    Image(systemName: "circle")
                        .foregroundColor(Color(.tertiaryLabel))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color(.systemGray6))
            .cornerRadius(12)
            .opacity(locked ? 0.6 : 1)
        }
        .buttonStyle(.plain)
        .disabled(locked)
    }
}

// MARK: - Member field

/// The member field shared by both forms: a `SearchablePickerSheet` trigger when the viewer may
/// select any member, a helper row when none are available, or a locked self row otherwise.
struct WidgetMemberField: View {
    let canSelectAnyMember: Bool
    let availableMembers: [WidgetMemberOption]
    let selectedMemberName: String?
    let fallbackName: String
    let noProgramsSelected: Bool
    let onTapPicker: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            LogFieldLabel("Member")

            if canSelectAnyMember {
                if availableMembers.isEmpty {
                    let helperText = noProgramsSelected
                        ? "Select programs first"
                        : "No shared members across selected programs"
                    LogFieldRow(text: helperText, isPlaceholder: true, systemIcon: "lock.fill", locked: true)
                } else {
                    Button(action: onTapPicker) {
                        LogFieldRow(
                            text: selectedMemberName ?? "Select member",
                            isPlaceholder: selectedMemberName == nil,
                            systemIcon: "chevron.up.chevron.down"
                        )
                    }
                    .buttonStyle(.plain)
                }
            } else {
                LogFieldRow(text: fallbackName, systemIcon: "lock.fill", locked: true)
            }
        }
    }
}

// MARK: - Success toast

/// The success toast shared by both forms (text parameterized).
struct WidgetSuccessToast: View {
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.appGreen)
            Text(text)
                .foregroundColor(Color(.label))
                .font(.subheadline.weight(.semibold))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color(.systemGray6))
        .cornerRadius(999)
        .shadow(color: Color.black.opacity(0.15), radius: 6, x: 0, y: 3)
    }
}
