# Page / Screen Registry (L4) — RaSi Fiters

Human index of **page/screen specs** — one per web page and per iOS screen. Specs live at
`specs/pages/web/<page>/SPEC.md` and `specs/pages/ios/<screen>/SPEC.md`. Each page spec captures purpose,
contents, the shared features it consumes, and **role-based view rules** (what global_admin / program
admin / logger / member each see and can do). Shared capabilities are indexed in
[`../features/REGISTRY.md`](../features/REGISTRY.md).

Status legend: 📄 documented → 🏗️ built → 🚀 deployed → ⊘ retired.

## web (Next.js) — reference: `rasifiters-webapp`

| Page | Route | Status | Consumes (features) | Spec |
|------|-------|--------|---------------------|------|
| splash | `/splash` (root `/` redirects here) | 🏗️ v0.2.0 | `auth` (foundation `useAuth`; no API) | [splash SPEC](web/splash/SPEC.md) |
| login | `/login` | 🏗️ v0.1.1 | `auth` (`login()` `POST /auth/login/global`, `useAuth`, jwt helpers) | [login SPEC](web/login/SPEC.md) |
| forgot-password | `/forgot-password` | 🏗️ v0.1.0 | `auth` v0.3.0 (`requestPasswordReset()` `POST /auth/forgot-password`, `useAuth`); `SUPPORT_EMAIL` | [forgot-password SPEC](web/forgot-password/SPEC.md) |
| reset-password | `/reset-password` | 🏗️ v0.1.0 | `auth` v0.4.0 (`resetPassword()` `POST /auth/reset-password`, `useAuth`, `ApiError`) | [reset-password SPEC](web/reset-password/SPEC.md) |
| create-account | `/create-account` | 🏗️ v0.1.0 | `auth` (`registerAccount()` `POST /auth/register` + `login()`, `useAuth`, jwt helpers) | [create-account SPEC](web/create-account/SPEC.md) |
| programs | `/programs` (first **protected** route) | 🏗️ v0.2.1 | `programs` v0.2.0 + `program-memberships` + `invites` (CRUD, invites, membership, `saveProgramOrder` `PUT /programs/order` drag-reorder + collapsed floating search) + `auth` (`useAuth`/`useAuthGuard`) | [programs SPEC](web/programs/SPEC.md) |
| summary | `/summary` (first **workspace tab**) | 🏗️ v0.1.0 | `analytics` + `analytics-v2` (8 reads) + `workout-logs` + `daily-health-logs` (3 writes) + `program-workouts`/`program-memberships` (form lookups) + `auth` (`useAuthGuard`) | [summary SPEC](web/summary/SPEC.md) |
| members | `/members` (second **workspace tab**) | 🏗️ v0.1.0 | `member-analytics` (metrics/history/streaks/recent) + `daily-health-logs` (health card) + `program-memberships` (`fetchProgramMembers` → view-as picker) + `auth` (`useAuthGuard`) | [members SPEC](web/members/SPEC.md) |
| lifestyle | `/lifestyle` (third **workspace tab**) | 🏗️ v0.1.0 | `analytics` (`workouts/types` popularity + `health/timeline`) + `analytics-v2` (4 workout-type stats) + `program-memberships` (`fetchProgramMembers` → view-as picker) + `auth` (`useAuthGuard`) | [lifestyle SPEC](web/lifestyle/SPEC.md) |
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
| login | 🏗️ v0.1.0 | `auth` (`APIClient.loginGlobal()` `POST /auth/login/global`, `ProgramContext+Auth`) | [login SPEC](ios/login/SPEC.md) |
| create-account | 🏗️ v0.1.0 | `auth` (`registerAccount()` `POST /auth/register` + `loginGlobal()`, `ProgramContext+Auth`) | [create-account SPEC](ios/create-account/SPEC.md) |
| program-picker | 🏗️ v0.2.2 | `programs` v0.2.0/`invites` via `ProgramContext` (`fetchPrograms` `GET /programs`, `saveProgramOrder` `PUT /programs/order` long-press reorder + collapsed floating search, `deleteProgram`, `updateMembershipStatus` `PUT /program-memberships`, `loadPendingInvites`/`loadMembershipDetails`/`loadLookupData`/`persistSession`/`signOut`) | [program-picker SPEC](ios/program-picker/SPEC.md) |
| admin-home (shell) | 🏗️ v0.1.0 | pure nav — `ProgramContext.isProgramAdmin` for the 4-tab `Admin*/Standard*` bifurcation; no API | [admin-home SPEC](ios/admin-home/SPEC.md) |
| admin-summary (tab) | 🏗️ v0.1.0 | `analytics`/`analytics-v2` via `ProgramContext+Analytics` (MTD + timeline + distribution + workout-types loaders); `programs` (`ProgramDTO.admin_only_data_entry` → data-lock). 5 detail views stubbed | [admin-summary SPEC](ios/admin-summary/SPEC.md) |
| apple-health | 🏗️ v0.2.0 | `apple-health` (HealthKit workout + sleep sync via `ProgramContext+HealthKit`/`+HealthKitSleep`) + `programs` (`fetchPrograms`); two independent sections (Workouts + Sleep); reached from the account menu | [apple-health SPEC](ios/apple-health/SPEC.md) |

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
| login | 🏗️ v0.1.0 | `auth` (`ProgramContext.login()` `POST /auth/login/app`) | [login SPEC](android/login/SPEC.md) |
| create-account | 🏗️ v0.1.0 | `auth` (`register()` `POST /auth/register` + `login()` `POST /auth/login/app`) | [create-account SPEC](android/create-account/SPEC.md) |
| forgot-password | 🏗️ v0.1.0 | `auth` (`forgotPassword()` `POST /auth/forgot-password`); `AppLinks.SUPPORT_EMAIL` | [forgot-password SPEC](android/forgot-password/SPEC.md) |

Inventory to document (Phases C→J): ~~splash~~ · ~~login~~ · ~~create-account~~ · ~~forgot-password~~ ·
program-picker · per-program shell (summary/members/lifestyle/program, admin + standard) + all details ·
settings (edit/roles/profile/password/appearance/privacy + Health Connect). Widgets (Glance) deferred.
