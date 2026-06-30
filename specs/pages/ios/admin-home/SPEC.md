# iOS Screen SPEC — `AdminHomeView` (the post-pick home shell)

> **Surface:** `ios` · **Reference impl (legacy):** `../ios-mobile/RaSi-Fiters-App/Features/Home/AdminHomeView.swift`
> **Web sibling (co-equal reference):** the `(workspace)` group — `/summary` · `/members` · `/lifestyle` · `/program`
> **Ported to:** `apps/ios/RaSi-Fiters-App/Features/Home/AdminHomeView.swift` · **Run:** 53 (2026-06-30)

## 1. What it is + who uses it
The **post-auth home shell** — a native bottom `TabView` with 4 tabs (Summary · Members · Lifestyle ·
Program). It is the screen `ProgramPickerView` pushes when a member opens a program card
(`ProgramPickerView.swift:165` → `AdminHomeView()`), after `applyProgram` hydrates the `ProgramContext`.
Every authed role lands here once a program is active; the tab *bodies* differ by role.

## 2. Why it exists
It is the **root of the in-program experience** — the iOS analogue of the web workspace. On web the same
four areas are four top-level routes (`/summary`, `/members`, `/lifestyle`, `/program`) under a shared nav
layout; iOS collapses them into one native `TabView` (the platform idiom). The shell owns **only the tab
navigation + the role bifurcation**; each tab's content is a separate, deferred screen.

## 3. Route / location
- **App:** ios · **File:** `Features/Home/AdminHomeView.swift`
- **Entry:** pushed onto the `NavigationStack` from `ProgramPickerView` (program-card tap → `applyProgram`
  + `persistSession` → `AdminHomeView()`). `.navigationBarBackButtonHidden(true)` — the program switch is
  via the picker/account flows, not a back-swipe.

## 4. Contents / sections
| Block | Reference `file:line` | Notes |
|---|---|---|
| `TabView(selection:)` host | `AdminHomeView.swift:34-58` | 4 tabs, `.adaptiveTint()` + `.navigationBarBackButtonHidden(true)` |
| Tab 1 — **Summary** | `:35-39` | `AdminSummaryTab(period: $summaryPeriod)`, icon `chart.bar.fill`. **Single** (not role-bifurcated) |
| Tab 2 — **Members** | `:41-45, 63-70` | `Label("Members", "person.3.fill")`; `AdminMembersTab` / `StandardMembersTab` by `isProgramAdmin` |
| Tab 3 — **Lifestyle** | `:47-51, 72-79` | `Label("Lifestyle", "leaf.fill")`; internal tag `workoutTypes`; `AdminWorkoutTypesTab` / `StandardWorkoutTypesTab` |
| Tab 4 — **Program** | `:53-57, 81-88` | `Label("Program", "calendar.badge.clock")`; `AdminProgramTab` / `StandardProgramTab` |
| `Period` enum (nested) | `:11-27` | `W/M/Y/P` → `week/month/year/program`; `@State summaryPeriod`, bound into the Summary tab. **Ships with the shell** (the tab bodies reference `AdminHomeView.Period`) |

## 5. Components + features consumed
- **`ProgramContext`** (`Shared/Models/ProgramContext.swift`) — `@EnvironmentObject`; the shell reads only
  `isProgramAdmin` (`:269`) to pick each tab's Admin/Standard variant.
- **`adaptiveTint()`** (`Shared/Theme/AppTheme.swift:208`) — theme tint modifier on the `TabView`.
- **Tab bodies (DEFERRED, stubbed):** `AdminSummaryTab`, `AdminMembersTab`, `StandardMembersTab`,
  `AdminWorkoutTypesTab`, `StandardWorkoutTypesTab`, `AdminProgramTab`, `StandardProgramTab` — each its own
  later screen (the `Tabs/` + `Detail/` + `Settings/` + `Sheets/` universe).

## 6. Data / API
**None at the shell level.** The shell fetches nothing and calls no endpoint — it is pure navigation. All
data loading lives in the deferred tab bodies.

## 7. Role-based view rules
| Role | Summary | Members | Lifestyle | Program |
|---|---|---|---|---|
| global_admin | `AdminSummaryTab` | `AdminMembersTab` | `AdminWorkoutTypesTab` | `AdminProgramTab` |
| program admin | `AdminSummaryTab` | `AdminMembersTab` | `AdminWorkoutTypesTab` | `AdminProgramTab` |
| logger | `AdminSummaryTab` | `StandardMembersTab` | `StandardWorkoutTypesTab` | `StandardProgramTab` |
| member | `AdminSummaryTab` | `StandardMembersTab` | `StandardWorkoutTypesTab` | `StandardProgramTab` |

- The split is `programContext.isProgramAdmin` (global_admin OR program admin of the active program →
  `true`). All 4 tabs are **visible to every role**; only the Members/Lifestyle/Program *bodies* swap
  variant. The Summary tab is identical for all roles.
- **`admin_only_data_entry` — N/A at the shell.** The shell does no data entry; the lock gates the *log
  forms* deep inside the deferred tab bodies (read into `ProgramContext` at pick time, applied downstream),
  never the navigation.

## 8. States & edge cases
- **Single render** — no loading/empty/error/offline states (the shell does no I/O). Each tab's states are
  the deferred bodies' concern.
- `selectedTab` defaults to `.summary`; `summaryPeriod` defaults to `.week`.

## 9. Decisions made
| ID | Decision | Rests on |
|---|---|---|
| **D-SCOPE** | **The scope cut IS the run** — port the `AdminHomeView` TabView shell verbatim (4 tabs, `Period` enum, `isProgramAdmin` bifurcation) and **defer the 7 tab bodies as `ScaffoldPlaceholder` stubs**. The run-52/21/50 pattern (port the screen, stub the forward-nav targets). | `AdminHomeView.swift:1-96`; 7 tab bodies are 8–14 KB each + the whole `Detail/Settings/Sheets` universe |
| **D-REF** | **Keep iOS-native `TabView`** — do NOT collapse to web's 4-top-level-routes-with-nav layout. Platform-idiom EXCEPTION to web parity (memory `ios-matches-web-not-just-legacy`; the run-52 D-REF shape). Tab set + order already match web (Summary/Members/Lifestyle/Program), so it is a structural idiom divergence, not a parity gap. | `AdminHomeView.swift:34-58`; web `(workspace)` routes |
| **D-S1** | **Faithful 1:1 to the legacy iOS shell** — same `TabView`, tab labels/SF-Symbol icons, the `Admin*`/`Standard*` `@ViewBuilder` role switches, `.adaptiveTint()`, `.navigationBarBackButtonHidden(true)`, the nested `Period` enum. No web-parity deviation (the shell is pure nav; tab set/order already match web; no behavior to diff vs web — unlike run-52's silent-error-swallow). | `AdminHomeView.swift:3-96` |
| **D-DEPS** | **No new dependency** — `isProgramAdmin` (`ProgramContext.swift:269`) + `adaptiveTint()` (`AppTheme.swift:208`) ported in the foundation (run 50); all 7 tab-body names collision-free. The run ports the shell file + rewrites the stub block. | dep-purity grep, run 53 |

## 10. Flagged characteristics (kept as-is)
- **F1 — Role bifurcation by physically-separate views.** iOS has distinct `Admin*Tab`/`Standard*Tab`
  structs; web gates within one page component by role flag. Faithful to legacy iOS (kept); the tab bodies
  resolve their own web parity when ported. (`AdminHomeView.swift:63-88`)
- **F2 — Internal `workoutTypes` tag for the "Lifestyle" tab.** The third tab's enum case is `workoutTypes`
  but its label is "Lifestyle" (matches web `/lifestyle`). Faithful naming quirk. (`AdminHomeView.swift:7, 49`)
- **F3 — 7 deferred forward-nav stubs.** `AdminSummaryTab` + the 6 `Admin*/Standard*` variant tabs are
  `ScaffoldPlaceholder` stubs until ported per-screen. The `AdminSummaryTab` stub carries a
  `period: Binding<AdminHomeView.Period>` initializer to match the shell's call site. (run-21/50/52 pattern)
- **F4 — `navigationBarBackButtonHidden(true)`.** No back-swipe off the home shell; program switching is via
  the picker/account flows. Faithful. (`AdminHomeView.swift:60`)

## 11. Changelog
- **v0.1.0** (run 53, 2026-06-30) — initial SPEC; AdminHomeView shell ported, 7 tab bodies stubbed.
