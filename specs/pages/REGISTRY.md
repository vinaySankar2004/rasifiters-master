# Page / Screen Registry (L4) — RaSi Fiters

Human index of **page/screen specs** — one per web page and per iOS screen. Specs live at
`specs/pages/web/<page>/SPEC.md` and `specs/pages/ios/<screen>/SPEC.md`. Each page spec captures purpose,
contents, the shared features it consumes, and **role-based view rules** (what global_admin / program
admin / logger / member each see and can do). Shared capabilities are indexed in
[`../features/REGISTRY.md`](../features/REGISTRY.md).

Status legend: 📄 documented → 🏗️ built → 🚀 deployed → ⊘ retired.

## web (Next.js) — reference: `../../../rasifiters-webapp`

| Page | Route | Status | Consumes (features) | Spec |
|------|-------|--------|---------------------|------|
| splash | `/splash` (root `/` redirects here) | 🏗️ v0.1.0 | `auth` (foundation `useAuth`; no API) | [splash SPEC](web/splash/SPEC.md) |
| login | `/login` | 🏗️ v0.1.1 | `auth` (`login()` `POST /auth/login/global`, `useAuth`, jwt helpers) | [login SPEC](web/login/SPEC.md) |
| forgot-password | `/forgot-password` | 🏗️ v0.1.0 | `auth` v0.3.0 (`requestPasswordReset()` `POST /auth/forgot-password`, `useAuth`); `SUPPORT_EMAIL` | [forgot-password SPEC](web/forgot-password/SPEC.md) |
| reset-password | `/reset-password` | 🏗️ v0.1.0 | `auth` v0.4.0 (`resetPassword()` `POST /auth/reset-password`, `useAuth`, `ApiError`) | [reset-password SPEC](web/reset-password/SPEC.md) |
| create-account | `/create-account` | 🏗️ v0.1.0 | `auth` (`registerAccount()` `POST /auth/register` + `login()`, `useAuth`, jwt helpers) | [create-account SPEC](web/create-account/SPEC.md) |
| programs | `/programs` (first **protected** route) | 🏗️ v0.1.0 | `programs` + `program-memberships` + `invites` (CRUD, invites, membership) + `auth` (`useAuth`/`useAuthGuard`) | [programs SPEC](web/programs/SPEC.md) |
| summary | `/summary` (first **workspace tab**) | 🏗️ v0.1.0 | `analytics` + `analytics-v2` (8 reads) + `workout-logs` + `daily-health-logs` (3 writes) + `program-workouts`/`program-memberships` (form lookups) + `auth` (`useAuthGuard`) | [summary SPEC](web/summary/SPEC.md) |
| members | `/members` (second **workspace tab**) | 🏗️ v0.1.0 | `member-analytics` (metrics/history/streaks/recent) + `daily-health-logs` (health card) + `program-memberships` (`fetchProgramMembers` → view-as picker) + `auth` (`useAuthGuard`) | [members SPEC](web/members/SPEC.md) |

Inventory to document (from the research pass): splash · login · create-account · privacy-policy · support ·
programs · program (+ profile/password/appearance/privacy/roles/edit) · summary (+ activity/distribution/
workout-types/log-workout/log-health/bulk-log-workout) · members (+ list/detail/invite/metrics/health/
history/workouts/streaks) · lifestyle (+ timeline/workouts).

## ios (SwiftUI) — reference: `../../../ios-mobile`

| Screen | Status | Consumes (features) | Spec |
|--------|--------|---------------------|------|
| _(none yet)_ | — | — | — |

Inventory to document: splash · login · create-account · program-picker · admin-home (summary/members/
lifestyle/program tabs, admin + standard variants) · member-detail (metrics/history/streaks/recent/health) ·
settings (profile/password/appearance/notifications) · widgets (quick-add-workout, quick-add-health,
ios-only) · notification-modal.

_Fresh scaffold — no page specs yet. Authored via the `question-asker` skill (page mode). See
`PROGRESS.md`._
