//
//  _DeferredScreenStubs.swift
//  RaSi-Fiters-App
//
//  FOUNDATION-SCAFFOLD STUBS — temporary placeholders for the deferred feature
//  screens that `AppRootView` instantiates. They exist only so the foundation
//  scaffold compiles and runs while the real screens are ported one-by-one
//  (faithfully, via the `question-asker` loop). Each stub is DELETED the moment
//  its real screen lands — the legacy implementations live in
//  `../../../ios-mobile/RaSi-Fiters-App/Features/**`.
//
//  This is the iOS analogue of the web foundation's `NotificationsGate` deferred
//  stub. See `apps/ios/CONTEXT.md` §Foundation port. DO NOT build features here.
//

import SwiftUI

/// Shared placeholder body for every deferred-screen stub.
private struct ScaffoldPlaceholder: View {
    let screen: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "hammer.fill")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("RaSi Fiters")
                .font(.headline)
            Text("\(screen) — not yet ported")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("Foundation scaffold. Feature screens land per-screen via question-asker.")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .padding()
    }
}

// MARK: - Deferred screens referenced by AppRootView

// NOTE: SplashView landed (Features/Onboarding/SplashView.swift) — stub removed.
// LoginView + CreateAccountView also landed (Features/Auth/) — they were never stubbed
// (AppRootView only instantiates SplashView + ProgramPickerView + the two widget views).

/// DEFERRED (Features/Home/ProgramPickerView.swift) — program picker flow.
struct ProgramPickerView: View {
    var body: some View { ScaffoldPlaceholder(screen: "Program Picker") }
}

/// DEFERRED (Features/Widgets/QuickAddWorkoutWidgetEntryView.swift) — widget deep-link target.
struct QuickAddWorkoutWidgetEntryView: View {
    var body: some View { ScaffoldPlaceholder(screen: "Quick Add Workout") }
}

/// DEFERRED (Features/Widgets/QuickAddHealthWidgetEntryView.swift) — widget deep-link target.
struct QuickAddHealthWidgetEntryView: View {
    var body: some View { ScaffoldPlaceholder(screen: "Quick Add Health") }
}
