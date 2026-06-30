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
// NOTE: ProgramPickerView landed (Features/Home/ProgramPickerView.swift) — stub removed.
// The 7 screens it navigates OUT to remain deferred (below) — they are stubbed here so
// the picker compiles, and each is DELETED the moment its real screen lands.

/// DEFERRED (Features/Widgets/QuickAddWorkoutWidgetEntryView.swift) — widget deep-link target.
struct QuickAddWorkoutWidgetEntryView: View {
    var body: some View { ScaffoldPlaceholder(screen: "Quick Add Workout") }
}

/// DEFERRED (Features/Widgets/QuickAddHealthWidgetEntryView.swift) — widget deep-link target.
struct QuickAddHealthWidgetEntryView: View {
    var body: some View { ScaffoldPlaceholder(screen: "Quick Add Health") }
}

// MARK: - Deferred screens referenced by ProgramPickerView (forward-nav targets)

/// DEFERRED (Features/Home/AdminHomeView.swift) — the post-pick home dashboard
/// (the iOS analogue of the web `/summary` workspace). Pushed when a program card is opened.
struct AdminHomeView: View {
    var body: some View { ScaffoldPlaceholder(screen: "Admin Home") }
}

/// DEFERRED (Features/Home/ProgramActionsSheet.swift) — the create-program + invites sheet
/// (the floating "+" button target). `onDismiss` reloads programs + pending invites.
struct ProgramActionsSheet: View {
    var onDismiss: () -> Void = {}
    var body: some View { ScaffoldPlaceholder(screen: "Program Actions") }
}

/// DEFERRED (Features/Home/EditProgramInfoView.swift) — the swipe-to-edit program editor.
struct EditProgramInfoView: View {
    var body: some View { ScaffoldPlaceholder(screen: "Edit Program") }
}

/// DEFERRED (Features/Account/MyProfileView.swift) — account-menu → My Profile.
struct MyProfileView: View {
    var body: some View { ScaffoldPlaceholder(screen: "My Profile") }
}

/// DEFERRED (Features/Account/ChangePasswordView.swift) — account-menu → Change Password.
struct ChangePasswordView: View {
    var body: some View { ScaffoldPlaceholder(screen: "Change Password") }
}

/// DEFERRED (Features/Settings/AppearanceSettingsView.swift) — account-menu → Appearance.
struct AppearanceSettingsView: View {
    var body: some View { ScaffoldPlaceholder(screen: "Appearance") }
}

/// DEFERRED (Features/Settings/NotificationsSettingsView.swift) — account-menu → Notifications.
struct NotificationsSettingsView: View {
    var body: some View { ScaffoldPlaceholder(screen: "Notifications") }
}
