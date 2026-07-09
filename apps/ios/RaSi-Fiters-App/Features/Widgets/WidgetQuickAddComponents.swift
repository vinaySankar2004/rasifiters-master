//
//  WidgetQuickAddComponents.swift
//  RaSi-Fiters-App
//
//  Shared chrome + helper types for the two widget quick-add forms (QuickAddWorkoutWidgetEntryView +
//  QuickAddHealthWidgetEntryView): the back/title/subtitle header, the success toast, and the shared
//  member option type. The forms themselves now mirror the in-app batch forms (Detail/AddWorkouts +
//  AddDailyHealth) — they reuse `ProgramMultiSelectSection` + the in-app row card for program/member
//  selection, so the old bespoke `WidgetProgramSelector`/`WidgetMemberField` were removed.
//
//  As with the in-app Detail/LogFormComponents.swift, this extracts reusable VIEW chrome + helper
//  types, NOT a shared view model — each form keeps its own @State + batch save/rollback logic.
//

import SwiftUI

// MARK: - Shared helper types

/// A member option shared by both widget quick-add forms (the intersection of members across the
/// selected programs, mapped to id + display name).
struct WidgetMemberOption: Identifiable, Hashable {
    let id: String
    let name: String
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
