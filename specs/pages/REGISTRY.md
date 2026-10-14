# Page / Screen Registry (L4) — RaSi Fiters

Human index of **page/screen specs** — one per web page, iOS screen, and Android screen. Specs live at
`specs/pages/web/<page>/SPEC.md`, `specs/pages/ios/<screen>/SPEC.md`, and `specs/pages/android/<screen>/SPEC.md`. Each page spec captures purpose,
contents, the shared features it consumes, and **role-based view rules** (what global_admin / program
admin / logger / member each see and can do). Shared capabilities are indexed in
[`../features/REGISTRY.md`](../features/REGISTRY.md).

Status legend: 📄 documented → 🏗️ built → 🚀 deployed → ⊘ retired.

## web (Next.js) — reference: `rasifiters-webapp`

| Page | Route | Status | Consumes (features) | Spec |
|------|-------|--------|---------------------|------|
| landing | `/` (root, **public marketing**) | 🏗️ v0.1.5 | `auth` (foundation `useAuth` for the auth-aware CTA; no API) | [landing SPEC](web/landing/SPEC.md) |
| splash | `/splash` (retained, **unlinked**; root `/` now serves landing) | 🏗️ v0.2.1 | `auth` (foundation `useAuth`; no API) | [splash SPEC](web/splash/SPEC.md) |
| login | `/login` | 🏗️ v0.3.1 | `auth` (`login()` `POST /auth/login/global`, `useAuth`, jwt helpers) | [login SPEC](web/login/SPEC.md) |
| forgot-password | `/forgot-password` | 🏗️ v0.1.1 | `auth` v0.3.0 (`requestPasswordReset()` `POST /auth/forgot-password`, `useAuth`); `SUPPORT_EMAIL` | [forgot-password SPEC](web/forgot-password/SPEC.md) |
| reset-password | `/reset-password` | 🏗️ v0.1.3 | `auth` v0.4.0 (`resetPassword()` `POST /auth/reset-password`, `useAuth`, `ApiError`) | [reset-password SPEC](web/reset-password/SPEC.md) |
| create-account | `/create-account` | 🏗️ v0.3.1 | `auth` (`registerAccount()` `POST /auth/register` + `login()`, `useAuth`, jwt helpers) | [create-account SPEC](web/create-account/SPEC.md) |
| programs | `/programs` (first **protected** route) | 🏗️ v0.5.0 | `programs` v0.2.0 + `program-memberships` + `invites` 0.3.0 (CRUD, invites, membership, `saveProgramOrder` `PUT /programs/order` drag-reorder + collapsed floating search) + `notifications` 0.6.0 (the "+" sheet's Inbox tab, server badge, mark-read, account rows Inbox / Notifications / Announcements) + `auth` (`useAuth`/`useAuthGuard`) | [programs SPEC](web/programs/SPEC.md) |
| summary | `/summary` (first **workspace tab**) | 🏗️ v0.4.3 | `analytics` + `analytics-v2` (8 reads) + `workout-logs` 0.5.0 + `daily-health-logs` 0.2.0 (batched multi-program writes) + `program-workouts`/`program-memberships` (form lookups + program multi-select) + `auth` (`useAuthGuard`) | [summary SPEC](web/summary/SPEC.md) |
| summary/log-workout | `/summary/log-workout` | 🏗️ v0.2.2 | `workout-logs` 0.5.0 (`POST /workout-logs/batch` + `program_ids[]`) + `program-memberships`/`program-workouts` lookups + `auth` | [summary/log-workout SPEC](web/summary/log-workout/SPEC.md) |
| summary/log-health | `/summary/log-health` | 🏗️ v0.2.2 | `daily-health-logs` 0.2.0 (`POST /daily-health-logs/batch` + steps + `program_ids[]`) + `program-memberships` lookup + `auth` | [summary/log-health SPEC](web/summary/log-health/SPEC.md) |
| summary/activity | `/summary/activity` (summary **sub-route** 1/6 — chart drill-down) | 🏗️ v0.1.2 | `analytics` (`GET /analytics/timeline`; workouts + active members per bucket, W/M/Y/P) + `auth` | [summary/activity SPEC](web/summary/activity/SPEC.md) |
| summary/distribution | `/summary/distribution` (summary **sub-route** 2/6 — chart drill-down) | 🏗️ v0.1.2 | `analytics` (`GET /analytics/distribution/day`; workouts per weekday, read-only) + `auth` | [summary/distribution SPEC](web/summary/distribution/SPEC.md) |
| summary/workout-types | `/summary/workout-types` (summary **sub-route** 3/6 — chart drill-down) | 🏗️ v0.1.2 | `analytics` (`GET /analytics/workouts/types`; sessions per type + ranked detail list) + `auth` | [summary/workout-types SPEC](web/summary/workout-types/SPEC.md) |
| summary/bulk-log-workout | `/summary/bulk-log-workout` (summary **sub-route** 6/6 — mobile log fallback) | 🏗️ v0.1.0 | `workout-logs` (`POST /workout-logs/batch`) + `program-memberships`/`program-workouts` lookups + `auth` | [summary/bulk-log-workout SPEC](web/summary/bulk-log-workout/SPEC.md) |
| members | `/members` (second **workspace tab**) | 🏗️ v0.4.0 | `member-analytics` 0.7.0 (metrics incl. `avg_steps`/history/streaks/recent; the S5 kit recipe D-C12) + `daily-health-logs` 0.2.0 (health card, steps) + `program-memberships` (`fetchProgramMembers` → view-as picker) + `people` (the People pill behind `PEOPLE_LIVE`) + `auth` (`useAuthGuard`) | [members SPEC](web/members/SPEC.md) |
| members/health | `/members/health` | 🏗️ v0.2.3 | `member-analytics` (`GET /daily-health-logs` list) + `daily-health-logs` 0.2.0 (`PUT`/`DELETE`, steps sort/filter/edit/CSV, stacked metric-cell rows) + `auth` | [members/health SPEC](web/members/health/SPEC.md) |
| members/list | `/members/list` (members **sub-route** 1/8) | 🏗️ v0.2.0 | `PEOPLE_LIVE` switch: `program-memberships` (`fetchMembershipDetails`; today's searchable read-only roster, entry to `members/detail`) or `people` 0.1.0 (`fetchPeople` — the People list + the activity notice) + `auth` | [members/list SPEC](web/members/list/SPEC.md) |
| members/detail | `/members/detail?memberId=` (members **sub-route** 2/8, **global_admin only**) | 🏗️ v0.2.0 | `program-memberships` (`updateMembership` joined-date/active-flag + `removeMembership`) + `auth` | [members/detail SPEC](web/members/detail/SPEC.md) |
| members/invite | `/members/invite` (members **sub-route** 3/8, admin) | 🏗️ v0.2.1 | `invites` (`sendProgramInvite`; `@`-username form + privacy banner) + `auth` | [members/invite SPEC](web/members/invite/SPEC.md) |
| members/metrics | `/members/metrics` (members **sub-route** 4/8, admin entry) | 🏗️ v0.2.2 | `member-analytics` (per-member metric-card grid, search/sort/filter + client CSV export) + `auth` | [members/metrics SPEC](web/members/metrics/SPEC.md) |
| members/history | `/members/history?memberId=&name=` (members **sub-route** 5/8) | 🏗️ v0.1.2 | `member-analytics` (workout-history timeline `BarChart`, W/M/Y/P) + `auth` | [members/history SPEC](web/members/history/SPEC.md) |
| members/streaks | `/members/streaks?memberId=&name=` (members **sub-route** 6/8) | 🏗️ v0.1.2 | `member-analytics` (current/longest streak pills + milestone badges) + `auth` | [members/streaks SPEC](web/members/streaks/SPEC.md) |
| members/workouts | `/members/workouts?memberId=&name=` (members **sub-route** 7/8) | 🏗️ v0.1.2 | `member-analytics` (`GET /member-recent` log list) + `workout-logs` (edit duration / delete rows, CSV) + `program-workouts` (filter dropdown, lazy) + `auth` | [members/workouts SPEC](web/members/workouts/SPEC.md) |
| members/person | `/members/person?memberId=` (People profile — **dark** behind `PEOPLE_LIVE`) | 🏗️ v0.1.0 | `people` 0.1.0 (profile + kudos give/undo) + `member-analytics` (Open full stats targets) + `program-memberships` (Edit membership → `members/detail`) + `auth` | [members/person SPEC](web/members/person/SPEC.md) |
| lifestyle | `/lifestyle` (third **workspace tab**) | 🏗️ v0.2.2 | `analytics` 0.2.0 (`workouts/types` popularity + `health/timeline` steps + `health/steps`) + `analytics-v2` (4 workout-type stats) + `program-memberships` (`fetchProgramMembers` → view-as picker) + `auth` (`useAuthGuard`) | [lifestyle SPEC](web/lifestyle/SPEC.md) |
| lifestyle/steps-timeline | `/lifestyle/steps-timeline` | 🏗️ v0.1.2 | `analytics` 0.2.0 (`GET /analytics/health/timeline`; daily-steps drill-down) + `auth` | [lifestyle/steps-timeline SPEC](web/lifestyle/steps-timeline/SPEC.md) |
| lifestyle/workouts | `/lifestyle/workouts` (lifestyle **sub-route** 1/2) | 🏗️ v0.1.2 | `program-workouts` (all 6 routes: list + hide/show + add/edit/delete custom; admin writes, read-only otherwise) + `auth` | [lifestyle/workouts SPEC](web/lifestyle/workouts/SPEC.md) |
| lifestyle/timeline | `/lifestyle/timeline` (lifestyle **sub-route** 2/2) | 🏗️ v0.1.2 | `analytics` (`GET /analytics/health/timeline`; sleep bars + diet-quality line, W/M/Y/P, read-only) + `auth` | [lifestyle/timeline SPEC](web/lifestyle/timeline/SPEC.md) |
| program | `/program` (fourth & last **workspace tab**) | 🏗️ v0.3.0 | `program-memberships` (`fetchMembershipDetails` + `leaveProgram`) + `program-workouts` (`fetchProgramWorkouts`) + `notifications` (Inbox / Notifications / Announcements account rows) + `people` (the `People` row label behind `PEOPLE_LIVE`) + `auth` (`useAuthGuard`/`useAuth.signOut`) | [program SPEC](web/program/SPEC.md) |
| program/edit | `/program/edit` (program-settings **sub-route** 1/6) | 🏗️ v0.1.2 | `programs` (`updateProgram` `PUT /programs/:id`) + `auth` (`useAuthGuard`) | [program/edit SPEC](web/program/edit/SPEC.md) |
| program/roles | `/program/roles` (program-settings **sub-route** 2/6) | 🏗️ v0.1.2 | `program-memberships` (`fetchMembershipDetails` `GET /program-memberships/details` + `updateMembership` `PUT /program-memberships`) + `auth` (`useAuthGuard`) | [program/roles SPEC](web/program/roles/SPEC.md) |
| program/profile | `/program/profile` (program-settings **sub-route** 3/6, all roles) | 🏗️ v0.4.1 | `members` 0.5.0 (`fetchMemberProfile` `GET /members/:id` + `updateMemberProfile` `PUT /members/:id`, email view/change, `hide_activity` — Hide my activity behind `PEOPLE_LIVE`) + `auth` (`deleteAccount` `DELETE /auth/account`, `useAuthGuard`) | [program/profile SPEC](web/program/profile/SPEC.md) |
| program/password | `/program/password` (program-settings **sub-route** 4/6, all roles) | 🏗️ v0.2.1 | `auth` (`changePassword` `PUT /auth/change-password` + live policy checklist, `useAuthGuard`) | [program/password SPEC](web/program/password/SPEC.md) |
| program/appearance | `/program/appearance` (program-settings **sub-route** 5/6, all roles) | 🏗️ v0.1.0 | none — client-side theme picker (`lib/theme.ts` `rf:appearance` localStorage) + `useAuthGuard`; no API | [program/appearance SPEC](web/program/appearance/SPEC.md) |
| program/privacy | `/program/privacy` (program-settings **sub-route** 6/6, all roles) | 🏗️ v0.2.3 | none — static Privacy Policy content (signed-in twin of public `privacy-policy`) + `useAuthGuard`; no API | [program/privacy SPEC](web/program/privacy/SPEC.md) |
| program/notifications | `/program/notifications` (account sub-route, all roles) | 🏗️ v0.1.0 | `notifications` 0.6.0 (`GET`/`PUT /notifications/preferences` — five category switches, reminder time, time-zone line) + `auth` | [program/notifications SPEC](web/program/notifications/SPEC.md) |
| program/announcements | `/program/announcements` (account sub-route, **global_admin only**) | 🏗️ v0.1.0 | `notifications` 0.6.0 (`/notifications/announcements*` — composer, exact preview, send now / local time, history + cancel) + `programs` + `members` + `auth` | [program/announcements SPEC](web/program/announcements/SPEC.md) |
| delete-account | `/delete-account` (**public** legal — net-new for Play) | 🏗️ v0.1.1 | none — static account-deletion instructions (`PageShell`/`PageHeader`/`GlassCard` + `next/link`); no API, no auth | [delete-account SPEC](web/delete-account/SPEC.md) |
| privacy-policy | `/privacy-policy` (**public** legal) | 🏗️ v0.2.4 | none — static policy page (`PageShell`/`PageHeader`/`GlassCard`); no API, no auth | [privacy-policy SPEC](web/privacy-policy/SPEC.md) |
| support | `/support` (**public**) | 🏗️ v0.2.1 | none — static support/contact page (`PageShell`/`PageHeader`/`GlassCard`); no API, no auth | [support SPEC](web/support/SPEC.md) |

**Inventory: COMPLETE** — all 40 on-disk web page SPECs are indexed above (every `specs/pages/web/**/SPEC.md`
has a row; the 17 sub-route rows under `summary`/`members`/`lifestyle`/`program` were back-filled 2026-07-18,
health-check Run 6; `program/notifications`, `program/announcements` and `members/person` added 2026-10-13, Phase 4).

## ios (SwiftUI) — reference: `ios-mobile`

| Screen | Status | Consumes (features) | Spec |
|--------|--------|---------------------|------|
| splash | 🏗️ v0.3.1 | `auth` (root `authToken` bifurcation; the A2 forced sign-out notice; no API) | [splash SPEC](ios/splash/SPEC.md) |
| login | 🏗️ v0.3.1 | `auth` (`APIClient.loginGlobal()` `POST /auth/login/global`, `ProgramContext+Auth`) | [login SPEC](ios/login/SPEC.md) |
| create-account | 🏗️ v0.3.1 | `auth` (`registerAccount()` `POST /auth/register` + `loginGlobal()`, `ProgramContext+Auth`) | [create-account SPEC](ios/create-account/SPEC.md) |
| program-picker | 🏗️ v0.4.1 | `programs` v0.2.0/`invites` via `ProgramContext` (`fetchPrograms` `GET /programs`, `saveProgramOrder` `PUT /programs/order` long-press reorder + collapsed floating search, `deleteProgram`, `updateMembershipStatus` `PUT /program-memberships`, `loadPendingInvites`/`loadMembershipDetails`/`loadLookupData`/`persistSession`/`signOut`) + `notifications` 0.6.0 (the "+" badge = server `badge`, Inbox account row, `inboxRoute` targets) | [program-picker SPEC](ios/program-picker/SPEC.md) |
| admin-home (shell) | 🏗️ v0.2.2 | pure nav — `ProgramContext.isProgramAdmin` for the 4-tab `Admin*/Standard*` bifurcation; no API | [admin-home SPEC](ios/admin-home/SPEC.md) |
| admin-summary (tab) | 🏗️ v0.2.3 | `analytics`/`analytics-v2` via `ProgramContext.loadSummary` (since Phase 3; the per-part loaders were deleted in Phase 4 polish); `programs` (`ProgramDTO.admin_only_data_entry` → data-lock). 5 detail views stubbed | [admin-summary SPEC](ios/admin-summary/SPEC.md) |
| apple-health | 🏗️ v0.7.0 | `apple-health` 0.8.0 + `health-sync` 0.2.0 (HealthKit workout + sleep + **steps** sync via `HealthSyncEngine` → `POST /health-sync/batch` + `GET`/`PUT /health-sync/state`) + `programs` (`fetchPrograms`); **three** independent sections (Workouts + Sleep + Steps); reached from the account menu | [apple-health SPEC](ios/apple-health/SPEC.md) |
| log-workout | 🏗️ v0.3.3 | `workout-logs` 0.5.0 (`POST /workout-logs/batch` + `program_ids[]` multi-select) — the Summary "Add workouts" multi-row form | [log-workout SPEC](ios/log-workout/SPEC.md) |
| log-health | 🏗️ v0.2.3 | `daily-health-logs` 0.2.0 (`POST /daily-health-logs/batch` — batched multi-row, steps, program multi-select) — the Summary "Log daily health" form | [log-health SPEC](ios/log-health/SPEC.md) |
| admin-members / standard-members (Members tab) | 🏗️ v0.5.1 | `member-analytics` 0.7.0 (metrics incl. `avg_steps`; the S5 recipe — owner tokens + render-time identity) + `daily-health-logs` 0.2.0 (health card DC-10 preview) + `people` (header `person.2` → People) via `ProgramContext` | [admin-members SPEC](ios/admin-members/SPEC.md) |
| member-health-detail | 🏗️ v0.2.3 | `daily-health-logs` 0.2.0 (`GET`/`PUT`/`DELETE` — steps sort/filter/edit/CSV, stacked metric-cell rows) | [member-health-detail SPEC](ios/member-health-detail/SPEC.md) |
| admin-workout-types / standard-workout-types (Lifestyle tab) | 🏗️ v0.3.0 | `analytics` 0.2.0 (health timeline steps + `health/steps`) — adds the Steps analytics + Steps Timeline cards | [admin-workout-types SPEC](ios/admin-workout-types/SPEC.md) |
| lifestyle-steps-timeline | 🏗️ v0.1.2 | `analytics` 0.2.0 (`GET /analytics/health/timeline`; daily-steps drill-down) via its own keyed load (`APIClient.fetchHealthTimeline`, frontend-kit D-KIT-21) | [lifestyle-steps-timeline SPEC](ios/lifestyle-steps-timeline/SPEC.md) |
| lifestyle-timeline | 🏗️ v0.1.2 | `analytics` (own keyed load `APIClient.fetchHealthTimeline` `GET /analytics/health/timeline`) — the Sleep · Diet-quality timeline drill-down | [lifestyle-timeline SPEC](ios/lifestyle-timeline/SPEC.md) |
| summary-activity-detail | 🏗️ v0.1.2 | `analytics` (own keyed load `APIClient.fetchActivityTimeline`/`fetchMemberHistory` `GET /analytics/timeline`) — the Workout Activity Timeline drill-down | [summary-activity-detail SPEC](ios/summary-activity-detail/SPEC.md) |
| summary-distribution-detail | 🏗️ v0.1.1 | `analytics` (`ProgramContext.distributionByDayCounts`, loaded by `AdminSummaryTab`) — the Workout Distribution by Day drill-down | [summary-distribution-detail SPEC](ios/summary-distribution-detail/SPEC.md) |
| summary-workout-types-detail | 🏗️ v0.1.0 | `analytics-v2` (`ProgramContext.workoutTypes`, loaded by `AdminSummaryTab`) — the Workout Types drill-down | [summary-workout-types-detail SPEC](ios/summary-workout-types-detail/SPEC.md) |
| member-metrics-detail | 🏗️ v0.2.2 | `member-analytics` (own keyed load `APIClient.fetchMemberMetrics` `GET /member-metrics`; read-only) — the Member Performance Metrics table | [member-metrics-detail SPEC](ios/member-metrics-detail/SPEC.md) |
| member-recent-detail | 🏗️ v0.1.2 | `member-analytics`/`workout-logs` (own keyed load `APIClient.fetchMemberRecentWorkouts` + `updateWorkoutLog`/`deleteWorkoutLog`/`loadProgramWorkouts`) — per-member Workout history (write surface) | [member-recent-detail SPEC](ios/member-recent-detail/SPEC.md) |
| member-streaks-detail | 🏗️ v0.1.1 | `member-analytics` (own load `APIClient.fetchMemberStreaks` `GET /member-streaks`, seeded from the tab's card for the same member) — Streak Stats + milestone ladder | [member-streaks-detail SPEC](ios/member-streaks-detail/SPEC.md) |
| admin-program / standard-program (Program tab) | 🏗️ v0.2.1 | `programs`/`program-memberships` via `ProgramContext` (program info, `leaveProgram()`, admin/standard bifurcation) + `notifications` (My Account `Inbox` row) + `people` (`People` row) — the Program tab (Tab 4) | [admin-program SPEC](ios/admin-program/SPEC.md) |
| program-actions | 🏗️ v0.3.1 | `programs` (`createProgram()`) + `invites` 0.3.0 + `notifications` (tab 0 = `Inbox` for every role) — the create-program + Inbox sheet (the picker "+" target) | [program-actions SPEC](ios/program-actions/SPEC.md) |
| program-member-management | 🏗️ v0.4.0 | `program-memberships` (`fetchMembershipDetails`, role/removal mutations) + `people` (the roster retired → `People` row) — the Program tab's Member Management section | [program-member-management SPEC](ios/program-member-management/SPEC.md) |
| program-role-management | 🏗️ v0.1.2 | `program-memberships` (`fetchMembershipDetails` + role updates) — the Program tab's Role Management section | [program-role-management SPEC](ios/program-role-management/SPEC.md) |
| program-workout-types | 🏗️ v0.2.0 | `program-workouts` (add/rename/delete/toggle) — the Program tab's Workout Types section | [program-workout-types SPEC](ios/program-workout-types/SPEC.md) |
| edit-program | 🏗️ v0.1.1 | `programs` (`updateProgram()` `PUT /programs/:id`) — the swipe-to-edit program editor | [edit-program SPEC](ios/edit-program/SPEC.md) |
| my-profile | 🏗️ v0.4.0 | `auth` (`APIClient.changeEmail()`, profile update, delete account) + `members` 0.5.0 (Hide my activity) — the account-menu "My Profile" screen | [my-profile SPEC](ios/my-profile/SPEC.md) |
| change-password | 🏗️ v0.2.1 | `auth` (`APIClient.changePassword()`) — the account-menu "Change Password" screen | [change-password SPEC](ios/change-password/SPEC.md) |
| appearance | 🏗️ v0.1.1 | none — pure client preference (`ThemeManager` → `UserDefaults`) — the account-menu "Appearance" theme picker | [appearance SPEC](ios/appearance/SPEC.md) |
| notifications | 🏗️ v0.3.0 | `notifications` 0.6.0 (preferences — five category switches + reminder time) + the OS push subsystem (`UserNotifications`; permission asked once) — the account-menu "Notifications" settings screen | [notifications SPEC](ios/notifications/SPEC.md) |
| widget-quick-add-workout | 🏗️ v0.3.1 | `workout-logs` (`addWorkoutLogsBatch`) + `program-workouts`/`program-memberships` lookups — the "Add workouts" widget deep-link form (ios-only; also opened by a `log_workout` notification) | [widget-quick-add-workout SPEC](ios/widget-quick-add-workout/SPEC.md) |
| widget-quick-add-health | 🏗️ v0.2.2 | `daily-health-logs` (`addDailyHealthLogsBatch`) + `program-memberships` lookup — the "Log daily health" widget deep-link form (ios-only) | [widget-quick-add-health SPEC](ios/widget-quick-add-health/SPEC.md) |
| inbox | 🏗️ v0.1.0 | `notifications` 0.6.0 (`/inbox*`, `?inbox=1` stream, app-icon badge, top toast, root Inbox sheet) + `invites` 0.3.0 (Invitations section) — net-new Phase 4 | [inbox SPEC](ios/inbox/SPEC.md) |
| people | 🏗️ v0.1.0 | `people` 0.1.0 (list, profile, kudos, the visibility notice) + `member-analytics` (full stats) + `program-memberships` (Edit membership) — net-new Phase 4 | [people SPEC](ios/people/SPEC.md) |

> **Stance for all iOS screens:** match the CURRENT built web app, not just legacy iOS (web is a co-equal
> reference point) — resolve cross-app divergences toward web parity. The auth path landed the real
> `BrandMark` (vs the legacy placeholder), Login's "Forgot your password?" web-recovery link, and the 4
> create-account cleanups; all `consumed_by=[ios]`, role N/A pre-auth.

**Inventory: COMPLETE** (all screens documented above; the settings sub-routes, member/summary detail
drill-downs, the Program tab + its 4 sections, and the two ios-only quick-add widgets were added to the
index 2026-07-10 after the runs 50→74 build burst; `inbox` + `people` added 2026-10-13, Phase 4). All 34 iOS screen specs are documented above — splash /
login / create-account / program-picker, the 4-tab admin-home shell (Summary / Members / Lifestyle / Program,
admin + standard variants), every detail drill-down (member metrics/history/streaks/recent/health + summary
activity/distribution/workout-types + both lifestyle timelines), the log-workout/log-health forms, the account
settings screens (my-profile / change-password / appearance / notifications), apple-health, the Program tab's
4 management sections, and the two quick-add widgets (workout + daily-health).

## android (Compose) — port of web + ios (thin port-notes)

Faithful 1:1 Compose port of the same app; specs are **thin port-notes** recording the Android realization +
idiom deviations (Material 3, `POST /auth/login/app`, root-gate swap) over the shared web/iOS contract.

| Screen | Status | Consumes (features) | Spec |
|--------|--------|---------------------|------|
| splash | 🏗️ v0.1.1 | `auth` (root `authToken` gate; no API) | [splash SPEC](android/splash/SPEC.md) |
| login | 🏗️ v0.3.1 | `auth` (`ProgramContext.login()` `POST /auth/login/app`) | [login SPEC](android/login/SPEC.md) |
| create-account | 🏗️ v0.5.0 | `auth` (`register()` `POST /auth/register` + `login()` `POST /auth/login/app`) | [create-account SPEC](android/create-account/SPEC.md) |
| forgot-password | 🏗️ v0.1.2 | `auth` (`forgotPassword()` `POST /auth/forgot-password`); `AppLinks.SUPPORT_EMAIL` | [forgot-password SPEC](android/forgot-password/SPEC.md) |
| program-picker | 🏗️ v0.5.0 | `programs`/`invites` (`GET /programs`, `PUT /programs/order`, `DELETE /programs/:id`, `PUT /program-memberships`; `GET /my-invites` · `/all-invites` + `PUT /invite-response`) + `notifications` 0.6.0 (the "+" sheet's Inbox / Create tabs, server badge, Inbox account row) | [program-picker SPEC](android/program-picker/SPEC.md) |
| summary | 🏗️ v0.2.1 | `analytics`/`analytics-v2` (7 reads: MTD participation/workouts/duration/avg, timeline, distribution, workout-types) | [summary SPEC](android/summary/SPEC.md) |
| summary-activity-detail | 🏗️ v0.1.1 | `analytics` (`GET /analytics/timeline?period` via `loadActivityTimeline`; W/M/Y/P selector + tap tooltip) | [summary-activity-detail SPEC](android/summary-activity-detail/SPEC.md) |
| summary-distribution-detail | 🏗️ v0.1.1 | `analytics` (`GET /analytics/distribution/day`, pre-loaded; 7 weekday bars + tap tooltip) | [summary-distribution-detail SPEC](android/summary-distribution-detail/SPEC.md) |
| summary-workout-types-detail | 🏗️ v0.1.1 | `analytics` (`GET /analytics/workouts/types`, pre-loaded; %-share chart + full breakdown) | [summary-workout-types-detail SPEC](android/summary-workout-types-detail/SPEC.md) |
| log-workout | 🏗️ v0.2.3 | `workout-logs` 0.5.0 (`POST /workout-logs/batch` + `program_ids[]` multi-select) + `program-memberships`/`program-workouts` lookups | [log-workout SPEC](android/log-workout/SPEC.md) |
| log-health | 🏗️ v0.2.3 | `daily-health-logs` 0.2.0 (`POST /daily-health-logs/batch` — batched multi-row, steps, program multi-select) + `program-memberships` lookup | [log-health SPEC](android/log-health/SPEC.md) |
| health-connect | 🏗️ v0.4.0 | `health-connect` 0.3.0 + `health-sync` 0.2.0 (Health Connect workout + sleep + **steps** auto-sync; settings + first-sync confirmation; `POST /health-sync/batch` + `GET`/`PUT /health-sync/state`) | [health-connect SPEC](android/health-connect/SPEC.md) |
| members | 🏗️ v0.3.1 | `member-analytics` 0.7.0 (metrics incl. `avg_steps`/history/streaks/recent; the S5 held-key recipe) + `program-memberships` (`GET /program-memberships/members`) + `daily-health-logs` 0.2.0 (health card, steps) + `people` (header `People` button) via `ProgramContext` — Tab 2 | [members SPEC](android/members/SPEC.md) |
| member-metrics-detail | 🏗️ v0.2.2 | `member-analytics` (`GET /member-metrics`; search/sort/filter table) | [member-metrics-detail SPEC](android/member-metrics-detail/SPEC.md) |
| member-history-detail | 🏗️ v0.1.1 | `member-analytics` (`GET /member-history`; per-member workout-history drill-down) | [member-history-detail SPEC](android/member-history-detail/SPEC.md) |
| member-streaks-detail | 🏗️ v0.1.1 | `member-analytics` (`GET /member-streaks`; streak stats + milestone ladder) | [member-streaks-detail SPEC](android/member-streaks-detail/SPEC.md) |
| member-workouts-detail | 🏗️ v0.1.2 | `member-analytics` (`GET /member-recent`) + `workout-logs` (`PUT`/`DELETE /workout-logs`; per-member write surface) | [member-workouts-detail SPEC](android/member-workouts-detail/SPEC.md) |
| member-health-detail | 🏗️ v0.2.3 | `daily-health-logs` 0.2.0 (`GET`/`PUT`/`DELETE /daily-health-logs`; per-member write surface, steps sort/filter/edit/CSV, stacked metric-cell rows) | [member-health-detail SPEC](android/member-health-detail/SPEC.md) |
| member-management | 🏗️ v0.3.0 | `program-memberships` (`POST /program-memberships/invite` + `GET /details` + `PUT` + `removeMember`) + `member-analytics` (full stats) — invite / member-editor / full-stats cluster (the roster retired → `people`) | [member-management SPEC](android/member-management/SPEC.md) |
| lifestyle | 🏗️ v0.2.2 | `analytics` 0.2.0 (workout-types + health timeline steps + `health/steps`) + `analytics-v2` (3 workout-type stat cards) via `ProgramContext.loadLifestyle` — Tab 3; adds Steps analytics + Steps Timeline cards | [lifestyle SPEC](android/lifestyle/SPEC.md) |
| lifestyle-timeline | 🏗️ v0.1.1 | `analytics` (`GET /analytics/health/timeline`; Sleep · Diet-quality drill-down) | [lifestyle-timeline SPEC](android/lifestyle-timeline/SPEC.md) |
| lifestyle-steps-timeline | 🏗️ v0.1.1 | `analytics` 0.2.0 (`GET /analytics/health/timeline`; daily-steps drill-down, shared `BarLineChart` tooltip) | [lifestyle-steps-timeline SPEC](android/lifestyle-steps-timeline/SPEC.md) |
| lifestyle-workout-types | 🏗️ v0.1.2 | `program-workouts` (workout-types manager: catalog + custom `POST`/`PUT`/`DELETE /program-workouts/custom`) via `ProgramContext` | [lifestyle-workout-types SPEC](android/lifestyle-workout-types/SPEC.md) |
| program | 🏗️ v0.3.0 | `program-memberships` (`fetchMembershipDetails` + `leaveProgram`) + `program-workouts` + `notifications` (My Account `Inbox` row) + `people` (`People` row) + `auth` (`signOut`) — Tab 4, role bifurcation | [program SPEC](android/program/SPEC.md) |
| edit-program | 🏗️ v0.1.2 | `programs` (`PUT /programs/:id`; admin program editor) | [edit-program SPEC](android/edit-program/SPEC.md) |
| manage-roles | 🏗️ v0.2.0 | `program-memberships` (`GET /program-memberships/details` + `PUT /program-memberships`; role assignment) | [manage-roles SPEC](android/manage-roles/SPEC.md) |
| my-profile | 🏗️ v0.3.1 | `members` 0.5.0 (`PUT /members/:id`; account profile editor + Hide my activity) + `auth` | [my-profile SPEC](android/my-profile/SPEC.md) |
| change-password | 🏗️ v0.3.0 | `auth` (`PUT /auth/change-password`; account password change) | [change-password SPEC](android/change-password/SPEC.md) |
| appearance | 🏗️ v0.1.1 | none — local `ThemeManager` light/dark/system chooser; no API | [appearance SPEC](android/appearance/SPEC.md) |
| notifications | 🏗️ v0.2.0 | `notifications` 0.6.0 (push status + permission rows; five category switches + reminder time) | [notifications SPEC](android/notifications/SPEC.md) |
| notifications-alerts | 🏗️ v0.4.0 | `notifications` 0.6.0 (`?inbox=1` SSE + the top toast + catch-up + routing by `target`; FCM push on six channels with the monochrome icon: `PUT /notifications/device {inbox:true}` + `POST /notifications/device/unregister`) | [notifications-alerts SPEC](android/notifications-alerts/SPEC.md) |
| widgets | 🏗️ v0.2.4 | `workout-logs` 0.5.1 (`POST /workout-logs/batch`) + `daily-health-logs` 0.2.1 (`POST /daily-health-logs/batch`) + `program-memberships`/`program-workouts` lookups — two quick-add Glance home-screen widgets (workout + daily-health) deep-linking `rasifiters://quick-add-*` into the batch forms; **Android-only hero-glyph tile chrome** (D-ANDROID-WIDGET-4) | [widgets SPEC](android/widgets/SPEC.md) |
| inbox | 🏗️ v0.1.0 | `notifications` 0.6.0 (`/inbox*`, mark-all on every on-screen load, tray clear) + `invites` 0.3.0 (Invitations section) — net-new Phase 4 | [inbox SPEC](android/inbox/SPEC.md) |
| people | 🏗️ v0.1.0 | `people` 0.1.0 (`GET /api/people`; the per-member visibility notice) — net-new Phase 4 (`MEMBER_ROSTER`) | [people SPEC](android/people/SPEC.md) |
| person-profile | 🏗️ v0.1.0 | `people` 0.1.0 (profile + kudos give/undo) + `member-analytics` (full stats) + `program-memberships` (Edit membership) — net-new Phase 4 | [person-profile SPEC](android/person-profile/SPEC.md) |

**Inventory: COMPLETE** (Phases A→J shipped, de-scaffolded 2026-07-08; +`lifestyle-steps-timeline` added 2026-07-09 with the steps-tracking run). All 35 Android screen specs are documented above (`inbox`, `people`, `person-profile` added 2026-10-13, Phase 4) — the 4 bottom tabs (Summary / Members / Lifestyle / Program, admin + standard variants), all their detail drill-downs (incl. the Lifestyle + Steps timelines), the 6 program-settings sub-routes, notifications (settings + real-time alerts), Health Connect, and the two quick-add Glance home-screen widgets (workout + daily-health) shipped 2026-07-09 (see [widgets SPEC](android/widgets/SPEC.md)).
