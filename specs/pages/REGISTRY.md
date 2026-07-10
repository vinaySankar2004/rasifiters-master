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
| landing | `/` (root, **public marketing**) | 🏗️ v0.1.0 | `auth` (foundation `useAuth` for the auth-aware CTA; no API) | [landing SPEC](web/landing/SPEC.md) |
| splash | `/splash` (retained, **unlinked**; root `/` now serves landing) | 🏗️ v0.2.1 | `auth` (foundation `useAuth`; no API) | [splash SPEC](web/splash/SPEC.md) |
| login | `/login` | 🏗️ v0.2.0 | `auth` (`login()` `POST /auth/login/global`, `useAuth`, jwt helpers) | [login SPEC](web/login/SPEC.md) |
| forgot-password | `/forgot-password` | 🏗️ v0.1.0 | `auth` v0.3.0 (`requestPasswordReset()` `POST /auth/forgot-password`, `useAuth`); `SUPPORT_EMAIL` | [forgot-password SPEC](web/forgot-password/SPEC.md) |
| reset-password | `/reset-password` | 🏗️ v0.1.0 | `auth` v0.4.0 (`resetPassword()` `POST /auth/reset-password`, `useAuth`, `ApiError`) | [reset-password SPEC](web/reset-password/SPEC.md) |
| create-account | `/create-account` | 🏗️ v0.2.0 | `auth` (`registerAccount()` `POST /auth/register` + `login()`, `useAuth`, jwt helpers) | [create-account SPEC](web/create-account/SPEC.md) |
| programs | `/programs` (first **protected** route) | 🏗️ v0.2.1 | `programs` v0.2.0 + `program-memberships` + `invites` (CRUD, invites, membership, `saveProgramOrder` `PUT /programs/order` drag-reorder + collapsed floating search) + `auth` (`useAuth`/`useAuthGuard`) | [programs SPEC](web/programs/SPEC.md) |
| summary | `/summary` (first **workspace tab**) | 🏗️ v0.3.0 | `analytics` + `analytics-v2` (8 reads) + `workout-logs` 0.5.0 + `daily-health-logs` 0.2.0 (batched multi-program writes) + `program-workouts`/`program-memberships` (form lookups + program multi-select) + `auth` (`useAuthGuard`) | [summary SPEC](web/summary/SPEC.md) |
| summary/log-workout | `/summary/log-workout` | 🏗️ v0.2.0 | `workout-logs` 0.5.0 (`POST /workout-logs/batch` + `program_ids[]`) + `program-memberships`/`program-workouts` lookups + `auth` | [summary/log-workout SPEC](web/summary/log-workout/SPEC.md) |
| summary/log-health | `/summary/log-health` | 🏗️ v0.2.0 | `daily-health-logs` 0.2.0 (`POST /daily-health-logs/batch` + steps + `program_ids[]`) + `program-memberships` lookup + `auth` | [summary/log-health SPEC](web/summary/log-health/SPEC.md) |
| members | `/members` (second **workspace tab**) | 🏗️ v0.2.0 | `member-analytics` 0.2.0 (metrics incl. `avg_steps`/history/streaks/recent) + `daily-health-logs` 0.2.0 (health card, steps) + `program-memberships` (`fetchProgramMembers` → view-as picker) + `auth` (`useAuthGuard`) | [members SPEC](web/members/SPEC.md) |
| members/health | `/members/health` | 🏗️ v0.2.1 | `member-analytics` (`GET /daily-health-logs` list) + `daily-health-logs` 0.2.0 (`PUT`/`DELETE`, steps sort/filter/edit/CSV, stacked metric-cell rows) + `auth` | [members/health SPEC](web/members/health/SPEC.md) |
| lifestyle | `/lifestyle` (third **workspace tab**) | 🏗️ v0.2.0 | `analytics` 0.2.0 (`workouts/types` popularity + `health/timeline` steps + `health/steps`) + `analytics-v2` (4 workout-type stats) + `program-memberships` (`fetchProgramMembers` → view-as picker) + `auth` (`useAuthGuard`) | [lifestyle SPEC](web/lifestyle/SPEC.md) |
| lifestyle/steps-timeline | `/lifestyle/steps-timeline` | 🏗️ v0.1.0 | `analytics` 0.2.0 (`GET /analytics/health/timeline`; daily-steps drill-down) + `auth` | [lifestyle/steps-timeline SPEC](web/lifestyle/steps-timeline/SPEC.md) |
| program | `/program` (fourth & last **workspace tab**) | 🏗️ v0.1.0 | `program-memberships` (`fetchMembershipDetails` + `leaveProgram`) + `program-workouts` (`fetchProgramWorkouts`) + `auth` (`useAuthGuard`/`useAuth.signOut`) | [program SPEC](web/program/SPEC.md) |
| program/edit | `/program/edit` (program-settings **sub-route** 1/6) | 🏗️ v0.1.0 | `programs` (`updateProgram` `PUT /programs/:id`) + `auth` (`useAuthGuard`) | [program/edit SPEC](web/program/edit/SPEC.md) |
| program/roles | `/program/roles` (program-settings **sub-route** 2/6) | 🏗️ v0.1.0 | `program-memberships` (`fetchMembershipDetails` `GET /program-memberships/details` + `updateMembership` `PUT /program-memberships`) + `auth` (`useAuthGuard`) | [program/roles SPEC](web/program/roles/SPEC.md) |

Inventory to document (from the research pass): splash · login · create-account · privacy-policy · support ·
programs · ~~program~~ (landing + ~~edit~~ + ~~roles~~ done; + profile/password/appearance/privacy) · summary (+ activity/distribution/
workout-types/log-workout/log-health/bulk-log-workout) · members (+ list/detail/invite/metrics/health/
history/workouts/streaks) · lifestyle (+ timeline/workouts).

## ios (SwiftUI) — reference: `ios-mobile`

| Screen | Status | Consumes (features) | Spec |
|--------|--------|---------------------|------|
| splash | 🏗️ v0.2.0 | `auth` (root `authToken` bifurcation; no API) | [splash SPEC](ios/splash/SPEC.md) |
| login | 🏗️ v0.2.0 | `auth` (`APIClient.loginGlobal()` `POST /auth/login/global`, `ProgramContext+Auth`) | [login SPEC](ios/login/SPEC.md) |
| create-account | 🏗️ v0.2.0 | `auth` (`registerAccount()` `POST /auth/register` + `loginGlobal()`, `ProgramContext+Auth`) | [create-account SPEC](ios/create-account/SPEC.md) |
| program-picker | 🏗️ v0.2.2 | `programs` v0.2.0/`invites` via `ProgramContext` (`fetchPrograms` `GET /programs`, `saveProgramOrder` `PUT /programs/order` long-press reorder + collapsed floating search, `deleteProgram`, `updateMembershipStatus` `PUT /program-memberships`, `loadPendingInvites`/`loadMembershipDetails`/`loadLookupData`/`persistSession`/`signOut`) | [program-picker SPEC](ios/program-picker/SPEC.md) |
| admin-home (shell) | 🏗️ v0.1.0 | pure nav — `ProgramContext.isProgramAdmin` for the 4-tab `Admin*/Standard*` bifurcation; no API | [admin-home SPEC](ios/admin-home/SPEC.md) |
| admin-summary (tab) | 🏗️ v0.1.0 | `analytics`/`analytics-v2` via `ProgramContext+Analytics` (MTD + timeline + distribution + workout-types loaders); `programs` (`ProgramDTO.admin_only_data_entry` → data-lock). 5 detail views stubbed | [admin-summary SPEC](ios/admin-summary/SPEC.md) |
| apple-health | 🏗️ v0.4.0 | `apple-health` 0.7.0 (HealthKit workout + sleep + **steps** sync via `ProgramContext+HealthKit`/`+HealthKitSleep`/`+HealthKitSteps`) + `programs` (`fetchPrograms`); **three** independent sections (Workouts + Sleep + Steps); reached from the account menu | [apple-health SPEC](ios/apple-health/SPEC.md) |
| log-workout | 🏗️ v0.3.0 | `workout-logs` 0.5.0 (`POST /workout-logs/batch` + `program_ids[]` multi-select) — the Summary "Add workouts" multi-row form | [log-workout SPEC](ios/log-workout/SPEC.md) |
| log-health | 🏗️ v0.2.0 | `daily-health-logs` 0.2.0 (`POST /daily-health-logs/batch` — batched multi-row, steps, program multi-select) — the Summary "Log daily health" form | [log-health SPEC](ios/log-health/SPEC.md) |
| admin-members / standard-members (Members tab) | 🏗️ v0.2.0 | `member-analytics` 0.2.0 (metrics incl. `avg_steps`) + `daily-health-logs` 0.2.0 (health card DC-10 preview) via `ProgramContext` | [admin-members SPEC](ios/admin-members/SPEC.md) |
| member-health-detail | 🏗️ v0.2.1 | `daily-health-logs` 0.2.0 (`GET`/`PUT`/`DELETE` — steps sort/filter/edit/CSV, stacked metric-cell rows) | [member-health-detail SPEC](ios/member-health-detail/SPEC.md) |
| admin-workout-types / standard-workout-types (Lifestyle tab) | 🏗️ v0.2.0 | `analytics` 0.2.0 (health timeline steps + `health/steps`) — adds the Steps analytics + Steps Timeline cards | [admin-workout-types SPEC](ios/admin-workout-types/SPEC.md) |
| lifestyle-steps-timeline | 🏗️ v0.1.0 | `analytics` 0.2.0 (`GET /analytics/health/timeline`; daily-steps drill-down) via `ProgramContext.loadHealthTimeline` | [lifestyle-steps-timeline SPEC](ios/lifestyle-steps-timeline/SPEC.md) |

> **Stance for all iOS screens:** match the CURRENT built web app, not just legacy iOS (web is a co-equal
> reference point) — resolve cross-app divergences toward web parity. The auth path landed the real
> `BrandMark` (vs the legacy placeholder), Login's "Forgot your password?" web-recovery link, and the 4
> create-account cleanups; all `consumed_by=[ios]`, role N/A pre-auth.

Inventory to document: ~~splash~~ · ~~login~~ · ~~create-account~~ · ~~program-picker~~ · admin-home (summary/members/
lifestyle/program tabs, admin + standard variants) · member-detail (metrics/history/streaks/recent/health) ·
settings (profile/password/appearance/notifications) · widgets (quick-add-workout, quick-add-health,
ios-only) · notification-modal.

## android (Compose) — port of web + ios (thin port-notes)

Faithful 1:1 Compose port of the same app; specs are **thin port-notes** recording the Android realization +
idiom deviations (Material 3, `POST /auth/login/app`, root-gate swap) over the shared web/iOS contract.

| Screen | Status | Consumes (features) | Spec |
|--------|--------|---------------------|------|
| splash | 🏗️ v0.1.0 | `auth` (root `authToken` gate; no API) | [splash SPEC](android/splash/SPEC.md) |
| login | 🏗️ v0.2.0 | `auth` (`ProgramContext.login()` `POST /auth/login/app`) | [login SPEC](android/login/SPEC.md) |
| create-account | 🏗️ v0.3.0 | `auth` (`register()` `POST /auth/register` + `login()` `POST /auth/login/app`) | [create-account SPEC](android/create-account/SPEC.md) |
| forgot-password | 🏗️ v0.1.1 | `auth` (`forgotPassword()` `POST /auth/forgot-password`); `AppLinks.SUPPORT_EMAIL` | [forgot-password SPEC](android/forgot-password/SPEC.md) |
| program-picker | 🏗️ v0.1.0 | `programs`/`invites` (`GET /programs`, `PUT /programs/order`, `DELETE /programs/:id`, `PUT /program-memberships`) | [program-picker SPEC](android/program-picker/SPEC.md) |
| summary | 🏗️ v0.1.0 | `analytics`/`analytics-v2` (7 reads: MTD participation/workouts/duration/avg, timeline, distribution, workout-types) | [summary SPEC](android/summary/SPEC.md) |
| summary-activity-detail | 🏗️ v0.1.0 | `analytics` (`GET /analytics/timeline?period` via `loadActivityTimeline`; W/M/Y/P selector + tap tooltip) | [summary-activity-detail SPEC](android/summary-activity-detail/SPEC.md) |
| summary-distribution-detail | 🏗️ v0.1.0 | `analytics` (`GET /analytics/distribution/day`, pre-loaded; 7 weekday bars + tap tooltip) | [summary-distribution-detail SPEC](android/summary-distribution-detail/SPEC.md) |
| summary-workout-types-detail | 🏗️ v0.1.0 | `analytics` (`GET /analytics/workouts/types`, pre-loaded; %-share chart + full breakdown) | [summary-workout-types-detail SPEC](android/summary-workout-types-detail/SPEC.md) |
| log-workout | 🏗️ v0.2.0 | `workout-logs` 0.5.0 (`POST /workout-logs/batch` + `program_ids[]` multi-select) + `program-memberships`/`program-workouts` lookups | [log-workout SPEC](android/log-workout/SPEC.md) |
| log-health | 🏗️ v0.2.0 | `daily-health-logs` 0.2.0 (`POST /daily-health-logs/batch` — batched multi-row, steps, program multi-select) + `program-memberships` lookup | [log-health SPEC](android/log-health/SPEC.md) |
| health-connect | 🏗️ v0.2.0 | `health-connect` 0.2.0 (Health Connect workout + sleep + **steps** auto-sync; settings + first-sync confirmation; reuses `POST /workout-logs` + `POST`/`PUT /daily-health-logs`) | [health-connect SPEC](android/health-connect/SPEC.md) |
| members | 🏗️ v0.1.2 | `member-analytics` 0.2.0 (metrics incl. `avg_steps`/history/streaks/recent) + `program-memberships` (`GET /program-memberships/members`) + `daily-health-logs` 0.2.0 (health card, steps) via `ProgramContext` — Tab 2 | [members SPEC](android/members/SPEC.md) |
| member-metrics-detail | 🏗️ v0.1.0 | `member-analytics` (`GET /member-metrics`; search/sort/filter table) | [member-metrics-detail SPEC](android/member-metrics-detail/SPEC.md) |
| member-history-detail | 🏗️ v0.1.0 | `member-analytics` (`GET /member-history`; per-member workout-history drill-down) | [member-history-detail SPEC](android/member-history-detail/SPEC.md) |
| member-streaks-detail | 🏗️ v0.1.0 | `member-analytics` (`GET /member-streaks`; streak stats + milestone ladder) | [member-streaks-detail SPEC](android/member-streaks-detail/SPEC.md) |
| member-workouts-detail | 🏗️ v0.1.0 | `member-analytics` (`GET /member-recent`) + `workout-logs` (`PUT`/`DELETE /workout-logs`; per-member write surface) | [member-workouts-detail SPEC](android/member-workouts-detail/SPEC.md) |
| member-health-detail | 🏗️ v0.2.1 | `daily-health-logs` 0.2.0 (`GET`/`PUT`/`DELETE /daily-health-logs`; per-member write surface, steps sort/filter/edit/CSV, stacked metric-cell rows) | [member-health-detail SPEC](android/member-health-detail/SPEC.md) |
| member-management | 🏗️ v0.1.0 | `program-memberships` (`POST /program-memberships/invite` + `GET /details` + `PUT` + `removeMember`) — invite / roster / member-editor cluster | [member-management SPEC](android/member-management/SPEC.md) |
| lifestyle | 🏗️ v0.2.0 | `analytics` 0.2.0 (workout-types + health timeline steps + `health/steps`) + `analytics-v2` (3 workout-type stat cards) via `ProgramContext.loadLifestyle` — Tab 3; adds Steps analytics + Steps Timeline cards | [lifestyle SPEC](android/lifestyle/SPEC.md) |
| lifestyle-timeline | 🏗️ v0.1.0 | `analytics` (`GET /analytics/health/timeline`; Sleep · Diet-quality drill-down) | [lifestyle-timeline SPEC](android/lifestyle-timeline/SPEC.md) |
| lifestyle-steps-timeline | 🏗️ v0.1.0 | `analytics` 0.2.0 (`GET /analytics/health/timeline`; daily-steps drill-down, shared `BarLineChart` tooltip) | [lifestyle-steps-timeline SPEC](android/lifestyle-steps-timeline/SPEC.md) |
| lifestyle-workout-types | 🏗️ v0.1.0 | `program-workouts` (workout-types manager: catalog + custom `POST`/`PUT`/`DELETE /program-workouts/custom`) via `ProgramContext` | [lifestyle-workout-types SPEC](android/lifestyle-workout-types/SPEC.md) |
| program | 🏗️ v0.1.0 | `program-memberships` (`fetchMembershipDetails` + `leaveProgram`) + `program-workouts` + `auth` (`signOut`) — Tab 4, role bifurcation | [program SPEC](android/program/SPEC.md) |
| edit-program | 🏗️ v0.1.0 | `programs` (`PUT /programs/:id`; admin program editor) | [edit-program SPEC](android/edit-program/SPEC.md) |
| manage-roles | 🏗️ v0.1.0 | `program-memberships` (`GET /program-memberships/details` + `PUT /program-memberships`; role assignment) | [manage-roles SPEC](android/manage-roles/SPEC.md) |
| my-profile | 🏗️ v0.1.0 | `members` (`PUT /members/:id`; account profile editor) + `auth` | [my-profile SPEC](android/my-profile/SPEC.md) |
| change-password | 🏗️ v0.1.0 | `auth` (`POST /auth/change-password`; account password change) | [change-password SPEC](android/change-password/SPEC.md) |
| appearance | 🏗️ v0.1.0 | none — local `ThemeManager` light/dark/system chooser; no API | [appearance SPEC](android/appearance/SPEC.md) |
| notifications | 🏗️ v0.1.0 | `notifications` (push-notification status/settings; device registration) | [notifications SPEC](android/notifications/SPEC.md) |
| notifications-alerts | 🏗️ v0.2.0 | `notifications` (in-app SSE modal queue + FCM push: `GET /notifications/unacknowledged` + `POST /{id}/acknowledge` + `PUT`/`DELETE /notifications/device`) | [notifications-alerts SPEC](android/notifications-alerts/SPEC.md) |
| widgets | 🏗️ v0.2.0 | `workout-logs` 0.5.1 (`POST /workout-logs/batch`) + `daily-health-logs` 0.2.1 (`POST /daily-health-logs/batch`) + `program-memberships`/`program-workouts` lookups — two quick-add Glance home-screen widgets (workout + daily-health) deep-linking `rasifiters://quick-add-*` into the batch forms; **Android-only hero-glyph tile chrome** (D-ANDROID-WIDGET-4) | [widgets SPEC](android/widgets/SPEC.md) |

**Inventory: COMPLETE** (Phases A→J shipped, de-scaffolded 2026-07-08; +`lifestyle-steps-timeline` added 2026-07-09 with the steps-tracking run). All 32 Android screen specs are documented above — the 4 bottom tabs (Summary / Members / Lifestyle / Program, admin + standard variants), all their detail drill-downs (incl. the Lifestyle + Steps timelines), the 6 program-settings sub-routes, notifications (settings + real-time alerts), Health Connect, and the two quick-add Glance home-screen widgets (workout + daily-health) shipped 2026-07-09 (see [widgets SPEC](android/widgets/SPEC.md)).
