# Screen: `member-metrics-detail` (ios) — the Member Performance Metrics table

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from the Members tab's metrics-preview card
> (`AdminMembersTab.swift:45`, `NavigationLink { MemberMetricsDetailView() }`).
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/Detail/MemberMetricsViews.swift`
> (`MemberMetricsDetailView`, lines 218–404) + `MemberPickerOverviewView.swift` (`MetricsFilters`/`SortSheet`/
> `FilterSheet`, lines 236–410).
> **Web parity reference:** [`web members/metrics`](../../web/members/metrics/SPEC.md) — same searchable + server-sorted +
> server-filtered metrics grid + client CSV export. Faithful-agree → faithful IS web parity.
> **Consumes:** `ProgramContext.loadMemberMetrics` (`GET /member-metrics`); reads `memberMetrics`. No write.
> **Stance:** faithful 1:1 port. Oddities §10.

---

## 1. What it is + who uses it

The **member-performance metrics table** — a searchable, server-sortable, server-filterable scroll of
`MemberMetricsCard`s (one per program member), each showing a hero metric (sort-coupled) + a mini metric grid,
plus a client-side **CSV export** (ShareSheet). Program-wide, read-only. Reached from the Members tab metrics
card, which only shows for `isProgramAdmin` (run 55) — but the screen itself has no internal role gate.

## 2. Why it exists

The Members tab card is a small preview; tapping it opens the full ranked table with search / sort / filter,
the iOS analogue of web `/members/metrics`. It re-fetches on every control change (server-driven). Read-only —
no logging, no lock.

## 3. Route / location

- **App:** `ios`. **Reached via:** `AdminMembersTab` metrics-preview card → `MemberMetricsDetailView()` (no args;
  reads all state from `ProgramContext`).
- **Leaves to:** the `SortSheet` + `FilterSheet` modals; back only. No forward-nav (leaf detail).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Search field | `TextField` "Search member" → re-fetch on commit / clear. | legacy `:262-284` |
| Sort + Filter buttons | open `SortSheet` (9 `SortField` cases) / `FilterSheet`. | legacy `:286-328` |
| Content list | `MemberMetricsCard(metric:hero:)` per member; loading skeletons; "No members to display." empty. | legacy `:331-360` |
| Export toolbar | `square.and.arrow.up` → `exportCSV()` → temp `.csv` → `ShareSheet`; disabled when empty. | legacy `:242-254`, `:377-403` |
| `SortSheet` | Form: `SortField` list (checkmark on current) + Direction segmented picker. | legacy MemberPickerOverviewView `:303-336` |
| `FilterSheet` | Form: date-mode (All/Custom) + 9 min/max range sections; Clear-all / Done. | legacy `:338-410` |

## 5. Components + features consumed

- **New this run (`Features/Home/Detail/MemberMetricsDetailView.swift`):** `MetricsFilters`, `SortSheet`, `FilterSheet`.
- **Reused (run 55, `MemberOverviewPicker.swift`):** `SortField`, `SortDirection`, `MemberMetricsCard` — NOT redefined.
- **Reused (foundation):** `ShareSheet`/`ShareItem`.
- **Features:** none as a module — reads `ProgramContext` (`memberMetrics`, `memberMetricsRangeStart/End`, `name`,
  `startDate`) and calls `loadMemberMetrics` directly (faithful).

## 6. Data / API

- **`GET /member-metrics?search=&sort=&direction=&…filters…`** (`ProgramContext.loadMemberMetrics`) — server does the
  search / sort / filter; sets `memberMetrics` + the range dates. CSV export is client-side (no endpoint).
- Read-only; `admin_only_data_entry` **N/A**.

## 7. Role-based view rules

| Viewer | Sees |
|--------|------|
| global_admin / program admin | Full metrics grid + search / sort / filter + Export (the Members tab card links here for `isProgramAdmin`). |
| logger / member | **No role gate on the screen** — the backend `getMemberMetrics` enforces only `ensureProgramAccess`, so any active member reaching it directly sees the full program-wide grid; the Members tab card just doesn't surface the link for them (entry-path asymmetry, F2 — mirrors web F2). |

**`admin_only_data_entry` = N/A** — read-only (no logging).

## 8. States & edge cases

- **Loading:** `isLoading` → 3 redacted skeleton cards.
- **Empty:** `memberMetrics.isEmpty` → "No members to display."
- **Control change:** `.onChange` of sortField / sortDirection / filters / `programId` re-fetches.
- **Error:** `loadMemberMetrics` swallows failures (no `errorMessage` surfaced) — both web + legacy iOS swallow → parity.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | Ported as part of the **Members detail cluster** (run-58→62 cohesive-cluster precedent) with streaks / recent / health. Leaf view — no forward-nav to defer; the deferred stub removed. | run-62; `AdminMembersTab.swift:45`. |
| **D-S1** | **Stance = faithful 1:1.** Both web `/members/metrics` AND legacy iOS agree on the shape (server-driven search/sort/filter, client CSV) → faithful IS web parity (run-55/56 both-agree). No web-parity ADD. | legacy file; web SPEC; user answer. |
| **D-REF** | **Keep iOS-native.** Reached via a `NavigationLink` push (vs web's route); the metric set + role posture already match web → platform idiom, not a gap. `consumed_by=[ios]`. | run-52/53; [[ios-matches-web-not-just-legacy]]. |
| **D-DEPS** | **No new dependency** — `SortField`/`SortDirection`/`MemberMetricsCard` already ported (run 55), `ShareSheet` + `loadMemberMetrics` + all DTOs in the foundation (run 50). Only the view-local `MetricsFilters`/`SortSheet`/`FilterSheet` port co-located. | collision grep; run-50/55. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Server-driven sort/filter/search** — every control change re-fetches (not client-side filtered); mirrors web F1. | `MemberMetricsDetailView.swift` `.onChange` | Kept (faithful). |
| **F2** | **Entry-path asymmetry** — the Members tab links here only for `isProgramAdmin`, but the screen + backend (`ensureProgramAccess`) allow any active member reaching it directly (mirrors web F2). | `AdminMembersTab.swift:45`; backend | Kept (faithful); backend is the real boundary. |
| **F3** | **Client CSV export** (no server endpoint) — mirrors web F4. | `exportCSV()` | Kept (faithful). |
| **F4** | **Hero metric is sort-coupled** (the big number follows `sortField`) — mirrors web F5. | `MemberMetricsCard(hero:)` | Kept (faithful). |
| **F5** | **`showShare` @State is vestigial** — declared but unused (the sheet drives off `shareItem`). | `MemberMetricsDetailView.swift` | Kept (faithful); drop on a rebuild sweep. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 63) — the Members **metrics-detail table**, ported into `apps/ios/.../Features/Home/Detail/MemberMetricsDetailView.swift` (+ co-located `MetricsFilters`/`SortSheet`/`FilterSheet`); deferred stub removed. **D-SCOPE** (Members detail cluster) · **D-S1** (faithful 1:1 — both-agree = web parity) · **D-REF** (keep iOS-native; `consumed_by=[ios]`) · **D-DEPS** (no new dep — `SortField`/`SortDirection`/`MemberMetricsCard` reused from run 55). Flagged F1–F5. Read-only → `admin_only_data_entry` N/A. Build green-check owned by the user (Xcode); symbols grep-verified. |
