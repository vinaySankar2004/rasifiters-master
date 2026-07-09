//
//  LogFormComponents.swift
//  RaSi-Fiters-App
//
//  Small shared chrome for the Summary log forms (AddWorkoutsDetailView +
//  AddDailyHealthDetailView) — a field label, a tappable/locked bordered field row,
//  and the shared yyyy-MM-dd formatter. Ported run 60 (question-asker, D-C2 shared chrome).
//

import SwiftUI

/// Section label above a log-form field.
struct LogFieldLabel: View {
    let title: String
    init(_ title: String) { self.title = title }
    var body: some View {
        Text(title)
            .font(.subheadline.weight(.semibold))
            .foregroundColor(Color(.label))
    }
}

/// A bordered field row used for the member / workout pickers and the diet menu.
/// `locked` renders a filled, non-interactive style (member self-lock, mirroring the
/// legacy lock-icon field).
struct LogFieldRow: View {
    let text: String
    var isPlaceholder: Bool = false
    var systemIcon: String
    var locked: Bool = false

    var body: some View {
        HStack {
            Text(text)
                .foregroundColor(isPlaceholder ? Color(.placeholderText) : Color(.label))
            Spacer()
            Image(systemName: systemIcon)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, AppSpacing.mdl)
        .padding(.vertical, AppSpacing.md)
        .background(
            RoundedRectangle(cornerRadius: AppCornerRadius.md, style: .continuous)
                .fill(locked ? Color.appBackgroundSecondary : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: AppCornerRadius.md, style: .continuous)
                .stroke(Color(.systemGray3), lineWidth: 1)
        )
        .contentShape(Rectangle())
    }
}

/// Shared UTC-stable `yyyy-MM-dd` formatter for log dates.
enum LogDateFormatter {
    static func string(from date: Date) -> String {
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.dateFormat = "yyyy-MM-dd"
        return df.string(from: date)
    }
}

/// Locale thousands-grouped steps formatter ("—" for nil) — shared by the log forms.
enum StepsFormatter {
    static func string(_ value: Int?) -> String {
        guard let value else { return "—" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }
}

/// Multi-program selector shared by the batched log forms (workouts + daily health). Rows mirror the
/// Apple Health `programRow` idiom: current program checked + disabled ("Current program"), data-entry
/// -locked programs disabled with a lock glyph ("Admin-only — can't log"), others toggle. Hidden when
/// the user belongs to only one program. Renders `memberLockHint` as a footnote when non-nil.
struct ProgramMultiSelectSection: View {
    let programs: [APIClient.ProgramDTO]
    let currentProgramId: String
    @Binding var selectedIds: Set<String>
    let isLocked: (String) -> Bool
    var memberLockHint: String?

    var body: some View {
        if programs.count > 1 {
            VStack(alignment: .leading, spacing: AppSpacing.sm) {
                LogFieldLabel("Programs")

                VStack(spacing: 0) {
                    ForEach(programs, id: \.id) { program in
                        row(program)
                        if program.id != programs.last?.id {
                            Divider().padding(.leading, 50)
                        }
                    }
                }
                .background(
                    RoundedRectangle(cornerRadius: AppCornerRadius.md, style: .continuous)
                        .stroke(Color(.systemGray3), lineWidth: 1)
                )

                if let memberLockHint {
                    Text(memberLockHint)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
            }
        }
    }

    @ViewBuilder
    private func row(_ program: APIClient.ProgramDTO) -> some View {
        let isCurrent = program.id == currentProgramId
        let locked = isLocked(program.id)
        let selected = selectedIds.contains(program.id)
        let disabled = isCurrent || locked

        Button {
            guard !disabled else { return }
            if selected {
                selectedIds.remove(program.id)
            } else {
                selectedIds.insert(program.id)
            }
        } label: {
            HStack(spacing: 14) {
                Image(systemName: locked ? "lock.fill" : ((selected || isCurrent) ? "checkmark.circle.fill" : "circle"))
                    .font(.system(size: 22))
                    .foregroundColor(locked ? Color(.tertiaryLabel) : ((selected || isCurrent) ? .appOrange : Color(.tertiaryLabel)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(program.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Color(.label))
                    Text(isCurrent ? "Current program" : (locked ? "Admin-only — can't log" : (program.status ?? "Active")))
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
                }
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .opacity(disabled ? 0.6 : 1)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }
}
