# Screen: `members` (android) — the per-member performance dashboard (second bottom tab)

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.2 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios admin-members`](../../ios/admin-members/SPEC.md)
> + [`web members`](../../web/members/SPEC.md) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.MEMBERS` (`MembersScreen`) — Tab 2 of the per-program
> tab shell. The tab body bifurcates on `ProgramContext.isProgramAdmin` (`AdminMembersBody` / `StandardMembersBody`).
> **Consumes:** the Members reads via `ProgramContext` — `loadProgramMembers` (`GET /program-memberships/members`),
> `loadMemberMetrics` (`GET /member-metrics`), `loadMemberOverview`, `loadMemberHistory`, `loadMemberStreaks`,
> `loadMemberRecent`, `loadMemberHealthLogs`. Read-only tab (no write here).
> **Files:** `ui/members/{MembersScreen,MemberCards}.kt` (+ the 8 detail screens it pushes into).

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1) — role bifurcation on `isProgramAdmin`:**
  - **Admin / global-admin variant** (`AdminMembersBody`): header **"Members" + program name + an Invite glass
    button**; a **`MemberMetricsPreviewCard`** (over-fetches the leaderboard, shows the top member + count →
    metrics detail); a **"View as" selector** (global-admin defaults to **"None"**, program-admin auto-selects
    self via `loggedInMemberId`); and, once a member is picked, the **5 member cards** (Overview · History ·
    Streak · Recent · Health).
  - **Logger / member variant** (`StandardMembersBody`): the viewer's own **Overview** + self **`MemberMetricsCard`**
    (hero = Workouts) + **History** + **Streak**, then **Recent + Health**. A **logger** additionally gets a
    **logs-only "View as"** that re-scopes only Recent + Health (`LaunchedEffect(loggerViewAsId)`); a plain member
    has no picker.
- **Read-only tab (iOS F1):** every loader's error is swallowed — a failed read just leaves the empty/placeholder
  card ("No workouts logged yet." / "No daily health logs yet." / "No members to display"); no error banner.
- **"View as" picker sheet (iOS `MemberPickerView`):** a `ModalBottomSheet` — searchable ("Search member",
  substring, case-insensitive), a ✓ + orange text on the selected row, and (global-admin only) a leading **"None"**
  row that clears the selection.
- **`GlassIconButton` (iOS `GlassButton` analog):** a 52dp circular **orange→AppOrangeGradientEnd** gradient icon
  button — `MailOutline` "Invite member" for admins (→ `MEMBER_INVITE`), `Group` "View members" for the standard
  body (→ `MEMBER_ROSTER`).
- **Deviation A-1 (flat card vs iOS glass):** the inline cards render in a flat Material `SummaryCard` (the
  established Android substitution for iOS's glassy `CardShell`); same content, order, labels, empty copy. Each
  card is a chevron-header drill-down (`DrillCard` = the Compose analogue of an iOS `NavigationLink` push).
- **Deviation A-2 (focusMember-at-click, no navArgs):** the detail routes are static (`Routes.MEMBER_*`), so
  `ProgramContext.focusMember(id, name)` stashes the scoped member into `focusedMemberId`/`focusedMemberName`
  **before every push** (and again per-card on click) — Android's "static route reads context" idiom, in place of
  iOS `NavigationLink` value passing.
- **Deviation A-3 (persisted "View as"):** the roster + selection live in `ProgramContext`
  (`members` / `membersViewAsId` + `setMembersViewAs`, defaulted once per program by `ensureMembersLoaded()`),
  NOT screen-local `remember` — so the pick **survives a detail push + back** (Nav-Compose disposes the tab
  composable on push; screen-local state would reset to the default). See [[persist-tab-selections-across-nav]].
- **Deviation A-4 (icon-less metrics-preview tiles):** the 3 mini tiles in `MemberMetricsPreviewCard`
  (Workouts / Active Days / Types) drop the metric icon (`MiniStatTile`) so "Active Days" stays on one line —
  matches the iOS preview (icons appear only in the full metric grid, not the tab-level preview).
- **Charts carry the shared tooltip:** the Workout-Activity-Timeline card + the history detail pass
  `BarLineChart(tooltip = …)` (`memberWorkoutsTooltip` — "MMM d" title + "N workouts" row) — every chart has the
  tap/drag callout, per [[chart-tooltips-mandatory]].

## Data / API (all via `ProgramContext`, Bearer-authed by the OkHttp layer)

| Call | Endpoint | Sets / does |
|------|----------|-------------|
| `ensureMembersLoaded` | `GET /program-memberships/members` | roster (`members`) + default `membersViewAsId` (once/program; persisted) |
| `loadMemberMetrics(sort,direction)` | `GET /member-metrics` | preview card (admin) / self metrics card (standard) |
| `loadMemberOverview(id)` | `GET /member-metrics?memberId` | `selectedMemberOverview` (Overview card) |
| `loadMemberHistory(id,"week")` | `GET /member-history` | `memberHistory` (timeline card) |
| `loadMemberStreaks(id)` | `GET /member-streaks` | `memberStreaks` (streak card) |
| `loadMemberRecent(id,limit=10)` | `GET /member-recent` | `memberRecent` (View Workouts card, top 3) |
| `loadMemberHealthLogs(id,limit=10)` | `GET /daily-health-logs` | `memberHealthLogs` (View Health card, top 3) |

The admin body re-loads the 5 reads on `LaunchedEffect(selectedId)`; the standard body loads self once per program
and re-scopes logs on the logger view-as change.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-08 | Initial Android port (Phase E — the Members **tab body**). Role bifurcation on `isProgramAdmin`; Invite `GlassIconButton`; `MemberMetricsPreviewCard`; searchable "View as" picker (global-admin "None" / program-admin auto-self / logger logs-only); the 5 inline cards. Read-only (iOS F1). Deviations A-1 (flat SummaryCard) + A-2 (focusMember-at-click, no navArgs). All 8 detail targets are real screens this phase. `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
| 0.1.1 | 2026-07-08 | Visual-pass polish: **A-3** persisted "View as" (hoisted to `ProgramContext` — survives detail push+back); **A-4** icon-less metrics-preview tiles (`MiniStatTile`, "Active Days" one line); chart **tooltips** added to the history card + detail; metrics-detail title auto-fits (`DetailTopBarWithExport`); contextual menus use the shared themed `AppDropdownMenu`. |
| 0.1.2 | 2026-07-09 | **Steps in the overview grid + View Health preview** (steps-tracking). `MetricsGrid` (`MemberCards.kt`) gains a 5th row: an **Avg Steps** `StatTile` (`Icons.AutoMirrored.Filled.DirectionsWalk`, `String.format("%,d", m.avgSteps)` or "—" — member-analytics 0.2.0) beside the `StreakChip` (moved into the grid as the 2nd column). `MemberHealthCard`'s preview rows adopt the **DC-10** two-line format (`ListLine(title = h.logDate, subtitle = "Sleep … · Diet … · Steps …")`, `—` for missing, steps grouped). `MemberMetricsDTO` gains `avg_steps`; `MemberHealthItem` gains `steps`. `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
