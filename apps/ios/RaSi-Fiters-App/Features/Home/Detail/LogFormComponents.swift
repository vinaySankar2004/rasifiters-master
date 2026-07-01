//
//  LogFormComponents.swift
//  RaSi-Fiters-App
//
//  Small shared chrome for the two Summary log forms (AddWorkoutDetailView +
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
