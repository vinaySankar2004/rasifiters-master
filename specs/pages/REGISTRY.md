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
| _(none yet)_ | — | — | — | — |

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
