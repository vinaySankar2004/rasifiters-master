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

// NOTE: AdminMembersTab + StandardMembersTab landed (Features/Home/Tabs/AdminMembersTab.swift +
// StandardMembersTab.swift + MemberCards.swift + MemberOverviewPicker.swift, run 55) — stubs removed.
// The 6 detail screens their cards navigate OUT to have ALL now landed: InviteMemberView +
// ProgramMembersListView (run 62, ProgramManagement/); MemberMetricsDetailView + MemberStreakDetail +
// MemberRecentDetail + MemberHealthDetail (run 63, Detail/). See the run-63 note below.

// PORTED (run 62) — ViewWorkoutTypesListView + EditCustomWorkoutSheet now live in
// Features/Home/ProgramManagement/WorkoutTypesSection.swift (the workout-type CRUD manager, web
// `/lifestyle/workouts`). Shared nav target of the Lifestyle header GlassButton (run 56) + the
// AdminProgramTab Workout Types section. Stub removed.

// PORTED (run 64) — LifestyleTimelineDetailView now lives in
// Features/Home/Detail/LifestyleTimelineDetailView.swift (the sleep/diet timeline detail with a period
// selector, web `/lifestyle/timeline`). Reached via the Lifestyle timeline card (run 56). Kept iOS-native
// interactive (D-REF) + web-parity dual Y-axis / error banner / axis unit labels / legend. Its 2 health
// helpers (HealthHeaderStats + HealthCalloutView) landed in Detail/ChartDetailComponents.swift. Stub removed.

// PORTED (run 63) — the 4 Members detail views now live in Features/Home/Detail/:
//   MemberMetricsDetailView  (MemberMetricsDetailView.swift, web /members/metrics)
//   MemberStreakDetail       (MemberStreakDetail.swift,       web /members/streaks)
//   MemberRecentDetail       (MemberRecentDetail.swift,       web /members/workouts — lock ADD)
//   MemberHealthDetail       (MemberHealthDetail.swift,       web /members/health   — lock ADD)
// All 4 stubs removed. The 2 write views gained the web-parity admin_only_data_entry
// lock (swipe Edit/Delete hidden when programContext.dataEntryLocked).

// PORTED (run 62) — AdminProgramTab's 3 management sections now live in
// Features/Home/ProgramManagement/ (MemberManagementSection.swift = ProgramMemberManagementSection +
// ProgramMembersListView + MemberDetailEditView, web `/members/{list,detail}`; InviteMemberView.swift =
// InviteMemberView, web `/members/invite`; RoleManagementSection.swift = ProgramRoleManagementSection +
// ManageRolesView, web `/program/roles` — kept iOS-native per-member lock, D-REF; WorkoutTypesSection.swift
// above). All 6 shared stubs (the 3 sections + ProgramMembersListView + InviteMemberView +
// ViewWorkoutTypesListView) removed; the Members/Lifestyle tab nav (run 55/56) now lights up too.

// PORTED (run 59) — ProgramActionsSheet + CreateProgramTabView + InvitesTabView +
// DeclineInviteDialog + InviteCard + EditProgramInfoView now live in
// Features/Home/ProgramActions/. The two deferred stubs were removed. EditProgramInfoView
// gained the web-parity admin-only-data-entry toggle + date-range validation + skip-no-op PUT.

// NOTE: the 4 account/settings screens landed (Features/Home/Settings/MyProfileView.swift +
// ChangePasswordView.swift + AppearanceSettingsView.swift + NotificationsSettingsView.swift, run 58) —
// stubs removed. They are the ProgramMyAccountSection account-menu targets (run 57). MyProfile + Change
// Password match web `/program/{profile,password}` (incl. the web-parity email-change form + 5-rule
// password checklist); Appearance + Notifications are faithful 1:1 ports (Notifications is iOS-only).

// MARK: - Deferred detail screens referenced by AdminSummaryTab (the Summary tab's NavigationLink targets)
// The iOS analogues of the web /summary sub-routes (activity / distribution / workout-types).
// Initializers match the AdminSummaryTab call sites so the tab compiles.

// NOTE: AddWorkoutDetailView + AddDailyHealthDetailView landed (Features/Home/Detail/AddWorkoutDetailView.swift +
// AddDailyHealthDetailView.swift + LogFormComponents.swift, run 60) — the two Summary log forms. Stubs removed.
// They gained the web-parity admin_only_data_entry mount guard + shared chrome + success-refresh + inline errors.

// NOTE: ActivityTimelineDetailView + DistributionByDayDetailView + WorkoutTypesDetailView landed
// (Features/Home/Detail/{ActivityTimelineDetailView,DistributionByDayDetailView,WorkoutTypesDetailView}.swift
// + ChartDetailComponents.swift, run 61) — the 3 Summary chart drill-downs. Stubs removed. Kept iOS-native
// interactive (D-REF); ActivityTimelineDetailView also serves the Members MemberHistoryCard (memberId-scoped).

// MARK: - Members detail screens — ALL PORTED (run 63)
// The iOS analogues of the web /members sub-routes. InviteMemberView + ProgramMembersListView
// landed run 62 (ProgramManagement/); the 4 remaining detail views landed run 63 in
// Features/Home/Detail/ (MemberMetricsDetailView / MemberStreakDetail / MemberRecentDetail /
// MemberHealthDetail). All Members detail stubs removed.
