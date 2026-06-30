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

// NOTE: AdminHomeView landed (Features/Home/AdminHomeView.swift) — stub removed.
// It is a TabView SHELL; the 7 tab bodies it hosts remain deferred (below) — stubbed
// here so the shell compiles, each DELETED the moment its real tab lands.

// MARK: - Deferred tab bodies referenced by AdminHomeView (the 4-tab home shell)

// NOTE: AdminSummaryTab landed (Features/Home/Tabs/AdminSummaryTab.swift + SummaryCards.swift +
// SummaryChartCards.swift) — stub removed. The 5 detail screens its cards navigate OUT to remain
// deferred (below) — stubbed here so the Summary tab compiles, each DELETED when its real screen lands.

/// DEFERRED (Features/Home/Tabs/AdminOtherTabs.swift) — Tab 2 "Members", program-admin variant.
struct AdminMembersTab: View {
    var body: some View { ScaffoldPlaceholder(screen: "Members (Admin)") }
}

/// DEFERRED (Features/Home/Tabs/StandardMembersTab.swift) — Tab 2 "Members", non-admin variant.
struct StandardMembersTab: View {
    var body: some View { ScaffoldPlaceholder(screen: "Members") }
}

/// DEFERRED (Features/Home/Tabs/AdminOtherTabs.swift) — Tab 3 "Lifestyle", program-admin variant.
struct AdminWorkoutTypesTab: View {
    var body: some View { ScaffoldPlaceholder(screen: "Lifestyle (Admin)") }
}

/// DEFERRED (Features/Home/Tabs/StandardWorkoutTypesTab.swift) — Tab 3 "Lifestyle", non-admin variant.
struct StandardWorkoutTypesTab: View {
    var body: some View { ScaffoldPlaceholder(screen: "Lifestyle") }
}

/// DEFERRED (Features/Home/Tabs/AdminProgramTab.swift) — Tab 4 "Program", program-admin variant.
struct AdminProgramTab: View {
    var body: some View { ScaffoldPlaceholder(screen: "Program (Admin)") }
}

/// DEFERRED (Features/Home/Tabs/StandardProgramTab.swift) — Tab 4 "Program", non-admin variant.
struct StandardProgramTab: View {
    var body: some View { ScaffoldPlaceholder(screen: "Program") }
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

// MARK: - Deferred detail screens referenced by AdminSummaryTab (the Summary tab's NavigationLink targets)
// The iOS analogues of the web /summary sub-routes (log-workout / log-health / activity / distribution /
// workout-types). Initializers match the AdminSummaryTab call sites so the tab compiles.

/// DEFERRED (Features/Home/Detail/AddWorkoutDetailView.swift) — Summary "Add workout" card → log-workout form.
struct AddWorkoutDetailView: View {
    var body: some View { ScaffoldPlaceholder(screen: "Add Workout") }
}

/// DEFERRED (Features/Home/Detail/AddDailyHealthDetailView.swift) — Summary "Log daily health" card → log-health form.
struct AddDailyHealthDetailView: View {
    var body: some View { ScaffoldPlaceholder(screen: "Add Daily Health") }
}

/// DEFERRED (Features/Home/Detail/ActivityTimelineViews.swift) — Summary activity-timeline card → expanded timeline.
struct ActivityTimelineDetailView: View {
    var initialPeriod: AdminHomeView.Period
    var body: some View { ScaffoldPlaceholder(screen: "Activity Timeline") }
}

/// DEFERRED (Features/Home/Detail/WorkoutDistributionViews.swift) — Summary distribution card → expanded distribution.
struct DistributionByDayDetailView: View {
    var points: [DistributionPoint]
    var body: some View { ScaffoldPlaceholder(screen: "Workout Distribution") }
}

/// DEFERRED (Features/Home/Detail/WorkoutTypesDetailViews.swift) — Summary workout-types card → expanded breakdown.
struct WorkoutTypesDetailView: View {
    var types: [APIClient.WorkoutTypeDTO]
    var body: some View { ScaffoldPlaceholder(screen: "Workout Types") }
}
